import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  WORKSPACE_PERMISSIONS,
  WorkspacePermission,
} from '../../common/constants/workspace-permissions.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import {
  ApproveStoryVersionDto,
  CreateDecisionProposalDto,
  CreateCriterionVerificationDto,
  CreateStoryContractDto,
  CreateStoryDraftDto,
  DecisionResolutionDto,
  RejectStoryVersionDto,
  UpdateDecisionProposalDto,
  UpdateStoryDraftDto,
} from './dtos/story-contract.dto';
import { DecisionService } from './services/decision.service';
import { StoryContractService } from './story-contract.service';
import { StoryDraftService } from './story-draft.service';
import { AcceptanceCriterionService } from './services/acceptance-criterion.service';
import { StoryApprovalService } from './services/story-approval.service';
import { StorySubmissionService } from './services/story-submission.service';
import { StoryDraftRebaseService } from './services/story-draft-rebase.service';
import { StoryVersionDiffService } from './services/story-version-diff.service';
import { CriterionVerificationService } from './services/criterion-verification.service';

type WorkspaceAuthorizedRequest = {
  workspaceAuth?: { permissions: WorkspacePermission[] };
};

@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
@Controller('workspaces/:workspaceId/story-contracts')
export class StoryContractsController {
  constructor(
    private readonly contracts: StoryContractService,
    private readonly drafts: StoryDraftService,
    private readonly submissions: StorySubmissionService,
    private readonly rebases: StoryDraftRebaseService,
    private readonly versionDiffs: StoryVersionDiffService,
    private readonly criteria: AcceptanceCriterionService,
    private readonly decisions: DecisionService,
    private readonly approvals: StoryApprovalService,
    private readonly verifications: CriterionVerificationService,
  ) {}

  @Post()
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_CREATE)
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateStoryContractDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.contracts.create(workspaceId, dto, user.userId);
  }
  @Get()
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.contracts.findAll(workspaceId);
  }
  @Get(':storyContractId')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
  ) {
    return this.contracts.findById(workspaceId, storyContractId);
  }
  @Post(':storyContractId/archive')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_ARCHIVE)
  archive(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: WorkspaceAuthorizedRequest,
  ) {
    return this.contracts.archive(
      workspaceId,
      storyContractId,
      this.humanActor(user, request),
    );
  }
  @Post(':storyContractId/drafts')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_CREATE_DRAFT)
  createDraft(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Body() dto: CreateStoryDraftDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.drafts.create(workspaceId, storyContractId, dto, user.userId);
  }
  @Get(':storyContractId/drafts')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  findDrafts(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
  ) {
    return this.drafts.findAll(workspaceId, storyContractId);
  }
  @Get(':storyContractId/drafts/:draftId')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  findDraft(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('draftId', ParseObjectIdPipe) draftId: string,
  ) {
    return this.drafts.findById(workspaceId, storyContractId, draftId);
  }
  @Patch(':storyContractId/drafts/:draftId')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_EDIT_DRAFT)
  updateDraft(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('draftId', ParseObjectIdPipe) draftId: string,
    @Body() dto: UpdateStoryDraftDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.drafts.update(
      workspaceId,
      storyContractId,
      draftId,
      dto,
      user.userId,
    );
  }
  @Post(':storyContractId/drafts/:draftId/abandon')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_EDIT_DRAFT)
  abandonDraft(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('draftId', ParseObjectIdPipe) draftId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.drafts.abandon(
      workspaceId,
      storyContractId,
      draftId,
      user.userId,
    );
  }

  @Post(':storyContractId/drafts/:draftId/submit')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_SUBMIT)
  submitDraft(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('draftId', ParseObjectIdPipe) draftId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.submissions.submit(
      workspaceId,
      storyContractId,
      draftId,
      user.userId,
      idempotencyKey,
    );
  }

  @Post(':storyContractId/drafts/:draftId/rebase')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_EDIT_DRAFT)
  rebaseDraft(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('draftId', ParseObjectIdPipe) draftId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rebases.rebase(
      workspaceId,
      storyContractId,
      draftId,
      user.userId,
    );
  }

  @Get(':storyContractId/versions')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  findVersions(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
  ) {
    return this.submissions.findVersions(workspaceId, storyContractId);
  }

  @Get(':storyContractId/versions/:storyVersionId')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  findVersion(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('storyVersionId', ParseObjectIdPipe) storyVersionId: string,
  ) {
    return this.submissions.findVersion(
      workspaceId,
      storyContractId,
      storyVersionId,
    );
  }

  @Get(':storyContractId/versions/:fromStoryVersionId/diff/:toStoryVersionId')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_COMPARE_VERSIONS)
  compareVersions(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('fromStoryVersionId', ParseObjectIdPipe)
    fromStoryVersionId: string,
    @Param('toStoryVersionId', ParseObjectIdPipe) toStoryVersionId: string,
  ) {
    return this.versionDiffs.compare(
      workspaceId,
      storyContractId,
      fromStoryVersionId,
      toStoryVersionId,
    );
  }

  @Get(':storyContractId/criteria/:criterionId')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  findCriterion(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('criterionId', ParseObjectIdPipe) criterionId: string,
  ) {
    return this.criteria.findById(workspaceId, storyContractId, criterionId);
  }

  @Get(':storyContractId/criteria/:criterionId/revisions')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  findCriterionRevisions(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('criterionId', ParseObjectIdPipe) criterionId: string,
  ) {
    return this.criteria.findRevisions(
      workspaceId,
      storyContractId,
      criterionId,
    );
  }

  @Post(
    ':storyContractId/criteria/:criterionId/revisions/:revisionId/verifications',
  )
  @RequirePermissions(WORKSPACE_PERMISSIONS.CRITERION_SUBMIT_VERIFICATION)
  createCriterionVerification(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('criterionId', ParseObjectIdPipe) criterionId: string,
    @Param('revisionId', ParseObjectIdPipe) revisionId: string,
    @Body() dto: CreateCriterionVerificationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.verifications.create(
      workspaceId,
      storyContractId,
      criterionId,
      revisionId,
      dto,
      user.userId,
    );
  }

  @Get(
    ':storyContractId/criteria/:criterionId/revisions/:revisionId/verifications',
  )
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  findCriterionVerifications(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('criterionId', ParseObjectIdPipe) criterionId: string,
    @Param('revisionId', ParseObjectIdPipe) revisionId: string,
    @Query('storyVersionId', ParseObjectIdPipe) storyVersionId: string,
  ) {
    return this.verifications.findAll(
      workspaceId,
      storyContractId,
      storyVersionId,
      criterionId,
      revisionId,
    );
  }

  @Post(':storyContractId/decision-proposals')
  @RequirePermissions(WORKSPACE_PERMISSIONS.DECISION_PROPOSE)
  createDecisionProposal(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Body() dto: CreateDecisionProposalDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: WorkspaceAuthorizedRequest,
  ) {
    return this.decisions.createProposal(
      workspaceId,
      storyContractId,
      dto,
      this.humanActor(user, request),
    );
  }

  @Get(':storyContractId/decision-proposals')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  findDecisionProposals(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
  ) {
    return this.decisions.findProposals(workspaceId, storyContractId);
  }

  @Patch(':storyContractId/decision-proposals/:proposalId')
  @RequirePermissions(WORKSPACE_PERMISSIONS.DECISION_PROPOSE)
  updateDecisionProposal(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('proposalId', ParseObjectIdPipe) proposalId: string,
    @Body() dto: UpdateDecisionProposalDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: WorkspaceAuthorizedRequest,
  ) {
    return this.decisions.updateProposal(
      workspaceId,
      storyContractId,
      proposalId,
      dto,
      this.humanActor(user, request),
    );
  }

  @Post(':storyContractId/decision-proposals/:proposalId/approve')
  @RequirePermissions(WORKSPACE_PERMISSIONS.DECISION_APPROVE)
  approveDecisionProposal(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('proposalId', ParseObjectIdPipe) proposalId: string,
    @Body() dto: DecisionResolutionDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: WorkspaceAuthorizedRequest,
  ) {
    return this.decisions.approveProposal(
      workspaceId,
      storyContractId,
      proposalId,
      dto,
      this.humanActor(user, request),
    );
  }

  @Get(':storyContractId/decisions')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  findDecisions(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
  ) {
    return this.decisions.findAll(workspaceId, storyContractId);
  }

  @Post(':storyContractId/decisions/:decisionRecordId/supersede')
  @RequirePermissions(WORKSPACE_PERMISSIONS.DECISION_APPROVE)
  supersedeDecision(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('decisionRecordId', ParseObjectIdPipe) decisionRecordId: string,
    @Body() dto: DecisionResolutionDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: WorkspaceAuthorizedRequest,
  ) {
    return this.decisions.supersede(
      workspaceId,
      storyContractId,
      decisionRecordId,
      dto,
      this.humanActor(user, request),
    );
  }

  @Post(':storyContractId/versions/:storyVersionId/approval-requests')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_SUBMIT)
  requestApproval(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('storyVersionId', ParseObjectIdPipe) storyVersionId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: WorkspaceAuthorizedRequest,
  ) {
    return this.approvals.requestApproval(
      workspaceId,
      storyContractId,
      storyVersionId,
      this.humanActor(user, request),
    );
  }

  @Post(':storyContractId/versions/:storyVersionId/approve')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_APPROVE)
  approveVersion(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('storyVersionId', ParseObjectIdPipe) storyVersionId: string,
    @Body() dto: ApproveStoryVersionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: JwtPayload,
    @Req() request: WorkspaceAuthorizedRequest,
  ) {
    return this.approvals.approve(
      workspaceId,
      storyContractId,
      storyVersionId,
      dto.approvalRequestId,
      { expectedCurrentVersionId: dto.expectedCurrentVersionId },
      this.humanActor(user, request),
      idempotencyKey,
    );
  }

  @Post(':storyContractId/versions/:storyVersionId/reject')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_APPROVE)
  rejectVersion(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
    @Param('storyVersionId', ParseObjectIdPipe) storyVersionId: string,
    @Body() dto: RejectStoryVersionDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: WorkspaceAuthorizedRequest,
  ) {
    return this.approvals.reject(
      workspaceId,
      storyContractId,
      storyVersionId,
      dto.approvalRequestId,
      { reason: dto.reason },
      this.humanActor(user, request),
    );
  }

  @Get(':storyContractId/approvals')
  @RequirePermissions(WORKSPACE_PERMISSIONS.STORY_READ)
  findApprovals(
    @Param('workspaceId') workspaceId: string,
    @Param('storyContractId', ParseObjectIdPipe) storyContractId: string,
  ) {
    return this.approvals.findAll(workspaceId, storyContractId);
  }

  private humanActor(user: JwtPayload, request: WorkspaceAuthorizedRequest) {
    return {
      kind: 'human' as const,
      userId: user.userId,
      permissions: request.workspaceAuth?.permissions ?? [],
    };
  }
}
