import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import {
  APPROVAL_DECISION,
  APPROVAL_POLICY_NOT_SATISFIED,
  APPROVAL_REQUEST_STATE,
  APPROVAL_VERSION_CONFLICT,
  STORY_CONTRACT_STATUS,
  STORY_DRAFT_STATUS,
} from '../constants/story-contract.constants';
import { createStoryContractEvent } from '../events/story-contract.events';
import {
  StoryActor,
  StoryAuthorizationService,
} from './story-authorization.service';
import { StoryVersionDiffService } from './story-version-diff.service';
import { StoryImpactService } from './story-impact.service';
import {
  isStoryOperationReplay,
  runStoryOperation,
} from '../utils/story-operation.util';

type ApprovalInput = { expectedCurrentVersionId: string | null };
type RejectionInput = { reason?: string };
type ApprovalPolicy = {
  minimumApprovals: number;
  allowAuthorApproval: boolean;
  requireIndependentApproval: boolean;
};

@Injectable()
export class StoryApprovalService {
  constructor(
    @InjectModel('ApprovalRequest')
    private readonly requestModel: Model<any>,
    @InjectModel('ApprovalRecord') private readonly recordModel: Model<any>,
    @InjectModel('StoryContract') private readonly contractModel: Model<any>,
    @InjectModel('StoryVersion') private readonly versionModel: Model<any>,
    @InjectModel('StoryDraft') private readonly draftModel: Model<any>,
    @InjectModel('Workspace') private readonly workspaceModel: Model<any>,
    private readonly versionDiffs: StoryVersionDiffService,
    private readonly authorization: StoryAuthorizationService,
    @InjectConnection() private readonly connection: Connection,
    private readonly events: EventEmitter2,
    private readonly impacts?: StoryImpactService,
    @Optional()
    @InjectModel('StoryOperation')
    private readonly operationModel?: Model<any>,
  ) {}

  async requestApproval(
    workspaceId: string,
    storyContractId: string,
    storyVersionId: string,
    actor: StoryActor,
  ) {
    const request = await this.withTransaction(async session => {
      const workspace = await this.findWorkspace(workspaceId, session);
      const effectiveActor = this.authorization.refreshWorkspaceActor(
        workspace,
        actor,
      );
      this.authorization.assertPermission(
        effectiveActor,
        WORKSPACE_PERMISSIONS.STORY_SUBMIT,
      );
      await this.findActiveContract(workspaceId, storyContractId, session);
      await this.findVersion(
        workspaceId,
        storyContractId,
        storyVersionId,
        session,
      );
      const [created] = await this.requestModel.create(
        [
          {
            workspaceId,
            storyContractId,
            storyVersionId,
            state: APPROVAL_REQUEST_STATE.PENDING,
            requestedBy: this.actorId(actor),
          },
        ],
        { session },
      );
      return created;
    });
    const event = createStoryContractEvent('story.approval.requested', {
      workspaceId,
      aggregateId: storyContractId,
      storyVersionId,
      approvalRequestId: String(request._id),
      actorId: this.actorId(actor),
    });
    this.events.emit(event.type, event);
    return request;
  }

  async approve(
    workspaceId: string,
    storyContractId: string,
    storyVersionId: string,
    approvalRequestId: string,
    input: ApprovalInput,
    actor: StoryActor,
    idempotencyKey?: string,
  ) {
    this.rejectAgentApproval(actor);
    const result = await runStoryOperation(
      this.connection,
      this.operationModel,
      {
        workspaceId,
        actorId: actor.userId,
        operation: 'story.approve',
        key: idempotencyKey,
        resourceId: storyVersionId,
        request: {
          storyContractId,
          storyVersionId,
          approvalRequestId,
          input,
        },
      },
      async session => {
        const workspace = await this.findWorkspace(workspaceId, session);
        const effectiveActor = this.authorization.refreshWorkspaceActor(
          workspace,
          actor,
        );
        this.authorization.assertHumanPermission(
          effectiveActor,
          WORKSPACE_PERMISSIONS.STORY_APPROVE,
        );
        await this.findActiveContract(workspaceId, storyContractId, session);
        const version = await this.findVersion(
          workspaceId,
          storyContractId,
          storyVersionId,
          session,
        );
        const request = await this.findPendingRequest(
          workspaceId,
          storyContractId,
          storyVersionId,
          approvalRequestId,
          session,
        );
        const policy = this.policyFrom(workspace);
        this.assertPolicy(policy, version, effectiveActor.userId);
        if (
          this.toNullableId(version.baseStoryVersionId) !==
          input.expectedCurrentVersionId
        ) {
          throw this.versionConflict();
        }

        const [record] = await this.recordModel.create(
          [
            {
              workspaceId,
              approvalRequestId,
              storyContractId,
              storyVersionId,
              decision: APPROVAL_DECISION.APPROVE,
              actorId: effectiveActor.userId,
              createdAt: new Date(),
            },
          ],
          { session },
        );
        const priorApprovals = await this.recordModel.countDocuments(
          {
            workspaceId,
            approvalRequestId,
            decision: APPROVAL_DECISION.APPROVE,
            _id: { $ne: record._id },
          },
          { session },
        );
        if (priorApprovals + 1 < policy.minimumApprovals) {
          return { record, approved: false as const };
        }

        const resolvedAt = new Date();
        const resolved = await this.requestModel.findOneAndUpdate(
          {
            _id: request._id,
            workspaceId,
            storyContractId,
            storyVersionId,
            state: APPROVAL_REQUEST_STATE.PENDING,
          },
          {
            $set: {
              state: APPROVAL_REQUEST_STATE.APPROVED,
              resolvedAt,
            },
          },
          { new: true, session },
        );
        if (!resolved) {
          throw this.versionConflict();
        }
        const contract = await this.contractModel.findOneAndUpdate(
          {
            _id: storyContractId,
            workspaceId,
            status: STORY_CONTRACT_STATUS.ACTIVE,
            currentApprovedStoryVersionId: input.expectedCurrentVersionId,
          },
          {
            $set: { currentApprovedStoryVersionId: storyVersionId },
            $inc: { version: 1 },
          },
          { new: true, session },
        );
        if (!contract) {
          throw this.versionConflict();
        }
        let impacts: Array<{ taskId: string; requirementsState: string }> = [];
        if (input.expectedCurrentVersionId) {
          await this.versionDiffs.persist(
            workspaceId,
            storyContractId,
            input.expectedCurrentVersionId,
            storyVersionId,
            session,
          );
          impacts =
            (await this.impacts?.assess(
              workspaceId,
              storyContractId,
              input.expectedCurrentVersionId,
              storyVersionId,
              session,
            )) ?? [];
        }
        await this.draftModel.updateMany(
          {
            workspaceId,
            storyContractId,
            status: STORY_DRAFT_STATUS.ACTIVE,
            baseStoryVersionId: input.expectedCurrentVersionId,
          },
          { $set: { status: STORY_DRAFT_STATUS.STALE } },
          { session },
        );
        return { record, approved: true as const, impacts };
      },
    );

    if (!isStoryOperationReplay(result)) {
      const recordedEvent = createStoryContractEvent(
        'story.approval.recorded',
        {
          workspaceId,
          aggregateId: storyContractId,
          storyVersionId,
          approvalRecordId: String(result.record._id),
          actorId: actor.userId,
          approved: result.approved,
        },
      );
      this.events.emit(recordedEvent.type, recordedEvent);
    }

    if (result.approved && !isStoryOperationReplay(result)) {
      const approvedEvent = createStoryContractEvent('story.version.approved', {
        workspaceId,
        aggregateId: storyContractId,
        storyVersionId,
        approvalRecordId: String(result.record._id),
        actorId: actor.userId,
      });
      this.events.emit(approvedEvent.type, approvedEvent);
      for (const impact of result.impacts ?? []) {
        this.events.emit('story.impact.assessed', {
          workspaceId,
          storyContractId,
          storyVersionId,
          taskId: impact.taskId,
        });
        if (impact.requirementsState === 'REBASE_REQUIRED') {
          this.events.emit('task.story.rebase_required', {
            workspaceId,
            taskId: impact.taskId,
            storyContractId,
            storyVersionId,
          });
        }
      }
      if (input.expectedCurrentVersionId) {
        const supersededEvent = createStoryContractEvent(
          'story.version.superseded',
          {
            workspaceId,
            aggregateId: storyContractId,
            storyVersionId: input.expectedCurrentVersionId,
            supersededByStoryVersionId: storyVersionId,
            actorId: actor.userId,
          },
        );
        this.events.emit(supersededEvent.type, supersededEvent);
      }
    }
    return result.record;
  }

  async reject(
    workspaceId: string,
    storyContractId: string,
    storyVersionId: string,
    approvalRequestId: string,
    input: RejectionInput,
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
        WORKSPACE_PERMISSIONS.STORY_APPROVE,
      );
      await this.findActiveContract(workspaceId, storyContractId, session);
      await this.findVersion(
        workspaceId,
        storyContractId,
        storyVersionId,
        session,
      );
      const request = await this.findPendingRequest(
        workspaceId,
        storyContractId,
        storyVersionId,
        approvalRequestId,
        session,
      );
      const [created] = await this.recordModel.create(
        [
          {
            workspaceId,
            approvalRequestId,
            storyContractId,
            storyVersionId,
            decision: APPROVAL_DECISION.REJECT,
            ...(input.reason ? { reason: input.reason.trim() } : {}),
            actorId: effectiveActor.userId,
            createdAt: new Date(),
          },
        ],
        { session },
      );
      const resolved = await this.requestModel.findOneAndUpdate(
        {
          _id: request._id,
          workspaceId,
          storyContractId,
          storyVersionId,
          state: APPROVAL_REQUEST_STATE.PENDING,
        },
        {
          $set: {
            state: APPROVAL_REQUEST_STATE.REJECTED,
            resolvedAt: new Date(),
          },
        },
        { new: true, session },
      );
      if (!resolved) {
        throw this.versionConflict();
      }
      return created;
    });
    const event = createStoryContractEvent('story.version.rejected', {
      workspaceId,
      aggregateId: storyContractId,
      storyVersionId,
      approvalRecordId: String(record._id),
      actorId: actor.userId,
    });
    this.events.emit(event.type, event);
    return record;
  }

  async findAll(workspaceId: string, storyContractId: string) {
    await this.findContract(workspaceId, storyContractId);
    const [requests, records] = await Promise.all([
      this.requestModel
        .find({ workspaceId, storyContractId })
        .sort({ createdAt: 1 }),
      this.recordModel
        .find({ workspaceId, storyContractId })
        .sort({ createdAt: 1 }),
    ]);
    return { requests, records };
  }

  private rejectAgentApproval(
    actor: StoryActor,
  ): asserts actor is Extract<StoryActor, { kind: 'human' }> {
    if (actor.kind === 'agent') {
      this.authorization.assertHumanPermission(
        actor,
        WORKSPACE_PERMISSIONS.STORY_APPROVE,
      );
    }
  }

  private policyFrom(workspace: any): ApprovalPolicy {
    const defaults: ApprovalPolicy = {
      minimumApprovals: 1,
      allowAuthorApproval: true,
      requireIndependentApproval: false,
    };
    const configured =
      workspace.storyApprovalPolicy ?? workspace.settings?.storyApprovalPolicy;
    if (!configured || typeof configured !== 'object') {
      return defaults;
    }
    if (
      (configured.minimumApprovals !== undefined &&
        (!Number.isInteger(configured.minimumApprovals) ||
          configured.minimumApprovals < 1)) ||
      (configured.allowAuthorApproval !== undefined &&
        typeof configured.allowAuthorApproval !== 'boolean') ||
      (configured.requireIndependentApproval !== undefined &&
        typeof configured.requireIndependentApproval !== 'boolean')
    ) {
      return defaults;
    }
    return {
      minimumApprovals:
        configured.minimumApprovals ?? defaults.minimumApprovals,
      allowAuthorApproval:
        configured.allowAuthorApproval ?? defaults.allowAuthorApproval,
      requireIndependentApproval:
        configured.requireIndependentApproval ??
        defaults.requireIndependentApproval,
    };
  }

  private assertPolicy(
    policy: ApprovalPolicy,
    version: any,
    actorId: string,
  ): void {
    if (
      String(version.submittedBy) === actorId &&
      (!policy.allowAuthorApproval || policy.requireIndependentApproval)
    ) {
      throw new ConflictException({
        code: APPROVAL_POLICY_NOT_SATISFIED,
        message: APPROVAL_POLICY_NOT_SATISFIED,
      });
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
    session: ClientSession,
  ) {
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
    return contract;
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

  private async findPendingRequest(
    workspaceId: string,
    storyContractId: string,
    storyVersionId: string,
    approvalRequestId: string,
    session: ClientSession,
  ) {
    const request = await this.requestModel.findOne(
      {
        _id: approvalRequestId,
        workspaceId,
        storyContractId,
        storyVersionId,
        state: APPROVAL_REQUEST_STATE.PENDING,
      },
      null,
      { session },
    );
    if (!request) {
      throw new NotFoundException('Approval request not found');
    }
    return request;
  }

  private actorId(actor: StoryActor): string {
    return actor.kind === 'human' ? actor.userId : actor.agentId;
  }

  private toNullableId(value: unknown): string | null {
    return value == null ? null : String(value);
  }

  private versionConflict() {
    return new ConflictException({
      code: APPROVAL_VERSION_CONFLICT,
      message: APPROVAL_VERSION_CONFLICT,
    });
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
