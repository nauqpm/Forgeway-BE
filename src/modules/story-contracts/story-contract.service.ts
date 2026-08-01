import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { WORKSPACE_PERMISSIONS } from '../../common/constants/workspace-permissions.constants';
import { RequirementsService } from '../requirements/requirements.service';
import {
  APPROVAL_REQUEST_STATE,
  APPROVAL_VERSION_CONFLICT,
  STORY_CONTRACT_STATUS,
  STORY_DRAFT_STATUS,
  STORY_PENDING_APPROVAL_EXISTS,
  STORY_REQUIREMENT_ROLE,
} from './constants/story-contract.constants';
import { createStoryContractEvent } from './events/story-contract.events';
import {
  StoryActor,
  StoryAuthorizationService,
} from './services/story-authorization.service';

type CreateStoryContractInput = {
  title: string;
  primaryRequirementId: string;
};

@Injectable()
export class StoryContractService {
  constructor(
    @InjectModel('StoryContract')
    private readonly contractModel: Model<any>,
    @InjectModel('StoryContractCounter')
    private readonly counterModel: Model<any>,
    @InjectModel('StoryDraft')
    private readonly draftModel: Model<any>,
    @InjectModel('ApprovalRequest')
    private readonly approvalRequestModel: Model<any>,
    @InjectModel('Workspace') private readonly workspaceModel: Model<any>,
    private readonly requirementsService: RequirementsService,
    private readonly authorization: StoryAuthorizationService,
    @InjectConnection() private readonly connection: Connection,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    workspaceId: string,
    dto: CreateStoryContractInput,
    userId: string,
  ) {
    await this.requirementsService.findById(
      workspaceId,
      dto.primaryRequirementId,
    );
    const session = await this.connection.startSession();
    let result: { contract: any; draft: any } | undefined;

    try {
      await session.withTransaction(async () => {
        const counter = await this.counterModel.findOneAndUpdate(
          { workspaceId },
          { $inc: { sequence: 1 } },
          { upsert: true, new: true, session },
        );
        const [contract] = await this.contractModel.create(
          [
            {
              workspaceId,
              key: `SC-${counter.sequence}`,
              title: dto.title.trim(),
              status: STORY_CONTRACT_STATUS.ACTIVE,
              version: 1,
              createdBy: userId,
            },
          ],
          { session },
        );
        const [draft] = await this.draftModel.create(
          [
            {
              workspaceId,
              storyContractId: contract._id,
              baseStoryVersionId: null,
              status: STORY_DRAFT_STATUS.ACTIVE,
              draftRevision: 1,
              content: {},
              requirementLinks: [
                {
                  requirementId: dto.primaryRequirementId,
                  role: STORY_REQUIREMENT_ROLE.PRIMARY,
                },
              ],
              criterionInputs: [],
              decisionProposalIds: [],
              createdBy: userId,
              updatedBy: userId,
            },
          ],
          { session },
        );
        result = { contract, draft };
      });
      const event = createStoryContractEvent('story.contract.created', {
        workspaceId,
        aggregateId: String(result!.contract._id),
        aggregateVersion: result!.contract.version,
        actorId: userId,
      });
      this.events.emit(event.type, event);
      return result!;
    } finally {
      await session.endSession();
    }
  }

  async findAll(workspaceId: string) {
    return this.contractModel
      .find({ workspaceId })
      .sort({ status: 1, createdAt: -1 });
  }

  async findById(workspaceId: string, storyContractId: string) {
    const contract = await this.contractModel.findOne({
      _id: storyContractId,
      workspaceId,
    });
    if (!contract) {
      throw new NotFoundException('Story contract not found');
    }
    return contract;
  }

  async archive(
    workspaceId: string,
    storyContractId: string,
    actor: StoryActor,
  ) {
    const session = await this.connection.startSession();
    try {
      const archived = await session.withTransaction(async () => {
        const workspace = await this.workspaceModel.findOne(
          { _id: workspaceId, status: 'active' },
          null,
          { session },
        );
        if (!workspace) {
          throw new NotFoundException('Workspace not found');
        }
        const effectiveActor = this.authorization.refreshWorkspaceActor(
          workspace,
          actor,
        );
        this.authorization.assertPermission(
          effectiveActor,
          WORKSPACE_PERMISSIONS.STORY_ARCHIVE,
        );
        const contract = await this.contractModel.findOne(
          {
            _id: storyContractId,
            workspaceId,
            status: STORY_CONTRACT_STATUS.ACTIVE,
          },
          null,
          { session },
        );
        if (!contract) {
          throw new NotFoundException('Story contract not found');
        }
        const pending = await this.approvalRequestModel.findOne(
          {
            workspaceId,
            storyContractId,
            state: APPROVAL_REQUEST_STATE.PENDING,
          },
          null,
          { session },
        );
        if (pending) {
          throw new ConflictException({
            code: STORY_PENDING_APPROVAL_EXISTS,
            message: STORY_PENDING_APPROVAL_EXISTS,
          });
        }
        const result = await this.contractModel.findOneAndUpdate(
          {
            _id: storyContractId,
            workspaceId,
            status: STORY_CONTRACT_STATUS.ACTIVE,
            version: contract.version,
            currentApprovedStoryVersionId:
              contract.currentApprovedStoryVersionId ?? null,
          },
          {
            $set: {
              status: STORY_CONTRACT_STATUS.ARCHIVED,
              archivedAt: new Date(),
              archivedBy:
                effectiveActor.kind === 'human'
                  ? effectiveActor.userId
                  : effectiveActor.agentId,
            },
            $inc: { version: 1 },
          },
          { new: true, session },
        );
        if (!result) {
          throw new ConflictException({
            code: APPROVAL_VERSION_CONFLICT,
            message: APPROVAL_VERSION_CONFLICT,
          });
        }
        return result;
      });
      const event = createStoryContractEvent('story.contract.archived', {
        workspaceId,
        aggregateId: storyContractId,
        aggregateVersion: archived.version,
        actorId: actor.kind === 'human' ? actor.userId : actor.agentId,
      });
      this.events.emit(event.type, event);
      return archived;
    } finally {
      await session.endSession();
    }
  }
}
