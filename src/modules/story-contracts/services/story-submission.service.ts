import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientSession, Connection, Model } from 'mongoose';
import { RequirementsService } from '../../requirements/requirements.service';
import {
  CRITERION_KEY_DUPLICATE,
  DECISION_PROPOSAL_STATE,
  DRAFT_BASE_VERSION_STALE,
  INVALID_ACCEPTANCE_CRITERION,
  PRIMARY_REQUIREMENT_REQUIRED,
  ACCEPTANCE_CRITERION_PRIORITY,
  STORY_CONTRACT_STATUS,
  STORY_DRAFT_STATUS,
  STORY_REQUIREMENT_ROLE,
} from '../constants/story-contract.constants';
import {
  canonicalSnapshot,
  createStoryContentHash,
} from '../utils/story-content-hash.util';
import { createStoryContractEvent } from '../events/story-contract.events';
import {
  AcceptanceCriterionInput,
  AcceptanceCriterionService,
} from './acceptance-criterion.service';
import {
  isStoryOperationReplay,
  runStoryOperation,
} from '../utils/story-operation.util';

type DraftRequirementLink = {
  requirementId: string;
  role: string;
  evidenceNote?: string;
};

@Injectable()
export class StorySubmissionService {
  constructor(
    @InjectModel('StoryDraft') private readonly draftModel: Model<any>,
    @InjectModel('StoryContract') private readonly contractModel: Model<any>,
    @InjectModel('StoryVersion') private readonly versionModel: Model<any>,
    @InjectModel('StoryRequirementLink')
    private readonly requirementLinkModel: Model<any>,
    @InjectModel('DecisionProposal')
    private readonly decisionProposalModel: Model<any>,
    @InjectModel('DecisionRecord')
    private readonly decisionRecordModel: Model<any>,
    private readonly requirementsService: RequirementsService,
    private readonly acceptanceCriteria: AcceptanceCriterionService,
    @InjectConnection() private readonly connection: Connection,
    private readonly events: EventEmitter2,
    @Optional()
    @InjectModel('StoryOperation')
    private readonly operationModel?: Model<any>,
  ) {}

  async submit(
    workspaceId: string,
    storyContractId: string,
    draftId: string,
    userId: string,
    idempotencyKey?: string,
  ) {
    const version = await runStoryOperation(
      this.connection,
      this.operationModel,
      {
        workspaceId,
        actorId: userId,
        operation: 'story.submit',
        key: idempotencyKey,
        resourceId: draftId,
        request: { storyContractId, draftId },
      },
      async session => {
        const draft = await this.draftModel.findOne(
          {
            _id: draftId,
            workspaceId,
            storyContractId,
            status: STORY_DRAFT_STATUS.ACTIVE,
          },
          null,
          { session },
        );
        if (!draft) {
          const scopedDraft = await this.draftModel.findOne(
            { _id: draftId, workspaceId, storyContractId },
            null,
            { session },
          );
          if (scopedDraft?.status === STORY_DRAFT_STATUS.STALE) {
            throw new ConflictException({
              code: DRAFT_BASE_VERSION_STALE,
              message: DRAFT_BASE_VERSION_STALE,
            });
          }
          throw new NotFoundException('Story draft not found');
        }

        const requirementLinks =
          (draft.requirementLinks as DraftRequirementLink[]) ?? [];
        if (
          requirementLinks.filter(
            link => link.role === STORY_REQUIREMENT_ROLE.PRIMARY,
          ).length !== 1
        ) {
          throw new BadRequestException({
            code: PRIMARY_REQUIREMENT_REQUIRED,
            message: PRIMARY_REQUIREMENT_REQUIRED,
          });
        }
        await Promise.all(
          requirementLinks.map(link =>
            this.requirementsService.findById(
              workspaceId,
              String(link.requirementId),
            ),
          ),
        );

        const criterionInputs =
          (draft.criterionInputs as AcceptanceCriterionInput[]) ?? [];
        if (
          !Array.isArray(criterionInputs) ||
          criterionInputs.some(
            input =>
              !input ||
              typeof input.key !== 'string' ||
              !input.key.trim() ||
              typeof input.statement !== 'string' ||
              !input.statement.trim() ||
              typeof input.verificationMethod !== 'string' ||
              !input.verificationMethod.trim() ||
              !Object.values(ACCEPTANCE_CRITERION_PRIORITY).includes(
                input.priority,
              ),
          )
        ) {
          throw new BadRequestException({
            code: INVALID_ACCEPTANCE_CRITERION,
            message: INVALID_ACCEPTANCE_CRITERION,
          });
        }
        const criterionKeys = criterionInputs.map(input => input.key.trim());
        if (new Set(criterionKeys).size !== criterionKeys.length) {
          throw new BadRequestException({
            code: CRITERION_KEY_DUPLICATE,
            message: CRITERION_KEY_DUPLICATE,
          });
        }
        const decisionRecordIds = canonicalSnapshot(
          await this.resolveDecisionRecordIds(
            workspaceId,
            storyContractId,
            (draft.decisionProposalIds ?? []).map(String),
            session,
          ),
        );

        const contract = await this.contractModel.findOneAndUpdate(
          {
            _id: storyContractId,
            workspaceId,
            status: STORY_CONTRACT_STATUS.ACTIVE,
            currentApprovedStoryVersionId: draft.baseStoryVersionId ?? null,
          },
          {
            $inc: { latestStoryVersionNumber: 1, version: 1 },
          },
          { new: true, session },
        );
        if (!contract) {
          const activeContract = await this.contractModel.findOne(
            {
              _id: storyContractId,
              workspaceId,
              status: STORY_CONTRACT_STATUS.ACTIVE,
            },
            null,
            { session },
          );
          if (activeContract) {
            throw new ConflictException({
              code: DRAFT_BASE_VERSION_STALE,
              message: DRAFT_BASE_VERSION_STALE,
            });
          }
          throw new NotFoundException('Story draft not found');
        }

        const criteria = await this.acceptanceCriteria.resolveForSubmission(
          workspaceId,
          storyContractId,
          criterionInputs,
          userId,
          session,
        );
        const contentSnapshot = canonicalSnapshot(draft.content ?? {});
        const requirementLinkSnapshot = canonicalSnapshot(
          requirementLinks.map(link => ({
            requirementId: String(link.requirementId),
            relationship: link.role,
            evidenceNote: link.evidenceNote?.trim() ?? '',
          })),
        );
        const snapshot = {
          contentSnapshot,
          requirementLinkSnapshot,
          criteria: canonicalSnapshot(criteria),
          decisionRecordIds,
        };
        const submittedAt = new Date();
        const [version] = await this.versionModel.create(
          [
            {
              workspaceId,
              storyContractId,
              versionNumber: contract.latestStoryVersionNumber,
              sourceDraftId: draftId,
              baseStoryVersionId: draft.baseStoryVersionId ?? null,
              submittedBy: userId,
              submittedAt,
              ...snapshot,
              contentHash: createStoryContentHash(snapshot),
            },
          ],
          { session },
        );
        await this.requirementLinkModel.create(
          requirementLinks.map(link => ({
            workspaceId,
            storyContractId,
            storyVersionId: version._id,
            requirementId: link.requirementId,
            relationship: link.role,
            evidenceNote: link.evidenceNote?.trim() ?? '',
            linkedBy: userId,
            linkedAt: submittedAt,
          })),
          { session },
        );
        const submittedDraft = await this.draftModel.findOneAndUpdate(
          {
            _id: draftId,
            workspaceId,
            storyContractId,
            status: STORY_DRAFT_STATUS.ACTIVE,
          },
          {
            $set: {
              status: STORY_DRAFT_STATUS.SUBMITTED,
              submittedStoryVersionId: version._id,
              updatedBy: userId,
            },
          },
          { new: true, session },
        );
        if (!submittedDraft) {
          throw new NotFoundException('Story draft not found');
        }
        return version;
      },
    );
    if (!isStoryOperationReplay(version)) {
      const event = createStoryContractEvent('story.version.submitted', {
        workspaceId,
        aggregateId: storyContractId,
        aggregateVersion: version.versionNumber,
        actorId: userId,
        storyVersionId: String(version._id),
      });
      this.events.emit(event.type, event);
    }
    return version;
  }

  private async resolveDecisionRecordIds(
    workspaceId: string,
    storyContractId: string,
    decisionProposalIds: string[],
    session: ClientSession,
  ): Promise<string[]> {
    return Promise.all(
      decisionProposalIds.map(async decisionProposalId => {
        const proposal = await this.decisionProposalModel.findOne(
          {
            _id: decisionProposalId,
            workspaceId,
            storyContractId,
            state: DECISION_PROPOSAL_STATE.APPROVED,
          },
          null,
          { session },
        );
        if (!proposal) {
          throw new NotFoundException('Approved decision proposal not found');
        }
        const record = await this.decisionRecordModel
          .findOne(
            {
              workspaceId,
              storyContractId,
              sourceProposalId: decisionProposalId,
            },
            null,
            { session },
          )
          .sort({ decidedAt: -1, _id: -1 });
        if (!record) {
          throw new NotFoundException('Approved decision record not found');
        }
        return String(record._id);
      }),
    );
  }

  async findVersions(workspaceId: string, storyContractId: string) {
    await this.findContract(workspaceId, storyContractId);
    return this.versionModel
      .find({ workspaceId, storyContractId })
      .sort({ versionNumber: 1 });
  }

  async findVersion(
    workspaceId: string,
    storyContractId: string,
    storyVersionId: string,
  ) {
    const version = await this.versionModel.findOne({
      _id: storyVersionId,
      workspaceId,
      storyContractId,
    });
    if (!version) {
      throw new NotFoundException('Story version not found');
    }
    return version;
  }

  private async findContract(workspaceId: string, storyContractId: string) {
    const contract = await this.contractModel.findOne({
      _id: storyContractId,
      workspaceId,
    });
    if (!contract) {
      throw new NotFoundException('Story contract not found');
    }
    return contract;
  }
}
