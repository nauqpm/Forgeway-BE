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

  // ─── Get or create an in-memory Y.Doc for a page ──────────────

  private async getOrCreateDoc(pageId: string): Promise<Y.Doc> {
    const existing = this.docs.get(pageId);
    if (existing) return existing;

    const ydoc = new Y.Doc();

    // Try to restore from persisted draft
    const draft = await this.pageDraftModel
      .findOne({ pageId: new Types.ObjectId(pageId) })
      .lean()
      .exec();

    if (draft?.yjsState) {
      const stateArray = new Uint8Array(draft.yjsState);
      Y.applyUpdate(ydoc, stateArray);
    } else {
      // No Yjs state yet — initialize from persisted Page content
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
  }

  // ─── Get full Yjs state + fallback content for page:join ──────

  async getYjsState(
    pageId: string,
  ): Promise<{ yjsState: number[]; content: string; title: string }> {
    const ydoc = await this.getOrCreateDoc(pageId);
    const stateUpdate = Y.encodeStateAsUpdate(ydoc);

    // Derive title from Y.Text
    const yTitle = ydoc.getText('title');
    const title = yTitle.toString();

    // Get HTML content fallback from draft or main page
    const draft = await this.pageDraftModel
      .findOne({ pageId: new Types.ObjectId(pageId) })
      .lean()
      .exec();

    let content = draft?.content || '';
    if (!content) {
      const page = await this.pagesService.findById(pageId);
      content = page.content;
    }

    return {
      yjsState: Array.from(stateUpdate),
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
    const ydoc = await this.getOrCreateDoc(pageId);

    // Apply the incremental update to in-memory doc
    Y.applyUpdate(ydoc, update);

    // Derive content and title from the updated Y.Doc
    const yTitle = ydoc.getText('title');
    const title = yTitle.toString();

    // Persist updated state to MongoDB
    const fullState = Y.encodeStateAsUpdate(ydoc);

    await this.pageDraftModel.findOneAndUpdate(
      { pageId: new Types.ObjectId(pageId) },
      {
        yjsState: Buffer.from(fullState),
        title,
        lastEditedBy: new Types.ObjectId(userId),
      },
      { upsert: true, new: true },
    );
  }

  // ─── Flush draft to main page (called by Update button) ───────

  async flushDraft(pageId: string): Promise<void> {
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

      // Build update payload from draft
      const updatePayload: { content?: string; title?: string } = {};
      if (draft.content) {
        updatePayload.content = draft.content;
      }
      if (draft.title) {
        updatePayload.title = draft.title;
      }

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
    await this.pageDraftModel.findOneAndUpdate(
      { pageId: new Types.ObjectId(pageId) },
      { content, title },
      { upsert: true, new: true },
    );
  }

  // ─── Cleanup when room empties ────────────────────────────────

  cleanupDoc(pageId: string): void {
    const ydoc = this.docs.get(pageId);
    if (ydoc) {
      ydoc.destroy();
      this.docs.delete(pageId);
      this.logger.debug(`Cleaned up in-memory Y.Doc for page ${pageId}`);
    }
  }
}
