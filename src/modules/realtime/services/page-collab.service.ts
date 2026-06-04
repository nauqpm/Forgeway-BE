import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  PageDraft,
  PageDraftDocument,
} from '@/modules/pages/schemas/page-draft.schema';
import { PagesService } from '@/modules/pages/services/pages.service';

@Injectable()
export class PageCollabService {
  private readonly logger = new Logger(PageCollabService.name);

  /** Debounce timers keyed by pageId string */
  private readonly flushTimers = new Map<string, NodeJS.Timeout>();

  /** Debounce duration in milliseconds */
  private readonly FLUSH_DELAY_MS = 10_000;

  constructor(
    @InjectModel(PageDraft.name)
    private readonly pageDraftModel: Model<PageDraftDocument>,
    private readonly pagesService: PagesService,
  ) {}

  /**
   * Get the current draft content for a page.
   * Falls back to the persisted Page content if no draft exists.
   */
  async getDraft(pageId: string): Promise<string> {
    const draft = await this.pageDraftModel
      .findOne({ pageId: new Types.ObjectId(pageId) })
      .lean()
      .exec();

    if (draft) {
      return draft.content;
    }

    // No draft yet — return persisted Page content
    const page = await this.pagesService.findById(pageId);
    return page.content;
  }

  /**
   * Handle an incoming content update from a client.
   * Upserts the draft and resets the debounce flush timer.
   */
  async handleUpdate(
    userId: string,
    pageId: string,
    content: string,
  ): Promise<void> {
    // Upsert the draft document
    await this.pageDraftModel.findOneAndUpdate(
      { pageId: new Types.ObjectId(pageId) },
      {
        content,
        lastEditedBy: new Types.ObjectId(userId),
      },
      { upsert: true, new: true },
    );

    // Reset debounce timer
    this.resetFlushTimer(pageId);
  }

  /**
   * Flush draft content into the main Page collection.
   */
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
      await this.pagesService.update(
        pageId,
        { content: draft.content },
        editorId,
      );
      this.logger.debug(`Flushed draft to Page ${pageId}`);
    } catch (error) {
      this.logger.error(
        `Failed to flush draft for page ${pageId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Flush draft immediately if no clients remain in the page room.
   */
  async flushDraftIfRoomEmpty(
    pageId: string,
    roomClientCount: number,
  ): Promise<void> {
    if (roomClientCount === 0) {
      this.clearFlushTimer(pageId);
      await this.flushDraft(pageId);
      this.logger.debug(
        `Room empty — flushed draft for page ${pageId}`,
      );
    }
  }

  /**
   * Clear any pending flush timer for a page.
   */
  private clearFlushTimer(pageId: string): void {
    const existing = this.flushTimers.get(pageId);
    if (existing) {
      clearTimeout(existing);
      this.flushTimers.delete(pageId);
    }
  }

  /**
   * Reset the debounce flush timer for a page.
   * After FLUSH_DELAY_MS of inactivity, flushDraft is called.
   */
  private resetFlushTimer(pageId: string): void {
    this.clearFlushTimer(pageId);

    const timer = setTimeout(async () => {
      this.flushTimers.delete(pageId);
      await this.flushDraft(pageId);
    }, this.FLUSH_DELAY_MS);

    this.flushTimers.set(pageId, timer);
  }
}
