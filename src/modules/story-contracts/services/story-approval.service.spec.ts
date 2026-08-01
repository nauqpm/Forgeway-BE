import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { WORKSPACE_PERMISSIONS } from '../../../common/constants/workspace-permissions.constants';
import { StoryApprovalService } from './story-approval.service';
import { StoryAuthorizationService } from './story-authorization.service';

describe('StoryApprovalService', () => {
  const workspaceId = new Types.ObjectId().toString();
  const storyContractId = new Types.ObjectId().toString();
  const storyVersionId = new Types.ObjectId().toString();
  const approvalRequestId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const submitterId = new Types.ObjectId().toString();
  const human = {
    kind: 'human' as const,
    userId,
    permissions: [] as const,
  };
  const session = {
    withTransaction: jest.fn(),
    endSession: jest.fn(),
  };
  const requestModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
  };
  const recordModel = {
    create: jest.fn(),
    countDocuments: jest.fn(),
    find: jest.fn(),
  };
  const contractModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const versionModel = { findOne: jest.fn() };
  const draftModel = { updateMany: jest.fn() };
  const workspaceModel = { findOne: jest.fn() };
  const versionDiffs = { persist: jest.fn() };
  const impacts = { assess: jest.fn() };
  const connection = { startSession: jest.fn() };
  const events = { emit: jest.fn() };
  const operations = {
    findOne: jest.fn(),
    create: jest.fn(),
  };
  let service: StoryApprovalService;

  const activeWorkspace = (settings: Record<string, unknown> = {}) => ({
    _id: workspaceId,
    ownerId: userId,
    members: [],
    settings,
    status: 'active',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(async work => work());
    workspaceModel.findOne.mockResolvedValue(activeWorkspace());
    contractModel.findOne.mockResolvedValue({
      _id: storyContractId,
      status: 'active',
      currentApprovedStoryVersionId: null,
      version: 4,
    });
    versionModel.findOne.mockResolvedValue({
      _id: storyVersionId,
      baseStoryVersionId: null,
      submittedBy: submitterId,
    });
    requestModel.findOne.mockResolvedValue({
      _id: approvalRequestId,
      state: 'PENDING',
      requestedBy: submitterId,
    });
    requestModel.findOneAndUpdate.mockResolvedValue({
      _id: approvalRequestId,
      state: 'APPROVED',
    });
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      currentApprovedStoryVersionId: storyVersionId,
      version: 5,
    });
    recordModel.countDocuments.mockResolvedValue(0);
    recordModel.create.mockResolvedValue([
      { _id: new Types.ObjectId(), decision: 'APPROVE' },
    ]);
    draftModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
    impacts.assess.mockResolvedValue([]);
    service = new (StoryApprovalService as any)(
      requestModel as any,
      recordModel as any,
      contractModel as any,
      versionModel as any,
      draftModel as any,
      workspaceModel as any,
      versionDiffs as any,
      new StoryAuthorizationService(),
      connection as any,
      events as any,
      impacts as any,
      operations as any,
    );
  });

  it('creates approval only through the separate request command', async () => {
    const request = { _id: approvalRequestId, state: 'PENDING' };
    requestModel.create.mockResolvedValue([request]);

    await expect(
      service.requestApproval(workspaceId, storyContractId, storyVersionId, {
        kind: 'human',
        userId,
        permissions: [WORKSPACE_PERMISSIONS.STORY_SUBMIT],
      }),
    ).resolves.toEqual(request);

    expect(workspaceModel.findOne).toHaveBeenCalledWith(
      { _id: workspaceId, status: 'active' },
      null,
      { session },
    );
    expect(versionModel.findOne).toHaveBeenCalledWith(
      {
        _id: storyVersionId,
        workspaceId,
        storyContractId,
      },
      null,
      { session },
    );
    expect(requestModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          workspaceId,
          storyContractId,
          storyVersionId,
          state: 'PENDING',
          requestedBy: userId,
        }),
      ],
      { session },
    );
    expect(events.emit).toHaveBeenCalledWith(
      'story.approval.requested',
      expect.objectContaining({
        data: expect.objectContaining({
          aggregateId: storyContractId,
          approvalRequestId,
        }),
      }),
    );
  });

  it('uses fresh Workspace membership instead of trusted actor permissions', async () => {
    workspaceModel.findOne.mockResolvedValue({
      ...activeWorkspace(),
      ownerId: new Types.ObjectId(),
      members: [{ userId, role: 'member' }],
    });

    await expect(
      service.approve(
        workspaceId,
        storyContractId,
        storyVersionId,
        approvalRequestId,
        { expectedCurrentVersionId: null },
        {
          kind: 'human',
          userId,
          permissions: [WORKSPACE_PERMISSIONS.STORY_APPROVE],
        },
      ),
    ).rejects.toMatchObject({
      response: { code: 'APPROVAL_PERMISSION_REQUIRED' },
    });
    expect(recordModel.create).not.toHaveBeenCalled();
  });

  it('rejects an agent even if membership and token scopes request approval', async () => {
    await expect(
      service.approve(
        workspaceId,
        storyContractId,
        storyVersionId,
        approvalRequestId,
        { expectedCurrentVersionId: null },
        {
          kind: 'agent',
          agentId: 'agent-1',
          memberPermissions: [WORKSPACE_PERMISSIONS.STORY_APPROVE],
          tokenScopes: [WORKSPACE_PERMISSIONS.STORY_APPROVE],
        },
      ),
    ).rejects.toMatchObject({
      response: { code: 'APPROVAL_PERMISSION_REQUIRED' },
    });
    expect(connection.startSession).not.toHaveBeenCalled();
  });

  it('enforces the independent approver policy against the submitter', async () => {
    workspaceModel.findOne.mockResolvedValue(
      activeWorkspace({
        storyApprovalPolicy: {
          minimumApprovals: 1,
          allowAuthorApproval: true,
          requireIndependentApproval: true,
        },
      }),
    );
    versionModel.findOne.mockResolvedValue({
      _id: storyVersionId,
      baseStoryVersionId: null,
      submittedBy: userId,
    });

    await expect(
      service.approve(
        workspaceId,
        storyContractId,
        storyVersionId,
        approvalRequestId,
        { expectedCurrentVersionId: null },
        human,
      ),
    ).rejects.toMatchObject({
      response: { code: 'APPROVAL_POLICY_NOT_SATISFIED' },
    });
    expect(recordModel.create).not.toHaveBeenCalled();
  });

  it('allows author approval under the unconfigured Workspace policy baseline', async () => {
    versionModel.findOne.mockResolvedValue({
      _id: storyVersionId,
      baseStoryVersionId: null,
      submittedBy: userId,
    });

    await expect(
      service.approve(
        workspaceId,
        storyContractId,
        storyVersionId,
        approvalRequestId,
        { expectedCurrentVersionId: null },
        human,
      ),
    ).resolves.toMatchObject({ decision: 'APPROVE' });
  });

  it('audits a partial approval without claiming the version was approved', async () => {
    workspaceModel.findOne.mockResolvedValue(
      activeWorkspace({
        storyApprovalPolicy: {
          minimumApprovals: 2,
          allowAuthorApproval: true,
          requireIndependentApproval: false,
        },
      }),
    );

    await service.approve(
      workspaceId,
      storyContractId,
      storyVersionId,
      approvalRequestId,
      { expectedCurrentVersionId: null },
      human,
    );

    expect(events.emit).toHaveBeenCalledWith(
      'story.approval.recorded',
      expect.objectContaining({
        data: expect.objectContaining({ approved: false }),
      }),
    );
    expect(events.emit).not.toHaveBeenCalledWith(
      'story.version.approved',
      expect.anything(),
    );
    expect(contractModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('replays approval for the same actor, key, and payload without a second record', async () => {
    const approvalRecord = {
      _id: new Types.ObjectId(),
      decision: 'APPROVE',
    };
    recordModel.create.mockResolvedValue([approvalRecord]);
    let savedOperation: Record<string, unknown> | undefined;
    operations.findOne.mockImplementation(() =>
      Promise.resolve(savedOperation),
    );
    operations.create.mockImplementation(async ([record]) => {
      savedOperation = record;
      return [record];
    });

    const first = await (service as any).approve(
      workspaceId,
      storyContractId,
      storyVersionId,
      approvalRequestId,
      { expectedCurrentVersionId: null },
      human,
      'approve-key',
    );
    const replay = await (service as any).approve(
      workspaceId,
      storyContractId,
      storyVersionId,
      approvalRequestId,
      { expectedCurrentVersionId: null },
      human,
      'approve-key',
    );

    expect(replay).toEqual(first);
    expect(recordModel.create).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledTimes(2);
  });

  it('rejects a reused approval key when the request payload changes', async () => {
    let savedOperation: Record<string, unknown> | undefined;
    operations.findOne.mockImplementation(() =>
      Promise.resolve(savedOperation),
    );
    operations.create.mockImplementation(async ([record]) => {
      savedOperation = record;
      return [record];
    });

    await (service as any).approve(
      workspaceId,
      storyContractId,
      storyVersionId,
      approvalRequestId,
      { expectedCurrentVersionId: null },
      human,
      'approve-key',
    );

    await expect(
      (service as any).approve(
        workspaceId,
        storyContractId,
        storyVersionId,
        approvalRequestId,
        { expectedCurrentVersionId: new Types.ObjectId().toString() },
        human,
        'approve-key',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'IDEMPOTENCY_CONFLICT',
      },
    });
    expect(recordModel.create).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed legacy policy values instead of changing approval behavior', async () => {
    workspaceModel.findOne.mockResolvedValue(
      activeWorkspace({
        storyApprovalPolicy: {
          minimumApprovals: 0,
          allowAuthorApproval: 'not-a-boolean',
          requireIndependentApproval: 'not-a-boolean',
        },
      }),
    );
    versionModel.findOne.mockResolvedValue({
      _id: storyVersionId,
      baseStoryVersionId: null,
      submittedBy: userId,
    });

    await expect(
      service.approve(
        workspaceId,
        storyContractId,
        storyVersionId,
        approvalRequestId,
        { expectedCurrentVersionId: null },
        human,
      ),
    ).resolves.toMatchObject({ decision: 'APPROVE' });
  });

  it('prefers the typed Workspace policy over compatible legacy settings', async () => {
    workspaceModel.findOne.mockResolvedValue({
      ...activeWorkspace({
        storyApprovalPolicy: {
          minimumApprovals: 1,
          allowAuthorApproval: true,
          requireIndependentApproval: false,
        },
      }),
      storyApprovalPolicy: {
        minimumApprovals: 1,
        allowAuthorApproval: false,
        requireIndependentApproval: true,
      },
    });
    versionModel.findOne.mockResolvedValue({
      _id: storyVersionId,
      baseStoryVersionId: null,
      submittedBy: userId,
    });

    await expect(
      service.approve(
        workspaceId,
        storyContractId,
        storyVersionId,
        approvalRequestId,
        { expectedCurrentVersionId: null },
        human,
      ),
    ).rejects.toMatchObject({
      response: { code: 'APPROVAL_POLICY_NOT_SATISFIED' },
    });
    expect(recordModel.create).not.toHaveBeenCalled();
  });

  it('atomically records final approval, resolves the request, and switches the pointer', async () => {
    const record = { _id: new Types.ObjectId(), decision: 'APPROVE' };
    recordModel.create.mockResolvedValue([record]);

    await expect(
      service.approve(
        workspaceId,
        storyContractId,
        storyVersionId,
        approvalRequestId,
        { expectedCurrentVersionId: null },
        human,
      ),
    ).resolves.toEqual(record);

    expect(recordModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          workspaceId,
          storyContractId,
          storyVersionId,
          approvalRequestId,
          decision: 'APPROVE',
          actorId: userId,
        }),
      ],
      { session },
    );
    expect(requestModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: approvalRequestId,
        workspaceId,
        storyContractId,
        storyVersionId,
        state: 'PENDING',
      },
      {
        $set: expect.objectContaining({
          state: 'APPROVED',
        }),
      },
      { new: true, session },
    );
    expect(contractModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: storyContractId,
        workspaceId,
        status: 'active',
        currentApprovedStoryVersionId: null,
      },
      {
        $set: { currentApprovedStoryVersionId: storyVersionId },
        $inc: { version: 1 },
      },
      { new: true, session },
    );
    expect(draftModel.updateMany).toHaveBeenCalledWith(
      {
        workspaceId,
        storyContractId,
        status: 'active',
        baseStoryVersionId: null,
      },
      { $set: { status: 'stale' } },
      { session },
    );
    expect(events.emit).toHaveBeenCalledWith(
      'story.version.approved',
      expect.objectContaining({
        data: expect.objectContaining({
          aggregateId: storyContractId,
          storyVersionId,
        }),
      }),
    );
    expect(session.withTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      events.emit.mock.invocationCallOrder[0],
    );
  });

  it('persists the approved version transition in the approval transaction', async () => {
    const previousVersionId = new Types.ObjectId().toString();
    versionModel.findOne.mockResolvedValue({
      _id: storyVersionId,
      baseStoryVersionId: previousVersionId,
      submittedBy: submitterId,
    });

    await service.approve(
      workspaceId,
      storyContractId,
      storyVersionId,
      approvalRequestId,
      { expectedCurrentVersionId: previousVersionId },
      human,
    );

    expect(versionDiffs.persist).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      previousVersionId,
      storyVersionId,
      session,
    );
  });

  it('assesses linked tasks in the approval transaction and emits impact events after commit', async () => {
    const previousVersionId = new Types.ObjectId().toString();
    versionModel.findOne.mockResolvedValue({
      _id: storyVersionId,
      baseStoryVersionId: previousVersionId,
      submittedBy: submitterId,
    });
    impacts.assess.mockResolvedValue([
      { taskId: 'task-1', requirementsState: 'REBASE_REQUIRED' },
      { taskId: 'task-2', requirementsState: 'REVIEW_REQUIRED' },
    ]);

    await service.approve(
      workspaceId,
      storyContractId,
      storyVersionId,
      approvalRequestId,
      { expectedCurrentVersionId: previousVersionId },
      human,
    );

    expect(impacts.assess).toHaveBeenCalledWith(
      workspaceId,
      storyContractId,
      previousVersionId,
      storyVersionId,
      session,
    );
    expect(events.emit).toHaveBeenCalledWith('story.impact.assessed', {
      workspaceId,
      storyContractId,
      storyVersionId,
      taskId: 'task-1',
    });
    expect(events.emit).toHaveBeenCalledWith('task.story.rebase_required', {
      workspaceId,
      taskId: 'task-1',
      storyContractId,
      storyVersionId,
    });
    expect(events.emit).not.toHaveBeenCalledWith(
      'task.story.rebase_required',
      expect.objectContaining({ taskId: 'task-2' }),
    );
    expect(session.withTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      events.emit.mock.invocationCallOrder[0],
    );
  });

  it('allows exactly one approval against the expected current pointer', async () => {
    contractModel.findOneAndUpdate
      .mockResolvedValueOnce({
        _id: storyContractId,
        currentApprovedStoryVersionId: storyVersionId,
      })
      .mockResolvedValueOnce(null);

    const results = await Promise.allSettled([
      service.approve(
        workspaceId,
        storyContractId,
        storyVersionId,
        approvalRequestId,
        { expectedCurrentVersionId: null },
        human,
      ),
      service.approve(
        workspaceId,
        storyContractId,
        storyVersionId,
        approvalRequestId,
        { expectedCurrentVersionId: null },
        human,
      ),
    ]);

    expect(results.map(result => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({
      reason: { response: { code: 'APPROVAL_VERSION_CONFLICT' } },
    });
  });

  it('returns safe not-found for a Version outside the Contract', async () => {
    versionModel.findOne.mockResolvedValue(null);

    await expect(
      service.approve(
        workspaceId,
        storyContractId,
        storyVersionId,
        approvalRequestId,
        { expectedCurrentVersionId: null },
        human,
      ),
    ).rejects.toEqual(new NotFoundException('Story version not found'));
    expect(recordModel.create).not.toHaveBeenCalled();
  });

  it('rejects the pending request without changing the Contract pointer', async () => {
    const record = { _id: new Types.ObjectId(), decision: 'REJECT' };
    recordModel.create.mockResolvedValue([record]);
    requestModel.findOneAndUpdate.mockResolvedValue({
      _id: approvalRequestId,
      state: 'REJECTED',
    });

    await expect(
      service.reject(
        workspaceId,
        storyContractId,
        storyVersionId,
        approvalRequestId,
        { reason: 'Missing evidence' },
        human,
      ),
    ).resolves.toEqual(record);

    expect(recordModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          decision: 'REJECT',
          reason: 'Missing evidence',
          actorId: userId,
        }),
      ],
      { session },
    );
    expect(requestModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'PENDING' }),
      { $set: expect.objectContaining({ state: 'REJECTED' }) },
      { new: true, session },
    );
    expect(contractModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'story.version.rejected',
      expect.objectContaining({
        data: expect.objectContaining({
          aggregateId: storyContractId,
          storyVersionId,
        }),
      }),
    );
  });

  it('returns scoped Approval Requests and immutable Approval Records', async () => {
    const requests = [{ _id: approvalRequestId, state: 'APPROVED' }];
    const records = [{ _id: new Types.ObjectId(), decision: 'APPROVE' }];
    requestModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue(requests),
    });
    recordModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue(records),
    });

    await expect(
      service.findAll(workspaceId, storyContractId),
    ).resolves.toEqual({ requests, records });

    expect(requestModel.find).toHaveBeenCalledWith({
      workspaceId,
      storyContractId,
    });
    expect(recordModel.find).toHaveBeenCalledWith({
      workspaceId,
      storyContractId,
    });
  });
});
