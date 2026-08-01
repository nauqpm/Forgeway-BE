import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { AuthModule } from '../auth/auth.module';
import { RequirementsModule } from '../requirements/requirements.module';
import {
  Workspace,
  WorkspaceSchema,
} from '../workspaces/schemas/workspace.schema';
import {
  ApprovalRecord,
  ApprovalRecordSchema,
} from './schemas/approval-record.schema';
import {
  ApprovalRequest,
  ApprovalRequestSchema,
} from './schemas/approval-request.schema';
import {
  DecisionProposal,
  DecisionProposalSchema,
} from './schemas/decision-proposal.schema';
import {
  DecisionRecord,
  DecisionRecordSchema,
} from './schemas/decision-record.schema';
import {
  StoryContractCounter,
  StoryContractCounterSchema,
} from './schemas/story-contract-counter.schema';
import {
  StoryContract,
  StoryContractSchema,
} from './schemas/story-contract.schema';
import { StoryDraft, StoryDraftSchema } from './schemas/story-draft.schema';
import {
  AcceptanceCriterion,
  AcceptanceCriterionSchema,
} from './schemas/acceptance-criterion.schema';
import {
  AcceptanceCriterionRevision,
  AcceptanceCriterionRevisionSchema,
} from './schemas/acceptance-criterion-revision.schema';
import {
  StoryRequirementLink,
  StoryRequirementLinkSchema,
} from './schemas/story-requirement-link.schema';
import {
  StoryVersion,
  StoryVersionSchema,
} from './schemas/story-version.schema';
import {
  StoryVersionChangeSet,
  StoryVersionChangeSetSchema,
} from './schemas/story-version-change-set.schema';
import { AcceptanceCriterionService } from './services/acceptance-criterion.service';
import { DecisionService } from './services/decision.service';
import { StoryApprovalService } from './services/story-approval.service';
import { StoryAuthorizationService } from './services/story-authorization.service';
import { StorySubmissionService } from './services/story-submission.service';
import { StoryDraftRebaseService } from './services/story-draft-rebase.service';
import { StoryVersionDiffService } from './services/story-version-diff.service';
import { StoryContractService } from './story-contract.service';
import { StoryContractsController } from './story-contracts.controller';
import { StoryDraftService } from './story-draft.service';
import { StoryTaskImpactController } from './story-task-impact.controller';
import {
  TaskAcceptanceCriterionLink,
  TaskAcceptanceCriterionLinkSchema,
} from './schemas/task-acceptance-criterion-link.schema';
import {
  StoryImpactAssessment,
  StoryImpactAssessmentSchema,
} from './schemas/story-impact-assessment.schema';
import { StoryImpactService } from './services/story-impact.service';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { TasksModule } from '../tasks/tasks.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import {
  CriterionVerification,
  CriterionVerificationSchema,
} from './schemas/criterion-verification.schema';
import { CriterionVerificationService } from './services/criterion-verification.service';
import { AuditModule } from '../audit/audit.module';
import { StoryCommandAuditListener } from './services/story-command-audit.listener';
import {
  StoryOperation,
  StoryOperationSchema,
} from './schemas/story-operation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StoryContract.name, schema: StoryContractSchema },
      { name: StoryContractCounter.name, schema: StoryContractCounterSchema },
      { name: StoryDraft.name, schema: StoryDraftSchema },
      { name: StoryVersion.name, schema: StoryVersionSchema },
      {
        name: StoryVersionChangeSet.name,
        schema: StoryVersionChangeSetSchema,
      },
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: DecisionProposal.name, schema: DecisionProposalSchema },
      { name: DecisionRecord.name, schema: DecisionRecordSchema },
      { name: ApprovalRequest.name, schema: ApprovalRequestSchema },
      { name: ApprovalRecord.name, schema: ApprovalRecordSchema },
      { name: AcceptanceCriterion.name, schema: AcceptanceCriterionSchema },
      {
        name: AcceptanceCriterionRevision.name,
        schema: AcceptanceCriterionRevisionSchema,
      },
      {
        name: StoryRequirementLink.name,
        schema: StoryRequirementLinkSchema,
      },
      { name: Task.name, schema: TaskSchema },
      {
        name: TaskAcceptanceCriterionLink.name,
        schema: TaskAcceptanceCriterionLinkSchema,
      },
      { name: StoryImpactAssessment.name, schema: StoryImpactAssessmentSchema },
      {
        name: CriterionVerification.name,
        schema: CriterionVerificationSchema,
      },
      { name: StoryOperation.name, schema: StoryOperationSchema },
    ]),
    forwardRef(() => AuthModule),
    RequirementsModule,
    WorkflowsModule,
    forwardRef(() => TasksModule),
    AuditModule,
  ],
  controllers: [StoryContractsController, StoryTaskImpactController],
  providers: [
    StoryContractService,
    StoryDraftService,
    StorySubmissionService,
    StoryDraftRebaseService,
    StoryVersionDiffService,
    AcceptanceCriterionService,
    DecisionService,
    StoryApprovalService,
    StoryAuthorizationService,
    WorkspaceRoleGuard,
    StoryImpactService,
    CriterionVerificationService,
    StoryCommandAuditListener,
  ],
  exports: [StoryImpactService],
})
export class StoryContractsModule {}
