import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  WORKSPACE_PERMISSIONS,
  getPermissionsForWorkspaceRole,
} from '../src/common/constants/workspace-permissions.constants';
import { SPACE_ROLES } from '../src/common/constants/space-role.constants';
import { REQUIRED_WORKSPACE_PERMISSIONS_KEY } from '../src/common/decorators/require-permissions.decorator';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ErrorFactory } from '../src/common/factories/error.factory';
import { WorkspaceRoleGuard } from '../src/common/guards/workspace-role.guard';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { RequirementsController } from '../src/modules/requirements/requirements.controller';
import { RequirementsService } from '../src/modules/requirements/requirements.service';
import { AcceptanceCriterionService } from '../src/modules/story-contracts/services/acceptance-criterion.service';
import { CriterionVerificationService } from '../src/modules/story-contracts/services/criterion-verification.service';
import { DecisionService } from '../src/modules/story-contracts/services/decision.service';
import { StoryApprovalService } from '../src/modules/story-contracts/services/story-approval.service';
import { StoryDraftRebaseService } from '../src/modules/story-contracts/services/story-draft-rebase.service';
import { StoryImpactService } from '../src/modules/story-contracts/services/story-impact.service';
import { StorySubmissionService } from '../src/modules/story-contracts/services/story-submission.service';
import { StoryVersionDiffService } from '../src/modules/story-contracts/services/story-version-diff.service';
import { StoryContractService } from '../src/modules/story-contracts/story-contract.service';
import { StoryContractsController } from '../src/modules/story-contracts/story-contracts.controller';
import { StoryDraftService } from '../src/modules/story-contracts/story-draft.service';
import { StoryTaskImpactController } from '../src/modules/story-contracts/story-task-impact.controller';

class TestJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getRequest().user = {
      userId: '507f1f77bcf86cd799439011',
    };
    return true;
  }
}

class TestWorkspaceGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const role = request.headers['x-workspace-role'] ?? SPACE_ROLES.MEMBER;
    const permissions = getPermissionsForWorkspaceRole(role);
    const required =
      this.reflector.getAllAndOverride<string[]>(
        REQUIRED_WORKSPACE_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    if (
      !required.every(permission => permissions.includes(permission as any))
    ) {
      throw new ForbiddenException('Missing workspace permission');
    }
    request.workspaceAuth = {
      workspaceId: request.params.workspaceId,
      role,
      permissions,
    };
    return true;
  }
}

describe('Story Governance HTTP contract', () => {
  const workspaceId = '507f1f77bcf86cd799439012';
  const contractId = '507f1f77bcf86cd799439013';
  const draftId = '507f1f77bcf86cd799439014';
  const versionId = '507f1f77bcf86cd799439015';
  const requestId = '507f1f77bcf86cd799439016';
  const taskId = '507f1f77bcf86cd799439017';
  const assessmentId = '507f1f77bcf86cd799439018';
  const contracts = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    archive: jest.fn(),
  };
  const drafts = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    abandon: jest.fn(),
  };
  const submissions = {
    submit: jest.fn(),
    findVersions: jest.fn(),
    findVersion: jest.fn(),
  };
  const approvals = {
    requestApproval: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    findAll: jest.fn(),
  };
  const impacts = {
    linkTask: jest.fn(),
    findVersionImpact: jest.fn(),
    findTaskImpact: jest.fn(),
    resolve: jest.fn(),
  };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        StoryContractsController,
        StoryTaskImpactController,
        RequirementsController,
      ],
      providers: [
        { provide: StoryContractService, useValue: contracts },
        { provide: StoryDraftService, useValue: drafts },
        { provide: StorySubmissionService, useValue: submissions },
        { provide: StoryApprovalService, useValue: approvals },
        { provide: StoryImpactService, useValue: impacts },
        { provide: StoryDraftRebaseService, useValue: { rebase: jest.fn() } },
        { provide: StoryVersionDiffService, useValue: { compare: jest.fn() } },
        { provide: AcceptanceCriterionService, useValue: {} },
        { provide: DecisionService, useValue: {} },
        { provide: CriterionVerificationService, useValue: {} },
        { provide: RequirementsService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestJwtGuard)
      .overrideGuard(WorkspaceRoleGuard)
      .useValue(new TestWorkspaceGuard(new Reflector()))
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  it('enforces viewer, member, and administrator permissions over HTTP', async () => {
    contracts.findAll.mockResolvedValue([]);
    contracts.create.mockResolvedValue({ _id: contractId });
    approvals.approve.mockResolvedValue({ _id: requestId });

    await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/story-contracts`)
      .set('x-workspace-role', SPACE_ROLES.VIEWER)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/story-contracts`)
      .set('x-workspace-role', SPACE_ROLES.VIEWER)
      .send({
        title: 'Story',
        primaryRequirementId: requestId,
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/story-contracts`)
      .set('x-workspace-role', SPACE_ROLES.MEMBER)
      .send({
        title: 'Story',
        primaryRequirementId: requestId,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/workspaces/${workspaceId}/story-contracts/${contractId}/versions/${versionId}/approve`,
      )
      .set('x-workspace-role', SPACE_ROLES.MEMBER)
      .send({ approvalRequestId: requestId, expectedCurrentVersionId: null })
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `/workspaces/${workspaceId}/story-contracts/${contractId}/versions/${versionId}/approve`,
      )
      .set('x-workspace-role', SPACE_ROLES.WORKSPACE_ADMIN)
      .send({ approvalRequestId: requestId, expectedCurrentVersionId: null })
      .expect(201);
  });

  it('forwards Idempotency-Key only to submit, approve, and resolve impact', async () => {
    submissions.submit.mockResolvedValue({ _id: versionId });
    approvals.approve.mockResolvedValue({ _id: requestId });
    impacts.resolve.mockResolvedValue({ _id: assessmentId });

    await request(app.getHttpServer())
      .post(
        `/workspaces/${workspaceId}/story-contracts/${contractId}/drafts/${draftId}/submit`,
      )
      .set('Idempotency-Key', 'submit-key')
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/workspaces/${workspaceId}/story-contracts/${contractId}/versions/${versionId}/approve`,
      )
      .set('x-workspace-role', SPACE_ROLES.WORKSPACE_ADMIN)
      .set('Idempotency-Key', 'approve-key')
      .send({ approvalRequestId: requestId, expectedCurrentVersionId: null })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/workspaces/${workspaceId}/tasks/${taskId}/story-impact/${assessmentId}/resolve`,
      )
      .set('Idempotency-Key', 'resolve-key')
      .expect(201);

    expect(submissions.submit).toHaveBeenCalledWith(
      workspaceId,
      contractId,
      draftId,
      expect.any(String),
      'submit-key',
    );
    expect(approvals.approve).toHaveBeenCalledWith(
      workspaceId,
      contractId,
      versionId,
      requestId,
      { expectedCurrentVersionId: null },
      expect.objectContaining({ kind: 'human' }),
      'approve-key',
    );
    expect(impacts.resolve).toHaveBeenCalledWith(
      workspaceId,
      taskId,
      assessmentId,
      expect.objectContaining({ isAdmin: false }),
      'resolve-key',
    );
  });

  it('returns the same safe envelope for unknown and wrong-parent resources', async () => {
    contracts.findById.mockRejectedValue(
      new NotFoundException('Story contract not found'),
    );

    const unknown = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/story-contracts/${contractId}`)
      .expect(404);
    const wrongParent = await request(app.getHttpServer())
      .get(`/workspaces/507f1f77bcf86cd799439099/story-contracts/${contractId}`)
      .expect(404);

    expect(wrongParent.body.message).toBe(unknown.body.message);
    expect(wrongParent.body.statusCode).toBe(404);
    expect(wrongParent.body.path).toBeDefined();
  });

  it('returns IDEMPOTENCY_CONFLICT in the existing API envelope', async () => {
    approvals.approve.mockRejectedValue(
      new ConflictException(ErrorFactory.idempotencyConflict()),
    );

    const response = await request(app.getHttpServer())
      .post(
        `/workspaces/${workspaceId}/story-contracts/${contractId}/versions/${versionId}/approve`,
      )
      .set('x-workspace-role', SPACE_ROLES.WORKSPACE_ADMIN)
      .set('Idempotency-Key', 'approve-key')
      .send({ approvalRequestId: requestId, expectedCurrentVersionId: null })
      .expect(409);

    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 409,
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'IDEMPOTENCY_CONFLICT',
        path: expect.any(String),
        timestamp: expect.any(String),
      }),
    );
  });

  it('rejects invalid enums and oversized text through the HTTP ValidationPipe', async () => {
    const response = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/story-contracts`)
      .send({
        title: 'x'.repeat(256),
        primaryRequirementId: requestId,
      })
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('title')]),
    );
    expect(WORKSPACE_PERMISSIONS.STORY_CREATE).toBe('story:create');
  });
});
