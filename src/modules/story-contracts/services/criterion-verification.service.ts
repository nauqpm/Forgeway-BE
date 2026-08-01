import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { CreateCriterionVerificationDto } from '../dtos/story-contract.dto';
import {
  AcceptanceCriterion,
  AcceptanceCriterionDocument,
} from '../schemas/acceptance-criterion.schema';
import {
  AcceptanceCriterionRevision,
  AcceptanceCriterionRevisionDocument,
} from '../schemas/acceptance-criterion-revision.schema';
import {
  CriterionVerification,
  CriterionVerificationDocument,
} from '../schemas/criterion-verification.schema';
import {
  StoryVersion,
  StoryVersionDocument,
} from '../schemas/story-version.schema';
import { createStoryContractEvent } from '../events/story-contract.events';

const notFound = () =>
  new NotFoundException('Criterion verification target not found');

@Injectable()
export class CriterionVerificationService {
  constructor(
    @InjectModel(CriterionVerification.name)
    private readonly verificationModel: Model<CriterionVerificationDocument>,
    @InjectModel(StoryVersion.name)
    private readonly versionModel: Model<StoryVersionDocument>,
    @InjectModel(AcceptanceCriterion.name)
    private readonly criterionModel: Model<AcceptanceCriterionDocument>,
    @InjectModel(AcceptanceCriterionRevision.name)
    private readonly revisionModel: Model<AcceptanceCriterionRevisionDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async create(
    workspaceId: string,
    storyContractId: string,
    criterionId: string,
    revisionId: string,
    dto: CreateCriterionVerificationDto,
    userId: string,
  ) {
    await this.ensureTarget(
      workspaceId,
      storyContractId,
      dto.storyVersionId,
      criterionId,
      revisionId,
      dto.taskId,
    );
    const verification = await this.verificationModel.create({
      workspaceId,
      storyContractId,
      storyVersionId: dto.storyVersionId,
      acceptanceCriterionId: criterionId,
      acceptanceCriterionRevisionId: revisionId,
      status: dto.status,
      evidenceType: dto.evidenceType,
      evidenceRef: dto.evidenceRef,
      taskId: dto.taskId,
      pullRequestRef: dto.pullRequestRef,
      qaRunRef: dto.qaRunRef,
      submittedBy: userId,
      submittedAt: new Date(),
    });
    const event = createStoryContractEvent('criterion.verification.submitted', {
      workspaceId,
      aggregateId: storyContractId,
      actorId: userId,
      storyVersionId: dto.storyVersionId,
      criterionId,
      revisionId,
      verificationId: String(verification._id),
    });
    this.events?.emit(event.type, event);
    return verification;
  }

  async findAll(
    workspaceId: string,
    storyContractId: string,
    storyVersionId: string,
    criterionId: string,
    revisionId: string,
  ) {
    await this.ensureTarget(
      workspaceId,
      storyContractId,
      storyVersionId,
      criterionId,
      revisionId,
    );
    return this.verificationModel
      .find({
        workspaceId,
        storyContractId,
        storyVersionId,
        acceptanceCriterionId: criterionId,
        acceptanceCriterionRevisionId: revisionId,
      })
      .sort({ submittedAt: 1 });
  }

  private async ensureTarget(
    workspaceId: string,
    storyContractId: string,
    storyVersionId: string,
    criterionId: string,
    revisionId: string,
    taskId?: string,
  ) {
    if (
      ![workspaceId, storyContractId, storyVersionId, criterionId, revisionId]
        .concat(taskId ?? [])
        .every(Types.ObjectId.isValid)
    ) {
      throw notFound();
    }
    const [version, criterion, revision, task] = await Promise.all([
      this.versionModel.findOne({
        _id: storyVersionId,
        workspaceId,
        storyContractId,
        criteria: {
          $elemMatch: {
            acceptanceCriterionId: criterionId,
            acceptanceCriterionRevisionId: revisionId,
          },
        },
      }),
      this.criterionModel.findOne({
        _id: criterionId,
        workspaceId,
        storyContractId,
      }),
      this.revisionModel.findOne({
        _id: revisionId,
        workspaceId,
        storyContractId,
        acceptanceCriterionId: criterionId,
      }),
      taskId
        ? this.taskModel.findOne({ _id: taskId, workspaceId })
        : Promise.resolve(true),
    ]);
    if (!version || !criterion || !revision || !task) throw notFound();
  }
}
