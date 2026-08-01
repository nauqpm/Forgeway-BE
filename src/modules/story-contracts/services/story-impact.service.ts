import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientSession, Connection, Model } from 'mongoose';
import { WorkflowsService } from '../../workflows/services/workflows.service';
import {
  isStoryOperationReplay,
  runStoryOperation,
} from '../utils/story-operation.util';

@Injectable()
export class StoryImpactService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<any>,
    @InjectModel('TaskAcceptanceCriterionLink')
    private readonly links: Model<any>,
    @InjectModel('StoryImpactAssessment')
    private readonly assessments: Model<any>,
    @InjectModel('StoryVersionChangeSet') private readonly changes: Model<any>,
    @InjectModel('StoryVersion') private readonly versions: Model<any>,
    @InjectModel('StoryContract') private readonly contracts: Model<any>,
    @InjectConnection() private readonly connection: Connection,
    private readonly events: EventEmitter2,
    private readonly workflows: WorkflowsService,
    @Optional()
    @InjectModel('StoryOperation')
    private readonly operationModel?: Model<any>,
  ) {}

  async assertTaskVersion(
    workspaceId: string,
    storyContractId?: string,
    storyVersionId?: string,
    session?: ClientSession,
  ): Promise<any> {
    if (!storyContractId && !storyVersionId) return undefined;
    if (!storyContractId || !storyVersionId) {
      throw new BadRequestException(
        'storyContractId and storyVersionId must be supplied together',
      );
    }
    const versionQuery = {
      _id: storyVersionId,
      workspaceId,
      storyContractId,
    };
    const contractQuery = {
      _id: storyContractId,
      workspaceId,
      status: 'active',
      currentApprovedStoryVersionId: storyVersionId,
    };
    const [version, contract] = session
      ? await Promise.all([
          this.versions.findOne(versionQuery, null, { session }),
          this.contracts.findOne(contractQuery, null, { session }),
        ])
      : await Promise.all([
          this.versions.findOne(versionQuery),
          this.contracts.findOne(contractQuery),
        ]);
    if (!version || !contract) {
      throw new BadRequestException(
        'Story Version is not the current approved version of this Workspace and Story Contract',
      );
    }
    return version;
  }

  async assess(
    workspaceId: string,
    storyContractId: string,
    fromStoryVersionId: string,
    toStoryVersionId: string,
    session: ClientSession,
  ) {
    const workflow = await this.workflows.findByWorkspace(workspaceId);
    const doneStatuses =
      workflow?.statuses
        .filter(status => status.category === 'done')
        .map(status => status.id) ?? [];
    const [changeSet, tasks] = await Promise.all([
      this.changes.findOne(
        { workspaceId, storyContractId, fromStoryVersionId, toStoryVersionId },
        null,
        { session },
      ),
      this.taskModel.find(
        {
          workspaceId,
          storyContractId,
          storyVersionId: fromStoryVersionId,
          ...(doneStatuses.length ? { status: { $nin: doneStatuses } } : {}),
          isArchived: { $ne: true },
          isDeleted: { $ne: true },
        },
        null,
        { session },
      ),
    ]);
    const criterionChanges = changeSet?.acceptanceCriterionChanges ?? [];
    const storyChanges = [
      ...(changeSet?.scopeChanges ?? []),
      ...(changeSet?.businessRuleChanges ?? []),
      ...(changeSet?.permissionChanges ?? []),
      ...(changeSet?.requirementChanges ?? []),
      ...(changeSet?.decisionChanges ?? []),
      ...(changeSet?.dependencyChanges ?? []),
    ];
    const assessed: Array<{ taskId: string; requirementsState: string }> = [];
    for (const task of tasks) {
      const links = await this.links.find(
        { workspaceId, taskId: task._id, storyVersionId: fromStoryVersionId },
        null,
        { session },
      );
      const linkedIds = new Set(
        links.map((link: any) => String(link.acceptanceCriterionId)),
      );
      const relevantCriteria = criterionChanges.filter((change: any) =>
        linkedIds.has(String(change.entityId)),
      );
      const relevant = [...storyChanges, ...relevantCriteria];
      const requirementsState = relevant.some(
        (change: any) => change.impactLevel === 'BLOCKING',
      )
        ? 'REBASE_REQUIRED'
        : relevant.length
          ? 'REVIEW_REQUIRED'
          : 'CURRENT';
      await this.taskModel.updateOne(
        { _id: task._id, workspaceId },
        { $set: { requirementsState } },
        { session },
      );
      await this.assessments.updateOne(
        { workspaceId, taskId: task._id, fromStoryVersionId, toStoryVersionId },
        {
          $setOnInsert: {
            workspaceId,
            storyContractId,
            taskId: task._id,
            fromStoryVersionId,
            toStoryVersionId,
            affectedCriterionIds: relevantCriteria.map(
              (change: any) => change.entityId,
            ),
            requirementsState,
          },
        },
        { upsert: true, session },
      );
      assessed.push({ taskId: String(task._id), requirementsState });
    }
    return assessed;
  }

  async resolve(
    workspaceId: string,
    taskId: string,
    assessmentId: string,
    actor: { userId: string; isAdmin: boolean },
    idempotencyKey?: string,
  ) {
    const assessment = await runStoryOperation(
      this.connection,
      this.operationModel,
      {
        workspaceId,
        actorId: actor.userId,
        operation: 'story.resolve_impact',
        key: idempotencyKey,
        resourceId: assessmentId,
        request: { taskId, assessmentId },
      },
      async session => {
        const assessment = await this.assessments.findOne(
          { _id: assessmentId, workspaceId, taskId, state: 'PENDING' },
          null,
          { session },
        );
        if (!assessment) throw new NotFoundException('Story impact not found');
        const task = await this.taskModel.findOne(
          {
            _id: taskId,
            workspaceId,
            storyContractId: assessment.storyContractId,
            storyVersionId: assessment.fromStoryVersionId,
          },
          null,
          { session },
        );
        if (!task) throw new NotFoundException('Story impact not found');
        if (!actor.isAdmin && String(task.assigneeId) !== actor.userId) {
          throw new ForbiddenException(
            'Only the assigned member or a Workspace administrator can resolve Story impact',
          );
        }
        const version = await this.versions.findOne(
          {
            _id: assessment.toStoryVersionId,
            workspaceId,
            storyContractId: assessment.storyContractId,
          },
          null,
          { session },
        );
        if (!version) throw new NotFoundException('Story version not found');
        await this.taskModel.updateOne(
          { _id: taskId, workspaceId },
          {
            $set: {
              storyContractId: assessment.storyContractId,
              storyVersionId: assessment.toStoryVersionId,
              requirementsState: 'CURRENT',
            },
          },
          { session },
        );
        await this.links.deleteMany({ workspaceId, taskId }, { session });
        const criteria = version.criteria ?? [];
        if (criteria.length) {
          await this.links.insertMany(
            criteria.map((criterion: any) => ({
              workspaceId,
              taskId,
              storyContractId: assessment.storyContractId,
              storyVersionId: assessment.toStoryVersionId,
              acceptanceCriterionId: criterion.acceptanceCriterionId,
              acceptanceCriterionRevisionId:
                criterion.acceptanceCriterionRevisionId,
            })),
            { session },
          );
        }
        await this.assessments.updateOne(
          { _id: assessment._id, workspaceId, state: 'PENDING' },
          {
            $set: {
              state: 'RESOLVED',
              resolvedAt: new Date(),
              resolvedBy: actor.userId,
            },
          },
          { session },
        );
        return assessment;
      },
    );
    if (!isStoryOperationReplay(assessment)) {
      this.events.emit('task.story.rebased', {
        workspaceId,
        storyContractId: String(assessment.storyContractId),
        taskId,
        assessmentId,
        userId: actor.userId,
      });
    }
    return assessment;
  }

  async linkTask(
    workspaceId: string,
    storyContractId: string,
    storyVersionId: string,
    taskId: string,
  ) {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const [version, task] = await Promise.all([
          this.assertTaskVersion(
            workspaceId,
            storyContractId,
            storyVersionId,
            session,
          ),
          this.taskModel.findOne({ _id: taskId, workspaceId }, null, {
            session,
          }),
        ]);
        if (!task) throw new NotFoundException('Task not found');
        await this.taskModel.updateOne(
          { _id: taskId, workspaceId },
          {
            $set: {
              storyContractId,
              storyVersionId,
              requirementsState: 'CURRENT',
            },
          },
          { session },
        );
        await this.links.deleteMany({ workspaceId, taskId }, { session });
        const criteria = version.criteria ?? [];
        if (criteria.length) {
          await this.links.insertMany(
            criteria.map((criterion: any) => ({
              workspaceId,
              taskId,
              storyContractId,
              storyVersionId,
              acceptanceCriterionId: criterion.acceptanceCriterionId,
              acceptanceCriterionRevisionId:
                criterion.acceptanceCriterionRevisionId,
            })),
            { session },
          );
        }
      });
      return this.taskModel.findOne({ _id: taskId, workspaceId });
    } finally {
      await session.endSession();
    }
  }

  async findVersionImpact(
    workspaceId: string,
    storyContractId: string,
    storyVersionId: string,
  ) {
    const version = await this.versions.findOne({
      _id: storyVersionId,
      workspaceId,
      storyContractId,
    });
    if (!version) throw new NotFoundException('Story impact not found');
    return this.assessments.find({
      workspaceId,
      storyContractId,
      toStoryVersionId: storyVersionId,
    });
  }

  async findTaskImpact(workspaceId: string, taskId: string) {
    const task = await this.taskModel.findOne({ _id: taskId, workspaceId });
    if (!task?.storyContractId) {
      throw new NotFoundException('Story impact not found');
    }
    const assessment = await this.assessments
      .findOne({
        workspaceId,
        taskId,
        storyContractId: task.storyContractId,
      })
      .sort({ createdAt: -1 });
    if (!assessment) throw new NotFoundException('Story impact not found');
    return assessment;
  }
}
