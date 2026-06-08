import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as Y from 'yjs';

import {
  PageDraft,
  PageDraftDocument,
} from '@/modules/pages/schemas/page-draft.schema';
import { PagesService } from '@/modules/pages/services/pages.service';

@Injectable()
export class PageCollabService {
  private readonly logger = new Logger(PageCollabService.name);

  /**
   * In-memory Y.Doc instances keyed by pageId.
   * Loaded from DB on first access, kept in memory while the room is active.
   */
  private readonly docs = new Map<string, Y.Doc>();

  constructor(
    @InjectModel(PageDraft.name)
    private readonly pageDraftModel: Model<PageDraftDocument>,
    private readonly pagesService: PagesService,
  ) {}

  /**
   * Pending initialization promises to prevent race conditions during concurrent accesses.
   */
  private readonly initPromises = new Map<string, Promise<Y.Doc>>();

  // ─── Get or create an in-memory Y.Doc for a page ──────────────

  private async getOrCreateDoc(pageId: string): Promise<Y.Doc> {
    const existing = this.docs.get(pageId);
    if (existing) return existing;

    let initPromise = this.initPromises.get(pageId);
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const ydoc = new Y.Doc();

      // Try to restore from persisted draft
      const draft = await this.pageDraftModel
        .findOne({ pageId: new Types.ObjectId(pageId) })
        .lean()
        .exec();

      let restoredFromDraft = false;

      if (draft?.yjsState) {
        try {
          const stateArray = new Uint8Array(draft.yjsState);
          Y.applyUpdate(ydoc, stateArray);
          restoredFromDraft = true;
        } catch (error) {
          this.logger.warn(
            `Corrupted Yjs state in draft for page ${pageId}, starting fresh: ${(error as Error).message}`,
          );
        }
      }

      if (!restoredFromDraft) {
        // No Yjs state yet (or corrupted) — initialize from persisted Page content
        const page = await this.pagesService.findById(pageId);

        // Set title in Y.Text
        const yTitle = ydoc.getText('title');
        if (page.title) {
          yTitle.insert(0, page.title);
        }

        // Content will be initialized by the first client that joins
        // (TipTap Collaboration extension handles initial content injection)
      }

      this.docs.set(pageId, ydoc);
      return ydoc;
    })();

    this.initPromises.set(pageId, initPromise);

    try {
      return await initPromise;
    } finally {
      this.initPromises.delete(pageId);
    }
  }

  // ─── Get full Yjs state + fallback content for page:join ──────

  async getYjsState(pageId: string): Promise<{
    yjsState: number[];
    stateVector: number[];
    content: string;
    title: string;
  }> {
    // getOrCreateDoc already queries the draft; fetch it in parallel to avoid a
    // second round-trip for the content fallback below.
    const [ydoc, draft] = await Promise.all([
      this.getOrCreateDoc(pageId),
      this.pageDraftModel
        .findOne({ pageId: new Types.ObjectId(pageId) })
        .lean()
        .exec(),
    ]);

    const stateUpdate = Y.encodeStateAsUpdate(ydoc);
    const stateVector = Y.encodeStateVector(ydoc);
    const title = ydoc.getText('title').toString();

    let content = draft?.content || '';
    if (!content) {
      const page = await this.pagesService.findById(pageId);
      content = page.content;
    }

    return {
      yjsState: Array.from(stateUpdate),
      stateVector: Array.from(stateVector),
      content,
      title: title || (draft?.title ?? ''),
    };
  }

  // ─── Apply an incremental Yjs update from a client ────────────

  async applyYjsUpdate(
    userId: string,
    pageId: string,
    update: Uint8Array,
  ): Promise<void> {
    // Validate that the update is non-empty
    if (!update || update.length === 0) {
      this.logger.warn(
        `Received empty Yjs update for page ${pageId} from user ${userId}`,
      );
      return;
    }

    const ydoc = await this.getOrCreateDoc(pageId);

    try {
      // Apply the incremental update to in-memory doc
      Y.applyUpdate(ydoc, update);
    } catch (error) {
      this.logger.error(
        `Failed to apply Yjs update for page ${pageId} from user ${userId}: ${(error as Error).message}`,
      );
      // Re-throw so the gateway can return { ok: false } and skip relaying the
      // corrupted update to other clients. A single bad update should not crash
      // the room — the gateway handles this gracefully.
      throw error;
    }
  }

  // ─── Flush draft to main page (called by Update button) ───────

  async flushDraft(pageId: string): Promise<void> {
    // Prefer the live in-memory Yjs state to avoid a stale DB snapshot.
    // Fall back to the persisted draft if the room has already been cleaned up.
    const liveTitleFromYjs = this.docs.get(pageId)?.getText('title').toString();

    const draft = await this.pageDraftModel
      .findOne({ pageId: new Types.ObjectId(pageId) })
      .lean()
      .exec();

    if (!draft) {
      this.logger.debug(`No draft to flush for page ${pageId}`);
      return;
    }

    try {
      const editorId = draft.lastEditedBy?.toString() ?? '';

      const updatePayload: { content?: string; title?: string } = {};
      if (draft.content) updatePayload.content = draft.content;

      // Use the live Yjs title when available — it's always more recent than
      // the periodically-persisted draft.title.
      const title = liveTitleFromYjs ?? draft.title;
      if (title) updatePayload.title = title;

      if (Object.keys(updatePayload).length > 0) {
        await this.pagesService.update(pageId, updatePayload, editorId);
      }

      this.logger.debug(`Flushed draft to Page ${pageId}`);
    } catch (error) {
      this.logger.error(
        `Failed to flush draft for page ${pageId}: ${(error as Error).message}`,
      );
    }
  }

  // ─── Update derived HTML content in draft (from FE) ───────────

  async updateDraftContent(
    pageId: string,
    content: string,
    title: string,
  ): Promise<void> {
    const ydoc = this.docs.get(pageId);
    const updatePayload: { content: string; title: string; yjsState?: Buffer } =
      {
        content,
        title,
      };
    if (ydoc) {
      updatePayload.yjsState = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    }

    await this.pageDraftModel.findOneAndUpdate(
      { pageId: new Types.ObjectId(pageId) },
      updatePayload,
      { upsert: true, new: true },
    );
  }

  // ─── Cleanup when room empties ────────────────────────────────

  async cleanupDoc(pageId: string): Promise<void> {
    const ydoc = this.docs.get(pageId);
    if (ydoc) {
      // Persist final state before destroying
      try {
        const fullState = Y.encodeStateAsUpdate(ydoc);
        const title = ydoc.getText('title').toString();
        await this.pageDraftModel.findOneAndUpdate(
          { pageId: new Types.ObjectId(pageId) },
          { yjsState: Buffer.from(fullState), title },
          { upsert: true },
        );
      } catch (error) {
        this.logger.error(
          `Failed to save Yjs state during cleanup for ${pageId}`,
          error,
        );
      }

      ydoc.destroy();
      this.docs.delete(pageId);
      this.logger.debug(`Cleaned up in-memory Y.Doc for page ${pageId}`);
    }
  }
}
