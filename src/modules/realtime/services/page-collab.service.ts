import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
// @ts-ignore
import * as Y from 'yjs';

import {
  PageDraft,
  PageDraftDocument,
} from '@/modules/pages/schemas/page-draft.schema';
import { PagesService } from '@/modules/pages/services/pages.service';

/** Full Yjs snapshot returned to a joining client */
export interface YjsPageState {
  yjsState: number[];
  stateVector: number[];
  title: string;
}

@Injectable()
export class PageCollabService {
  private readonly logger = new Logger(PageCollabService.name);

  /**
   * Keyed by pageId → a Promise<Y.Doc> so that concurrent calls for
   * the same page wait on a single init rather than racing.
   */
  private readonly docs = new Map<string, Promise<Y.Doc>>();

  /** Debounce timers for async DB writes (one per pageId) */
  private readonly saveTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Inactivity-unload timers.  When a room becomes empty the doc is
   * flushed to the DB and evicted from memory after UNLOAD_DELAY_MS.
   */
  private readonly unloadTimers = new Map<string, NodeJS.Timeout>();

  private readonly SAVE_DEBOUNCE_MS = 2_000;
  private readonly UNLOAD_DELAY_MS = 5 * 60_000; // 5 min idle → evict

  constructor(
    @InjectModel(PageDraft.name)
    private readonly pageDraftModel: Model<PageDraftDocument>,
    private readonly pagesService: PagesService,
  ) {}

  // ─── Public API ────────────────────────────────────────────────

  /**
   * Called by the gateway on `page:join`.
   * Returns the full Yjs state the client needs to bootstrap its Y.Doc.
   */
  async getYjsState(pageId: string): Promise<YjsPageState> {
    const ydoc = await this.getOrCreate(pageId);

    // A new join resets the unload countdown
    this.scheduleUnload(pageId);

    const stateUpdate = Y.encodeStateAsUpdate(ydoc);
    const stateVector = Y.encodeStateVector(ydoc);

    return {
      yjsState: Array.from(stateUpdate),
      stateVector: Array.from(stateVector),
      title: ydoc.getText('title').toString(),
    };
  }

  /**
   * Called by the gateway on `page:yjs-update`.
   * Throws on corrupted data so the gateway can return `{ ok: false }`
   * and avoid relaying bad bytes to peers.
   */
  async applyUpdate(
    pageId: string,
    update: Uint8Array,
    userId: string,
  ): Promise<void> {
    if (!update?.length || update.length > 1_000_000) {
      this.logger.warn(
        `Rejected oversized/empty Yjs update from user ${userId} for page ${pageId}`,
      );
      throw new Error('invalid_update');
    }

    const ydoc = await this.getOrCreate(pageId);

    // May throw if bytes are corrupted — intentionally propagated
    Y.applyUpdate(ydoc, update, userId);

    this.scheduleSave(pageId);
    this.scheduleUnload(pageId);
  }

  /**
   * Called on `page:publish`.
   * Flushes the current Yjs state to the main Page document.
   */
  async publishToPage(
    pageId: string,
    userId: string,
    title: string,
    content: string,
  ): Promise<void> {
    const ydoc = await this.getOrCreate(pageId);

    // Persist Yjs state synchronously so the draft is always up-to-date
    await this.persistDoc(pageId, ydoc);

    // Cancel any in-flight debounced save — we just wrote manually
    this.clearSaveTimer(pageId);

    await this.pagesService.update(pageId, { title, content }, userId);
  }

  /**
   * Called when the room becomes empty (last client left).
   * Triggers a timed eviction rather than an immediate one so a
   * fast page-reload doesn't pay full cold-start cost.
   */
  scheduleRoomEmpty(pageId: string): void {
    this.scheduleUnload(pageId);
  }

  /**
   * Force-evict immediately (e.g. from admin tooling or tests).
   * Safe to call even if pageId is not loaded.
   */
  async evict(pageId: string): Promise<void> {
    this.clearSaveTimer(pageId);
    this.clearUnloadTimer(pageId);

    const docPromise = this.docs.get(pageId);
    if (!docPromise) return;

    this.docs.delete(pageId);

    try {
      const ydoc = await docPromise;
      await this.persistDoc(pageId, ydoc);
      ydoc.destroy();
    } catch (err) {
      this.logger.error(`evict: failed to flush page ${pageId}`, err);
    }
  }

  // ─── Internal helpers ──────────────────────────────────────────

  /**
   * Returns an existing in-memory Y.Doc or loads one from the DB.
   * The single Promise<Y.Doc> per pageId prevents concurrent init races.
   */
  private getOrCreate(pageId: string): Promise<Y.Doc> {
    const existing = this.docs.get(pageId);
    if (existing) return existing;

    const promise = this.initDoc(pageId).catch(err => {
      // Clean up so the next call retries from scratch
      this.docs.delete(pageId);
      throw err;
    });

    this.docs.set(pageId, promise);
    return promise;
  }

  private async initDoc(pageId: string): Promise<Y.Doc> {
    const ydoc = new Y.Doc();

    const draft = await this.pageDraftModel
      .findOne({ pageId: new Types.ObjectId(pageId) })
      .lean()
      .exec();

    if (draft?.yjsState) {
      // ── Happy path: restore from persisted Yjs snapshot ──────
      try {
        Y.applyUpdate(
          ydoc,
          new Uint8Array(Uint8Array.from(draft.yjsState)),
          'server-bootstrap',
        );
      } catch (err) {
        this.logger.warn(
          `Corrupted yjsState for page ${pageId}, rebuilding from text fields: ${(err as Error).message}`,
        );
        // Fall through to text-based reconstruction below
        this.bootstrapFromText(ydoc, draft.title, draft.content);
        await this.persistDoc(pageId, ydoc); // self-heal: overwrite bad bytes
      }
    } else if (draft) {
      // ── Draft exists but no binary state yet ─────────────────
      this.bootstrapFromText(ydoc, draft.title, draft.content);
      await this.persistDoc(pageId, ydoc);
    } else {
      // ── No draft at all — seed from the published page ───────
      const page = await this.pagesService.findById(pageId);
      this.bootstrapFromText(ydoc, page.title, page.content);

      await this.pageDraftModel.create({
        pageId: new Types.ObjectId(pageId),
        title: page.title,
        content: page.content,
        yjsState: Buffer.from(Y.encodeStateAsUpdate(ydoc)),
        lastEditedBy: null,
      });
    }

    return ydoc;
  }

  /**
   * Atomically set Y.Text 'title' and 'content' from plain strings.
   * Used when there is no binary Yjs state to restore from.
   */
  private bootstrapFromText(ydoc: Y.Doc, title: string, content: string): void {
    ydoc.transact(() => {
      replaceYText(ydoc.getText('title'), title || '');
      replaceYText(ydoc.getText('content'), content || '');
    }, 'server-bootstrap');
  }

  private async persistDoc(pageId: string, ydoc: Y.Doc): Promise<void> {
    const yjsState = Y.encodeStateAsUpdate(ydoc);
    const title = ydoc.getText('title').toString();
    const content = ydoc.getText('content').toString();

    await this.pageDraftModel.findOneAndUpdate(
      { pageId: new Types.ObjectId(pageId) },
      {
        yjsState: Buffer.from(yjsState),
        title,
        content,
      },
      { upsert: true, new: true },
    );
  }

  // ─── Timer helpers ─────────────────────────────────────────────

  private scheduleSave(pageId: string): void {
    this.clearSaveTimer(pageId);
    this.saveTimers.set(
      pageId,
      setTimeout(async () => {
        this.saveTimers.delete(pageId);
        try {
          const docPromise = this.docs.get(pageId);
          if (!docPromise) return;
          const ydoc = await docPromise;
          await this.persistDoc(pageId, ydoc);
        } catch (err) {
          this.logger.error(`scheduleSave: failed for page ${pageId}`, err);
        }
      }, this.SAVE_DEBOUNCE_MS),
    );
  }

  private scheduleUnload(pageId: string): void {
    this.clearUnloadTimer(pageId);
    this.unloadTimers.set(
      pageId,
      setTimeout(async () => {
        this.unloadTimers.delete(pageId);
        await this.evict(pageId);
        this.logger.log(`Evicted idle Y.Doc for page ${pageId}`);
      }, this.UNLOAD_DELAY_MS),
    );
  }

  private clearSaveTimer(pageId: string): void {
    const t = this.saveTimers.get(pageId);
    if (t) {
      clearTimeout(t);
      this.saveTimers.delete(pageId);
    }
  }

  private clearUnloadTimer(pageId: string): void {
    const t = this.unloadTimers.get(pageId);
    if (t) {
      clearTimeout(t);
      this.unloadTimers.delete(pageId);
    }
  }
}

// ─── Util ──────────────────────────────────────────────────────────

/** Diff-friendly Y.Text replacement — minimal CRDT operations - use for bootstrap*/
function replaceYText(text: Y.Text, next: string): void {
  const curr = text.toString();
  if (curr === next) return;

  let pre = 0;
  while (pre < curr.length && pre < next.length && curr[pre] === next[pre]) {
    pre++;
  }

  let suf = 0;
  while (
    suf < curr.length - pre &&
    suf < next.length - pre &&
    curr[curr.length - 1 - suf] === next[next.length - 1 - suf]
  ) {
    suf++;
  }

  const deleteLen = curr.length - pre - suf;
  const insertStr = next.slice(pre, next.length - suf || undefined);

  if (deleteLen > 0) text.delete(pre, deleteLen);
  if (insertStr) text.insert(pre, insertStr);
}
