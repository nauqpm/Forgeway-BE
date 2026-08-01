import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import {
  DECISION_PROPOSAL_CONFLICT,
  DECISION_PROPOSAL_STATE,
  STORY_CONTRACT_STATUS,
} from '../constants/story-contract.constants';
import { createStoryContractEvent } from '../events/story-contract.events';
import {
  StoryActor,
  StoryAuthorizationService,
} from './story-authorization.service';

type DecisionOptionInput = { key: string; label: string };
type ProposalInput = {
  question: string;
  options: DecisionOptionInput[];
  recommendation?: string;
};
type ResolutionInput = { selectedOption: string; rationale: string };

@Injectable()
export class DecisionService {
  constructor(
    @InjectModel('DecisionProposal')
    private readonly proposalModel: Model<any>,
    @InjectModel('DecisionRecord') private readonly recordModel: Model<any>,
    @InjectModel('StoryContract') private readonly contractModel: Model<any>,
    @InjectModel('Workspace') private readonly workspaceModel: Model<any>,
    private readonly authorization: StoryAuthorizationService,
    @InjectConnection() private readonly connection: Connection,
    private readonly events: EventEmitter2,
  ) {}

  async createProposal(
    workspaceId: string,
    storyContractId: string,
    input: ProposalInput,
    actor: StoryActor,
  ) {
    this.authorization.assertPermission(
      actor,
      WORKSPACE_PERMISSIONS.DECISION_PROPOSE,
    );
    await this.findActiveContract(workspaceId, storyContractId);
    const [proposal] = await this.proposalModel.create([
      {
        workspaceId,
        storyContractId,
        ...this.normalizeProposal(input),
        state: DECISION_PROPOSAL_STATE.OPEN,
        proposedBy: this.actorReference(actor),
      },
    ]);
    const event = createStoryContractEvent('decision.proposed', {
      workspaceId,
      aggregateId: storyContractId,
      actorId: this.actorId(actor),
      decisionProposalId: String(proposal._id),
    });
    this.events.emit(event.type, event);
    return proposal;
  }

  async updateProposal(
    workspaceId: string,
    storyContractId: string,
    proposalId: string,
    input: ProposalInput,
    actor: StoryActor,
  ) {
    this.authorization.assertPermission(
      actor,
      WORKSPACE_PERMISSIONS.DECISION_PROPOSE,
    );
    await this.findActiveContract(workspaceId, storyContractId);
    const proposal = await this.proposalModel.findOneAndUpdate(
      {
        _id: proposalId,
        workspaceId,
        storyContractId,
        state: DECISION_PROPOSAL_STATE.OPEN,
      },
      { $set: this.normalizeProposal(input) },
      { new: true },
    );
    if (!proposal) {
      throw new NotFoundException('Decision proposal not found');
    }
    return proposal;
  }

  async findProposals(workspaceId: string, storyContractId: string) {
    await this.findContract(workspaceId, storyContractId);
    return this.proposalModel
      .find({ workspaceId, storyContractId })
      .sort({ createdAt: 1, _id: 1 });
  }

  async approveProposal(
    workspaceId: string,
    storyContractId: string,
    proposalId: string,
    input: ResolutionInput,
    actor: StoryActor,
  ) {
    this.rejectAgentApproval(actor);
    const record = await this.withTransaction(async session => {
      const workspace = await this.findWorkspace(workspaceId, session);
      const effectiveActor = this.authorization.refreshWorkspaceActor(
        workspace,
        actor,
      );
      this.authorization.assertHumanPermission(
        effectiveActor,
        WORKSPACE_PERMISSIONS.DECISION_APPROVE,
      );
      await this.findActiveContract(workspaceId, storyContractId, session);
      const proposal = await this.proposalModel.findOne(
        {
          _id: proposalId,
          workspaceId,
          storyContractId,
          state: DECISION_PROPOSAL_STATE.OPEN,
        },
        null,
        { session },
      );
      if (!proposal) {
        throw new NotFoundException('Decision proposal not found');
      }
      if (
        !proposal.options.some(
          (option: DecisionOptionInput) => option.key === input.selectedOption,
        )
      ) {
        throw new BadRequestException('Selected decision option is invalid');
      }

      const decidedAt = new Date();
      const [created] = await this.recordModel.create(
        [
          {
            workspaceId,
            storyContractId,
            sourceProposalId: proposalId,
            question: proposal.question,
            selectedOption: input.selectedOption,
            rationale: input.rationale.trim(),
            decidedBy: effectiveActor.userId,
            decidedAt,
          },
        ],
        { session },
      );
      const resolved = await this.proposalModel.findOneAndUpdate(
        {
          _id: proposalId,
          workspaceId,
          storyContractId,
          state: DECISION_PROPOSAL_STATE.OPEN,
        },
        {
          $set: {
            state: DECISION_PROPOSAL_STATE.APPROVED,
            resolvedBy: effectiveActor.userId,
            resolvedAt: decidedAt,
          },
        },
        { new: true, session },
      );
      if (!resolved) {
        throw new ConflictException({
          code: DECISION_PROPOSAL_CONFLICT,
          message: DECISION_PROPOSAL_CONFLICT,
        });
      }
      return created;
    });
    const event = createStoryContractEvent('decision.record.approved', {
      workspaceId,
      aggregateId: storyContractId,
      decisionRecordId: String(record._id),
      actorId: actor.userId,
    });
    this.events.emit(event.type, event);
    return record;
  }

  async supersede(
    workspaceId: string,
    storyContractId: string,
    decisionRecordId: string,
    input: ResolutionInput,
    actor: StoryActor,
  ) {
    this.rejectAgentApproval(actor);
    const replacement = await this.withTransaction(async session => {
      const workspace = await this.findWorkspace(workspaceId, session);
      const effectiveActor = this.authorization.refreshWorkspaceActor(
        workspace,
        actor,
      );
      this.authorization.assertHumanPermission(
        effectiveActor,
        WORKSPACE_PERMISSIONS.DECISION_APPROVE,
      );
      await this.findActiveContract(workspaceId, storyContractId, session);
      const prior = await this.recordModel.findOne(
        {
          _id: decisionRecordId,
          workspaceId,
          storyContractId,
        },
        null,
        { session },
      );
      if (!prior) {
        throw new NotFoundException('Decision record not found');
      }
      const proposal = await this.proposalModel.findOne(
        {
          _id: prior.sourceProposalId,
          workspaceId,
          storyContractId,
        },
        null,
        { session },
      );
      if (!proposal) {
        throw new NotFoundException('Decision proposal not found');
      }
      if (
        !proposal.options.some(
          (option: DecisionOptionInput) => option.key === input.selectedOption,
        )
      ) {
        throw new BadRequestException('Selected decision option is invalid');
      }
      const [created] = await this.recordModel.create(
        [
          {
            workspaceId,
            storyContractId,
            sourceProposalId: prior.sourceProposalId,
            question: prior.question,
            selectedOption: input.selectedOption,
            rationale: input.rationale.trim(),
            supersedesDecisionRecordId: decisionRecordId,
            decidedBy: effectiveActor.userId,
            decidedAt: new Date(),
          },
        ],
        { session },
      );
      return created;
    });
    const event = createStoryContractEvent('decision.record.superseded', {
      workspaceId,
      aggregateId: storyContractId,
      decisionRecordId: String(replacement._id),
      supersedesDecisionRecordId: decisionRecordId,
      actorId: actor.userId,
    });
    this.events.emit(event.type, event);
    return replacement;
  }

  async findAll(workspaceId: string, storyContractId: string) {
    await this.findContract(workspaceId, storyContractId);
    return this.recordModel
      .find({ workspaceId, storyContractId })
      .sort({ decidedAt: 1 });
  }

  private normalizeProposal(input: ProposalInput) {
    return {
      question: input.question.trim(),
      options: input.options.map(option => ({
        key: option.key.trim(),
        label: option.label.trim(),
      })),
      ...(input.recommendation === undefined
        ? {}
        : { recommendation: input.recommendation.trim() }),
    };
  }

  private actorReference(actor: StoryActor) {
    return actor.kind === 'human'
      ? { kind: actor.kind, actorId: actor.userId }
      : { kind: actor.kind, actorId: actor.agentId };
  }

  private actorId(actor: StoryActor): string {
    return actor.kind === 'human' ? actor.userId : actor.agentId;
  }

  private rejectAgentApproval(
    actor: StoryActor,
  ): asserts actor is Extract<StoryActor, { kind: 'human' }> {
    if (actor.kind === 'agent') {
      this.authorization.assertHumanPermission(
        actor,
        WORKSPACE_PERMISSIONS.DECISION_APPROVE,
      );
    }
  }

  private async findWorkspace(workspaceId: string, session: ClientSession) {
    const workspace = await this.workspaceModel.findOne(
      { _id: workspaceId, status: 'active' },
      null,
      { session },
    );
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return workspace;
  }

  private async findContract(
    workspaceId: string,
    storyContractId: string,
    session?: ClientSession,
  ) {
    const contract = await this.contractModel.findOne(
      { _id: storyContractId, workspaceId },
      null,
      session ? { session } : undefined,
    );
    if (!contract) {
      throw new NotFoundException('Story contract not found');
    }
    return contract;
  }

  private async findActiveContract(
    workspaceId: string,
    storyContractId: string,
    session?: ClientSession,
  ) {
    const contract = await this.contractModel.findOne(
      {
        _id: storyContractId,
        workspaceId,
        status: STORY_CONTRACT_STATUS.ACTIVE,
      },
      null,
      session ? { session } : undefined,
    );
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
