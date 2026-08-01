import 'reflect-metadata';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { WORKSPACE_PERMISSIONS } from '../../common/constants/workspace-permissions.constants';
import { REQUIRED_WORKSPACE_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StoryContractsController } from './story-contracts.controller';

describe('StoryContractsController security metadata', () => {
  const prototype = StoryContractsController.prototype;

  it('delegates decision proposal history reads to the scoped service query', async () => {
    const proposals = [{ _id: 'proposal-1', state: 'OPEN' }];
    const decisions = {
      findProposals: jest.fn().mockResolvedValue(proposals),
    };
    const controller = new StoryContractsController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      decisions as any,
      {} as any,
      {} as any,
    );

    await expect(
      (controller as any).findDecisionProposals('workspace-1', 'contract-1'),
    ).resolves.toEqual(proposals);
    expect(decisions.findProposals).toHaveBeenCalledWith(
      'workspace-1',
      'contract-1',
    );
  });

  it('protects decision proposal history with story:read and validates the Contract id', () => {
    const method = (prototype as any).findDecisionProposals;
    expect(method).toBeDefined();
    expect(
      Reflect.getMetadata(REQUIRED_WORKSPACE_PERMISSIONS_KEY, method),
    ).toEqual([WORKSPACE_PERMISSIONS.STORY_READ]);

    const parameters = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      StoryContractsController,
      'findDecisionProposals',
    );
    expect(Object.values(parameters)).toContainEqual(
      expect.objectContaining({
        data: 'storyContractId',
        pipes: [ParseObjectIdPipe],
      }),
    );
  });

  it('uses JWT and workspace role guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StoryContractsController),
    ).toEqual([JwtAuthGuard, WorkspaceRoleGuard]);
  });

  it('exposes only permissioned create/list criterion verification routes', () => {
    const create = (prototype as any).createCriterionVerification;
    const list = (prototype as any).findCriterionVerifications;

    expect(create).toBeDefined();
    expect(list).toBeDefined();
    expect(
      Reflect.getMetadata(REQUIRED_WORKSPACE_PERMISSIONS_KEY, create),
    ).toEqual([WORKSPACE_PERMISSIONS.CRITERION_SUBMIT_VERIFICATION]);
    expect(
      Reflect.getMetadata(REQUIRED_WORKSPACE_PERMISSIONS_KEY, list),
    ).toEqual([WORKSPACE_PERMISSIONS.STORY_READ]);
    expect((prototype as any).updateCriterionVerification).toBeUndefined();
    expect((prototype as any).deleteCriterionVerification).toBeUndefined();
  });

  it.each([
    ['create', WORKSPACE_PERMISSIONS.STORY_CREATE],
    ['findAll', WORKSPACE_PERMISSIONS.STORY_READ],
    ['findOne', WORKSPACE_PERMISSIONS.STORY_READ],
    ['archive', WORKSPACE_PERMISSIONS.STORY_ARCHIVE],
    ['createDraft', WORKSPACE_PERMISSIONS.STORY_CREATE_DRAFT],
    ['findDrafts', WORKSPACE_PERMISSIONS.STORY_READ],
    ['findDraft', WORKSPACE_PERMISSIONS.STORY_READ],
    ['updateDraft', WORKSPACE_PERMISSIONS.STORY_EDIT_DRAFT],
    ['abandonDraft', WORKSPACE_PERMISSIONS.STORY_EDIT_DRAFT],
    ['submitDraft', WORKSPACE_PERMISSIONS.STORY_SUBMIT],
    ['findVersions', WORKSPACE_PERMISSIONS.STORY_READ],
    ['findVersion', WORKSPACE_PERMISSIONS.STORY_READ],
    ['compareVersions', WORKSPACE_PERMISSIONS.STORY_COMPARE_VERSIONS],
    ['rebaseDraft', WORKSPACE_PERMISSIONS.STORY_EDIT_DRAFT],
    ['findCriterion', WORKSPACE_PERMISSIONS.STORY_READ],
    ['findCriterionRevisions', WORKSPACE_PERMISSIONS.STORY_READ],
    [
      'createCriterionVerification',
      WORKSPACE_PERMISSIONS.CRITERION_SUBMIT_VERIFICATION,
    ],
    ['findCriterionVerifications', WORKSPACE_PERMISSIONS.STORY_READ],
    ['createDecisionProposal', WORKSPACE_PERMISSIONS.DECISION_PROPOSE],
    ['updateDecisionProposal', WORKSPACE_PERMISSIONS.DECISION_PROPOSE],
    ['approveDecisionProposal', WORKSPACE_PERMISSIONS.DECISION_APPROVE],
    ['findDecisions', WORKSPACE_PERMISSIONS.STORY_READ],
    ['supersedeDecision', WORKSPACE_PERMISSIONS.DECISION_APPROVE],
    ['requestApproval', WORKSPACE_PERMISSIONS.STORY_SUBMIT],
    ['approveVersion', WORKSPACE_PERMISSIONS.STORY_APPROVE],
    ['rejectVersion', WORKSPACE_PERMISSIONS.STORY_APPROVE],
    ['findApprovals', WORKSPACE_PERMISSIONS.STORY_READ],
  ] as const)(
    '%s requires the exact Story permission',
    (method, permission) => {
      expect(
        Reflect.getMetadata(
          REQUIRED_WORKSPACE_PERMISSIONS_KEY,
          prototype[method],
        ),
      ).toEqual([permission]);
    },
  );

  it.each([
    'findOne',
    'archive',
    'createDraft',
    'findDrafts',
    'findDraft',
    'updateDraft',
    'abandonDraft',
    'submitDraft',
    'findVersions',
    'findVersion',
    'compareVersions',
    'rebaseDraft',
    'findCriterion',
    'findCriterionRevisions',
    'createCriterionVerification',
    'findCriterionVerifications',
    'createDecisionProposal',
    'updateDecisionProposal',
    'approveDecisionProposal',
    'findDecisions',
    'supersedeDecision',
    'requestApproval',
    'approveVersion',
    'rejectVersion',
    'findApprovals',
  ] as const)('%s validates its story contract id', method => {
    const parameters = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      StoryContractsController,
      method,
    );
    expect(Object.values(parameters)).toContainEqual(
      expect.objectContaining({
        data: 'storyContractId',
        pipes: [ParseObjectIdPipe],
      }),
    );
  });

  it.each(['findDraft', 'updateDraft', 'abandonDraft', 'rebaseDraft'] as const)(
    '%s validates its draft id',
    method => {
      const parameters = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        StoryContractsController,
        method,
      );
      expect(Object.values(parameters)).toContainEqual(
        expect.objectContaining({
          data: 'draftId',
          pipes: [ParseObjectIdPipe],
        }),
      );
    },
  );

  it('validates both scoped story version ids for comparison', () => {
    const parameters = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      StoryContractsController,
      'compareVersions',
    );
    expect(Object.values(parameters)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: 'fromStoryVersionId',
          pipes: [ParseObjectIdPipe],
        }),
        expect.objectContaining({
          data: 'toStoryVersionId',
          pipes: [ParseObjectIdPipe],
        }),
      ]),
    );
  });

  it.each(['submitDraft'] as const)('%s validates its draft id', method => {
    const parameters = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      StoryContractsController,
      method,
    );
    expect(Object.values(parameters)).toContainEqual(
      expect.objectContaining({
        data: 'draftId',
        pipes: [ParseObjectIdPipe],
      }),
    );
  });

  it.each(['findVersion'] as const)(
    '%s validates its story version id',
    method => {
      const parameters = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        StoryContractsController,
        method,
      );
      expect(Object.values(parameters)).toContainEqual(
        expect.objectContaining({
          data: 'storyVersionId',
          pipes: [ParseObjectIdPipe],
        }),
      );
    },
  );

  it.each([
    'findCriterion',
    'findCriterionRevisions',
    'createCriterionVerification',
    'findCriterionVerifications',
  ] as const)('%s validates its criterion id', method => {
    const parameters = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      StoryContractsController,
      method,
    );
    expect(Object.values(parameters)).toContainEqual(
      expect.objectContaining({
        data: 'criterionId',
        pipes: [ParseObjectIdPipe],
      }),
    );
  });

  it.each([
    'createCriterionVerification',
    'findCriterionVerifications',
  ] as const)('%s validates its criterion revision id', method => {
    const parameters = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      StoryContractsController,
      method,
    );
    expect(Object.values(parameters)).toContainEqual(
      expect.objectContaining({
        data: 'revisionId',
        pipes: [ParseObjectIdPipe],
      }),
    );
  });

  it('validates the Story Version query used to list exact verification history', () => {
    const parameters = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      StoryContractsController,
      'findCriterionVerifications',
    );
    expect(Object.values(parameters)).toContainEqual(
      expect.objectContaining({
        data: 'storyVersionId',
        pipes: [ParseObjectIdPipe],
      }),
    );
  });

  it.each(['updateDecisionProposal', 'approveDecisionProposal'] as const)(
    '%s validates its decision proposal id',
    method => {
      const parameters = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        StoryContractsController,
        method,
      );
      expect(Object.values(parameters)).toContainEqual(
        expect.objectContaining({
          data: 'proposalId',
          pipes: [ParseObjectIdPipe],
        }),
      );
    },
  );

  it('validates the superseded decision record id', () => {
    const parameters = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      StoryContractsController,
      'supersedeDecision',
    );
    expect(Object.values(parameters)).toContainEqual(
      expect.objectContaining({
        data: 'decisionRecordId',
        pipes: [ParseObjectIdPipe],
      }),
    );
  });

  it.each(['requestApproval', 'approveVersion', 'rejectVersion'] as const)(
    '%s validates its story version id',
    method => {
      const parameters = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        StoryContractsController,
        method,
      );
      expect(Object.values(parameters)).toContainEqual(
        expect.objectContaining({
          data: 'storyVersionId',
          pipes: [ParseObjectIdPipe],
        }),
      );
    },
  );
});

describe('StoryContractsController delegation', () => {
  const workspaceId = 'workspace-1';
  const storyContractId = 'contract-1';
  const draftId = 'draft-1';
  const storyVersionId = 'version-1';
  const user = { userId: 'user-1' } as any;

  const makeController = () => {
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
    const rebases = { rebase: jest.fn() };
    const versionDiffs = { compare: jest.fn() };
    const criteria = {
      findById: jest.fn(),
      findRevisions: jest.fn(),
    };
    const decisions = {
      createProposal: jest.fn(),
      findProposals: jest.fn(),
      updateProposal: jest.fn(),
      approveProposal: jest.fn(),
      findAll: jest.fn(),
      supersede: jest.fn(),
    };
    const approvals = {
      requestApproval: jest.fn(),
      approve: jest.fn(),
      reject: jest.fn(),
      findAll: jest.fn(),
    };
    const verifications = {
      create: jest.fn(),
      findAll: jest.fn(),
    };

    return {
      controller: new StoryContractsController(
        contracts as any,
        drafts as any,
        submissions as any,
        rebases as any,
        versionDiffs as any,
        criteria as any,
        decisions as any,
        approvals as any,
        verifications as any,
      ),
      contracts,
      drafts,
      submissions,
      rebases,
      versionDiffs,
      criteria,
      decisions,
      approvals,
      verifications,
    };
  };

  it('delegates contract, draft, version and criterion routes with exact scope', () => {
    const services = makeController();
    const { controller } = services;
    const createContract = { title: 'Checkout' } as any;
    const createDraft = { title: 'Checkout v2' } as any;
    const updateDraft = { summary: 'Updated' } as any;
    const verification = { status: 'PASS' } as any;

    controller.create(workspaceId, createContract, user);
    controller.findAll(workspaceId);
    controller.findOne(workspaceId, storyContractId);
    controller.archive(workspaceId, storyContractId, user, {});
    controller.createDraft(workspaceId, storyContractId, createDraft, user);
    controller.findDrafts(workspaceId, storyContractId);
    controller.findDraft(workspaceId, storyContractId, draftId);
    controller.updateDraft(
      workspaceId,
      storyContractId,
      draftId,
      updateDraft,
      user,
    );
    controller.abandonDraft(workspaceId, storyContractId, draftId, user);
    controller.submitDraft(
      workspaceId,
      storyContractId,
      draftId,
      'submit-key',
      user,
    );
    controller.rebaseDraft(workspaceId, storyContractId, draftId, user);
    controller.findVersions(workspaceId, storyContractId);
    controller.findVersion(workspaceId, storyContractId, storyVersionId);
    controller.compareVersions(
      workspaceId,
      storyContractId,
      'version-1',
      'version-2',
    );
    controller.findCriterion(workspaceId, storyContractId, 'criterion-1');
    controller.findCriterionRevisions(
      workspaceId,
      storyContractId,
      'criterion-1',
    );
    controller.createCriterionVerification(
      workspaceId,
      storyContractId,
      'criterion-1',
      'revision-1',
      verification,
      user,
    );
    controller.findCriterionVerifications(
      workspaceId,
      storyContractId,
      'criterion-1',
      'revision-1',
      storyVersionId,
    );

    expect(services.contracts.create).toHaveBeenCalledWith(
      workspaceId,
      createContract,
      user.userId,
    );
    expect(services.contracts.findAll).toHaveBeenCalledWith(workspaceId);
    expect(services.contracts.findById).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
    );
    expect(services.contracts.archive).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      { kind: 'human', userId: user.userId, permissions: [] },
    );
    expect(services.drafts.create).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      createDraft,
      user.userId,
    );
    expect(services.drafts.findAll).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
    );
    expect(services.drafts.findById).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      draftId,
    );
    expect(services.drafts.update).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      draftId,
      updateDraft,
      user.userId,
    );
    expect(services.drafts.abandon).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      draftId,
      user.userId,
    );
    expect(services.submissions.submit).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      draftId,
      user.userId,
      'submit-key',
    );
    expect(services.rebases.rebase).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      draftId,
      user.userId,
    );
    expect(services.submissions.findVersions).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
    );
    expect(services.submissions.findVersion).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      storyVersionId,
    );
    expect(services.versionDiffs.compare).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      'version-1',
      'version-2',
    );
    expect(services.criteria.findById).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      'criterion-1',
    );
    expect(services.criteria.findRevisions).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      'criterion-1',
    );
    expect(services.verifications.create).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      'criterion-1',
      'revision-1',
      verification,
      user.userId,
    );
    expect(services.verifications.findAll).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      storyVersionId,
      'criterion-1',
      'revision-1',
    );
  });

  it('delegates decision and approval routes with the authorized human actor', () => {
    const services = makeController();
    const { controller } = services;
    const request = {
      workspaceAuth: {
        permissions: [WORKSPACE_PERMISSIONS.DECISION_APPROVE],
      },
    };
    const proposal = { question: 'Which provider?' } as any;
    const proposalUpdate = { question: 'Which payment provider?' } as any;
    const resolution = { resolution: 'Use Stripe' } as any;

    controller.createDecisionProposal(
      workspaceId,
      storyContractId,
      proposal,
      user,
      request,
    );
    controller.findDecisionProposals(workspaceId, storyContractId);
    controller.updateDecisionProposal(
      workspaceId,
      storyContractId,
      'proposal-1',
      proposalUpdate,
      user,
      request,
    );
    controller.approveDecisionProposal(
      workspaceId,
      storyContractId,
      'proposal-1',
      resolution,
      user,
      request,
    );
    controller.findDecisions(workspaceId, storyContractId);
    controller.supersedeDecision(
      workspaceId,
      storyContractId,
      'decision-1',
      resolution,
      user,
      request,
    );
    controller.requestApproval(
      workspaceId,
      storyContractId,
      storyVersionId,
      user,
      request,
    );
    controller.approveVersion(
      workspaceId,
      storyContractId,
      storyVersionId,
      {
        approvalRequestId: 'approval-1',
        expectedCurrentVersionId: 'version-0',
      },
      'approval-key',
      user,
      request,
    );
    controller.rejectVersion(
      workspaceId,
      storyContractId,
      storyVersionId,
      { approvalRequestId: 'approval-1', reason: 'Incomplete' },
      user,
      request,
    );
    controller.findApprovals(workspaceId, storyContractId);

    const actor = {
      kind: 'human',
      userId: user.userId,
      permissions: [WORKSPACE_PERMISSIONS.DECISION_APPROVE],
    };
    expect(services.decisions.createProposal).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      proposal,
      actor,
    );
    expect(services.decisions.findProposals).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
    );
    expect(services.decisions.updateProposal).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      'proposal-1',
      proposalUpdate,
      actor,
    );
    expect(services.decisions.approveProposal).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      'proposal-1',
      resolution,
      actor,
    );
    expect(services.decisions.findAll).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
    );
    expect(services.decisions.supersede).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      'decision-1',
      resolution,
      actor,
    );
    expect(services.approvals.requestApproval).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      storyVersionId,
      actor,
    );
    expect(services.approvals.approve).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      storyVersionId,
      'approval-1',
      { expectedCurrentVersionId: 'version-0' },
      actor,
      'approval-key',
    );
    expect(services.approvals.reject).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      storyVersionId,
      'approval-1',
      { reason: 'Incomplete' },
      actor,
    );
    expect(services.approvals.findAll).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
    );
  });
});
