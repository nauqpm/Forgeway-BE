import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DRAFT_REVISION_CONFLICT,
  PRIMARY_REQUIREMENT_REQUIRED,
  STORY_CONTRACT_STATUS,
  STORY_DRAFT_STATUS,
  STORY_REQUIREMENT_ROLE,
} from './constants/story-contract.constants';
import { createStoryContractEvent } from './events/story-contract.events';
import { RequirementsService } from '../requirements/requirements.service';

@Injectable()
export class StoryDraftService {
  constructor(
    @InjectModel('StoryDraft') private readonly draftModel: Model<any>,
    @InjectModel('StoryContract') private readonly contractModel: Model<any>,
    @InjectConnection() private readonly connection: Connection,
    private readonly requirements: RequirementsService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async create(
    workspaceId: string,
    storyContractId: string,
    _dto: object,
    userId: string,
  ) {
    return this.withTransaction(async session => {
      const contract = await this.contractModel.findOneAndUpdate(
        {
          _id: storyContractId,
          workspaceId,
          status: STORY_CONTRACT_STATUS.ACTIVE,
        },
        { $inc: { version: 1 } },
        { new: true, session },
      );
      if (!contract) {
        throw new NotFoundException('Story contract not found');
      }

      const approvedVersionId = contract.currentApprovedStoryVersionId;
      const approvedVersion = approvedVersionId
        ? await this.connection.model('StoryVersion').findOne(
            {
              _id: approvedVersionId,
              workspaceId,
              storyContractId,
            },
            null,
            { session },
          )
        : null;
      if (approvedVersionId && !approvedVersion) {
        throw new NotFoundException('Story version not found');
      }
      const requirementLinks = (
        approvedVersion?.requirementLinkSnapshot ?? []
      ).map((link: any) => ({
        requirementId: link.requirementId,
        role: link.relationship,
        evidenceNote: link.evidenceNote ?? '',
      }));

      const [draft] = await this.draftModel.create(
        [
          {
            workspaceId,
            storyContractId,
            baseStoryVersionId: contract.currentApprovedStoryVersionId ?? null,
            status: STORY_DRAFT_STATUS.ACTIVE,
            draftRevision: 1,
            content: {},
            requirementLinks,
            criterionInputs: [],
            decisionProposalIds: [],
            createdBy: userId,
            updatedBy: userId,
          },
        ],
        { session },
      );
      return draft;
    });
  }

  async findAll(workspaceId: string, storyContractId: string) {
    await this.findContract(workspaceId, storyContractId);
    return this.draftModel
      .find({ workspaceId, storyContractId })
      .sort({ createdAt: -1 });
  }

  async findById(
    workspaceId: string,
    storyContractId: string,
    draftId: string,
  ) {
    const draft = await this.draftModel.findOne({
      _id: draftId,
      workspaceId,
      storyContractId,
    });
    if (!draft) {
      throw new NotFoundException('Story draft not found');
    }
    return draft;
  }

  async update(
    workspaceId: string,
    storyContractId: string,
    draftId: string,
    dto: {
      expectedDraftRevision: number;
      content?: Record<string, unknown>;
      requirementLinks?: Array<{
        requirementId: string;
        role: string;
        evidenceNote?: string;
      }>;
      criterionInputs?: unknown[];
      decisionProposalIds?: string[];
    },
    userId: string,
  ) {
    const draft = await this.withTransaction(async session => {
      const contract = await this.contractModel.findOneAndUpdate(
        {
          _id: storyContractId,
          workspaceId,
          status: STORY_CONTRACT_STATUS.ACTIVE,
        },
        { $inc: { version: 1 } },
        { new: true, session },
      );
      if (!contract) {
        throw new NotFoundException('Story draft not found');
      }

      const requirementLinks = dto.requirementLinks?.map(link => ({
        requirementId: link.requirementId,
        role: link.role,
        evidenceNote: link.evidenceNote?.trim() ?? '',
      }));
      if (
        requirementLinks &&
        requirementLinks.filter(
          link => link.role === STORY_REQUIREMENT_ROLE.PRIMARY,
        ).length !== 1
      ) {
        throw new BadRequestException({
          code: PRIMARY_REQUIREMENT_REQUIRED,
          message: PRIMARY_REQUIREMENT_REQUIRED,
        });
      }
      if (requirementLinks) {
        await Promise.all(
          requirementLinks.map(link =>
            this.requirements.findById(workspaceId, link.requirementId),
          ),
        );
      }

      const patch = {
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(requirementLinks ? { requirementLinks } : {}),
        ...(dto.criterionInputs !== undefined
          ? { criterionInputs: dto.criterionInputs }
          : {}),
        ...(dto.decisionProposalIds !== undefined
          ? { decisionProposalIds: dto.decisionProposalIds }
          : {}),
        updatedBy: userId,
      };
      const draft = await this.draftModel.findOneAndUpdate(
        {
          _id: draftId,
          workspaceId,
          storyContractId,
          status: STORY_DRAFT_STATUS.ACTIVE,
          draftRevision: dto.expectedDraftRevision,
        },
        { $set: patch, $inc: { draftRevision: 1 } },
        { new: true, session },
      );
      if (draft) {
        return draft;
      }

      const existing = await this.draftModel.findOne(
        {
          _id: draftId,
          workspaceId,
          storyContractId,
        },
        null,
        { session },
      );
      if (!existing || existing.status !== STORY_DRAFT_STATUS.ACTIVE) {
        throw new NotFoundException('Story draft not found');
      }
      throw new ConflictException({
        code: DRAFT_REVISION_CONFLICT,
        message: DRAFT_REVISION_CONFLICT,
      });
    });
    const event = createStoryContractEvent('story.draft.edited', {
      workspaceId,
      aggregateId: storyContractId,
      actorId: userId,
      draftId,
      draftRevision: draft.draftRevision,
    });
    this.events?.emit(event.type, event);
    return draft;
  }

  async abandon(
    workspaceId: string,
    storyContractId: string,
    draftId: string,
    userId: string,
  ) {
    return this.withTransaction(async session => {
      const contract = await this.contractModel.findOneAndUpdate(
        {
          _id: storyContractId,
          workspaceId,
          status: STORY_CONTRACT_STATUS.ACTIVE,
        },
        { $inc: { version: 1 } },
        { new: true, session },
      );
      if (!contract) {
        throw new NotFoundException('Story draft not found');
      }

      const draft = await this.draftModel.findOneAndUpdate(
        {
          _id: draftId,
          workspaceId,
          storyContractId,
          status: STORY_DRAFT_STATUS.ACTIVE,
        },
        {
          $set: {
            status: STORY_DRAFT_STATUS.ABANDONED,
            updatedBy: userId,
          },
        },
        { new: true, session },
      );
      if (!draft) {
        throw new NotFoundException('Story draft not found');
      }
      return draft;
    });
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
