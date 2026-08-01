import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientSession, Connection, Model } from 'mongoose';
import {
  STORY_CONTRACT_STATUS,
  STORY_DRAFT_STATUS,
} from '../constants/story-contract.constants';
import { canonicalSnapshot } from '../utils/story-content-hash.util';
import {
  computeStoryVersionChangeSet,
  StructuredStoryChange,
} from './story-version-diff.service';
import { createStoryContractEvent } from '../events/story-contract.events';

@Injectable()
export class StoryDraftRebaseService {
  constructor(
    @InjectModel('StoryDraft') private readonly draftModel: Model<any>,
    @InjectModel('StoryContract') private readonly contractModel: Model<any>,
    @InjectModel('StoryVersion') private readonly versionModel: Model<any>,
    @InjectConnection() private readonly connection: Connection,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async rebase(
    workspaceId: string,
    storyContractId: string,
    staleDraftId: string,
    userId: string,
  ) {
    const draft = await this.withTransaction(async session => {
      const staleDraft = await this.draftModel.findOne(
        {
          _id: staleDraftId,
          workspaceId,
          storyContractId,
          status: STORY_DRAFT_STATUS.STALE,
        },
        null,
        { session },
      );
      if (!staleDraft) {
        throw new NotFoundException('Story draft not found');
      }

      const contract = await this.contractModel.findOne(
        {
          _id: storyContractId,
          workspaceId,
          status: STORY_CONTRACT_STATUS.ACTIVE,
          currentApprovedStoryVersionId: { $ne: null },
        },
        null,
        { session },
      );
      if (!contract) {
        throw new NotFoundException('Story contract not found');
      }
      const currentVersionId = String(contract.currentApprovedStoryVersionId);
      const baseVersion = staleDraft.baseStoryVersionId
        ? await this.findVersion(
            workspaceId,
            storyContractId,
            String(staleDraft.baseStoryVersionId),
            session,
          )
        : {
            _id: 'EMPTY',
            workspaceId,
            storyContractId,
            contentHash: '',
            contentSnapshot: {},
            requirementLinkSnapshot: [],
            criteria: [],
            decisionRecordIds: [],
          };
      const currentVersion = await this.findVersion(
        workspaceId,
        storyContractId,
        currentVersionId,
        session,
      );
      const changeSet = computeStoryVersionChangeSet(
        baseVersion,
        currentVersion,
      );
      const [draft] = await this.draftModel.create(
        [
          {
            workspaceId,
            storyContractId,
            baseStoryVersionId: currentVersionId,
            status: STORY_DRAFT_STATUS.ACTIVE,
            draftRevision: 1,
            content: canonicalSnapshot(staleDraft.content ?? {}),
            requirementLinks: (staleDraft.requirementLinks ?? []).map(
              (link: any) => ({
                requirementId: link.requirementId,
                role: link.role,
                evidenceNote: link.evidenceNote ?? '',
              }),
            ),
            criterionInputs: canonicalSnapshot(
              staleDraft.criterionInputs ?? [],
            ),
            decisionProposalIds: (staleDraft.decisionProposalIds ?? []).map(
              String,
            ),
            rebasedFromDraftId: staleDraftId,
            rebaseConflicts: this.conflicts(changeSet),
            createdBy: userId,
            updatedBy: userId,
          },
        ],
        { session },
      );
      return draft;
    });
    const event = createStoryContractEvent('story.draft.rebased', {
      workspaceId,
      aggregateId: storyContractId,
      actorId: userId,
      staleDraftId,
      draftId: String(draft._id),
    });
    this.events?.emit(event.type, event);
    return draft;
  }

  private async findVersion(
    workspaceId: string,
    storyContractId: string,
    storyVersionId: string,
    session: ClientSession,
  ) {
    const version = await this.versionModel.findOne(
      { _id: storyVersionId, workspaceId, storyContractId },
      null,
      { session },
    );
    if (!version) {
      throw new NotFoundException('Story version not found');
    }
    return version;
  }

  private conflicts(
    changeSet: ReturnType<typeof computeStoryVersionChangeSet>,
  ) {
    const groups: Array<[string, StructuredStoryChange[]]> = [
      ['scope', changeSet.scopeChanges],
      ['businessRule', changeSet.businessRuleChanges],
      ['permission', changeSet.permissionChanges],
      ['requirement', changeSet.requirementChanges],
      ['acceptanceCriterion', changeSet.acceptanceCriterionChanges],
      ['decision', changeSet.decisionChanges],
      ['dependency', changeSet.dependencyChanges],
    ];
    return groups.flatMap(([category, changes]) =>
      changes.map(change => ({
        category,
        fromStoryVersionId: changeSet.fromStoryVersionId,
        toStoryVersionId: changeSet.toStoryVersionId,
        ...change,
        resolution: 'UNRESOLVED',
      })),
    );
  }

  private async withTransaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(() => work(session));
    } finally {
      await session.endSession();
    }
  }
}
