import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { WORKSPACE_PERMISSIONS } from '../../common/constants/workspace-permissions.constants';
import { StoryAuthorizationService } from './services/story-authorization.service';
import { StoryContractService } from './story-contract.service';

describe('StoryContractService', () => {
  const workspaceId = new Types.ObjectId().toString();
  const storyContractId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const requirementId = new Types.ObjectId().toString();
  const session = {
    withTransaction: jest.fn(),
    endSession: jest.fn(),
  };
  const contractModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const counterModel = { findOneAndUpdate: jest.fn() };
  const draftModel = { create: jest.fn() };
  const approvalRequestModel = { findOne: jest.fn() };
  const workspaceModel = { findOne: jest.fn() };
  const requirementsService = { findById: jest.fn() };
  const connection = { startSession: jest.fn() };
  const events = { emit: jest.fn() };
  const actor = {
    kind: 'human' as const,
    userId,
    permissions: [WORKSPACE_PERMISSIONS.STORY_ARCHIVE],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a contract and its first active draft in one transaction', async () => {
    const contract = { _id: new Types.ObjectId(), key: 'SC-1' };
    const draft = { _id: new Types.ObjectId(), status: 'active' };
    requirementsService.findById.mockResolvedValue({ _id: requirementId });
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(async work => work());
    counterModel.findOneAndUpdate.mockResolvedValue({ sequence: 1 });
    contractModel.create.mockResolvedValue([contract]);
    draftModel.create.mockResolvedValue([draft]);

    const service = new StoryContractService(
      contractModel as any,
      counterModel as any,
      draftModel as any,
      approvalRequestModel as any,
      workspaceModel as any,
      requirementsService as any,
      new StoryAuthorizationService(),
      connection as any,
      events as any,
    );

    await expect(
      service.create(
        workspaceId,
        { title: '  Contract title  ', primaryRequirementId: requirementId },
        userId,
      ),
    ).resolves.toEqual({ contract, draft });

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(requirementsService.findById).toHaveBeenCalledWith(
      workspaceId,
      requirementId,
    );
    expect(
      requirementsService.findById.mock.invocationCallOrder[0],
    ).toBeLessThan(connection.startSession.mock.invocationCallOrder[0]);
    expect(counterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { workspaceId },
      { $inc: { sequence: 1 } },
      { upsert: true, new: true, session },
    );
    expect(contractModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          workspaceId,
          key: 'SC-1',
          title: 'Contract title',
          status: 'active',
          createdBy: userId,
          version: 1,
        }),
      ],
      { session },
    );
    expect(draftModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          workspaceId,
          storyContractId: contract._id,
          baseStoryVersionId: null,
          status: 'active',
          draftRevision: 1,
          requirementLinks: [{ requirementId, role: 'PRIMARY' }],
          criterionInputs: [],
          decisionProposalIds: [],
          createdBy: userId,
          updatedBy: userId,
        }),
      ],
      { session },
    );
  });

  it('does not start a transaction when the primary requirement is outside the workspace', async () => {
    requirementsService.findById.mockRejectedValue(
      new NotFoundException('Requirement not found'),
    );
    const service = new StoryContractService(
      contractModel as any,
      counterModel as any,
      draftModel as any,
      approvalRequestModel as any,
      workspaceModel as any,
      requirementsService as any,
      new StoryAuthorizationService(),
      connection as any,
      events as any,
    );

    await expect(
      service.create(
        workspaceId,
        { title: 'Contract title', primaryRequirementId: requirementId },
        userId,
      ),
    ).rejects.toEqual(new NotFoundException('Requirement not found'));
    expect(connection.startSession).not.toHaveBeenCalled();
    expect(contractModel.create).not.toHaveBeenCalled();
    expect(draftModel.create).not.toHaveBeenCalled();
  });

  it('soft-archives only the active contract in its workspace', async () => {
    const archived = {
      _id: new Types.ObjectId(),
      status: 'archived',
      version: 5,
    };
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(async work => work());
    workspaceModel.findOne.mockResolvedValue({
      _id: workspaceId,
      ownerId: userId,
      members: [],
      status: 'active',
    });
    contractModel.findOne.mockResolvedValue({
      _id: archived._id,
      status: 'active',
      version: 4,
      currentApprovedStoryVersionId: null,
    });
    approvalRequestModel.findOne.mockResolvedValue(null);
    contractModel.findOneAndUpdate.mockResolvedValue(archived);
    const service = new StoryContractService(
      contractModel as any,
      counterModel as any,
      draftModel as any,
      approvalRequestModel as any,
      workspaceModel as any,
      requirementsService as any,
      new StoryAuthorizationService(),
      connection as any,
      events as any,
    );

    await expect(
      service.archive(workspaceId, archived._id.toString(), actor),
    ).resolves.toEqual(archived);

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(workspaceModel.findOne).toHaveBeenCalledWith(
      { _id: workspaceId, status: 'active' },
      null,
      { session },
    );
    expect(approvalRequestModel.findOne).toHaveBeenCalledWith(
      {
        workspaceId,
        storyContractId: archived._id.toString(),
        state: 'PENDING',
      },
      null,
      { session },
    );
    expect(contractModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: archived._id.toString(),
        workspaceId,
        status: 'active',
        version: 4,
        currentApprovedStoryVersionId: null,
      },
      {
        $set: expect.objectContaining({
          status: 'archived',
          archivedBy: userId,
        }),
        $inc: { version: 1 },
      },
      { new: true, session },
    );
    expect(events.emit).toHaveBeenCalledWith(
      'story.contract.archived',
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId,
          aggregateId: archived._id.toString(),
        }),
      }),
    );
    expect(session.withTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      events.emit.mock.invocationCallOrder[0],
    );
  });

  it('rejects archive while a scoped ApprovalRequest is pending', async () => {
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(async work => work());
    workspaceModel.findOne.mockResolvedValue({
      _id: workspaceId,
      ownerId: userId,
      members: [],
      status: 'active',
    });
    contractModel.findOne.mockResolvedValue({
      _id: storyContractId,
      status: 'active',
      version: 4,
      currentApprovedStoryVersionId: null,
    });
    approvalRequestModel.findOne.mockResolvedValue({
      _id: new Types.ObjectId(),
      state: 'PENDING',
    });
    const service = new StoryContractService(
      contractModel as any,
      counterModel as any,
      draftModel as any,
      approvalRequestModel as any,
      workspaceModel as any,
      requirementsService as any,
      new StoryAuthorizationService(),
      connection as any,
      events as any,
    );

    await expect(
      service.archive(workspaceId, storyContractId, actor),
    ).rejects.toMatchObject({
      response: { code: 'STORY_PENDING_APPROVAL_EXISTS' },
    });
    expect(contractModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('keeps an archived contract readable through its workspace', async () => {
    const archived = { _id: new Types.ObjectId(), status: 'archived' };
    contractModel.findOne.mockResolvedValue(archived);
    const service = new StoryContractService(
      contractModel as any,
      counterModel as any,
      draftModel as any,
      approvalRequestModel as any,
      workspaceModel as any,
      requirementsService as any,
      new StoryAuthorizationService(),
      connection as any,
      events as any,
    );

    await expect(
      service.findById(workspaceId, archived._id.toString()),
    ).resolves.toEqual(archived);
    expect(contractModel.findOne).toHaveBeenCalledWith({
      _id: archived._id.toString(),
      workspaceId,
    });
  });

  it('lists contracts in deterministic active-first creation order', async () => {
    const contracts = [{ _id: storyContractId }];
    const sort = jest.fn().mockResolvedValue(contracts);
    contractModel.find.mockReturnValue({ sort });
    const service = new StoryContractService(
      contractModel as any,
      counterModel as any,
      draftModel as any,
      approvalRequestModel as any,
      workspaceModel as any,
      requirementsService as any,
      new StoryAuthorizationService(),
      connection as any,
      events as any,
    );

    await expect(service.findAll(workspaceId)).resolves.toEqual(contracts);
    expect(contractModel.find).toHaveBeenCalledWith({ workspaceId });
    expect(sort).toHaveBeenCalledWith({ status: 1, createdAt: -1 });
  });

  it('returns safe not-found for an unknown scoped Contract', async () => {
    contractModel.findOne.mockResolvedValue(null);
    const service = new StoryContractService(
      contractModel as any,
      counterModel as any,
      draftModel as any,
      approvalRequestModel as any,
      workspaceModel as any,
      requirementsService as any,
      new StoryAuthorizationService(),
      connection as any,
      events as any,
    );

    await expect(
      service.findById(workspaceId, storyContractId),
    ).rejects.toEqual(new NotFoundException('Story contract not found'));
  });

  it('returns safe not-found when the archive Workspace disappears', async () => {
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(async work => work());
    workspaceModel.findOne.mockResolvedValue(null);
    const service = new StoryContractService(
      contractModel as any,
      counterModel as any,
      draftModel as any,
      approvalRequestModel as any,
      workspaceModel as any,
      requirementsService as any,
      new StoryAuthorizationService(),
      connection as any,
      events as any,
    );

    await expect(
      service.archive(workspaceId, storyContractId, actor),
    ).rejects.toEqual(new NotFoundException('Workspace not found'));
    expect(contractModel.findOne).not.toHaveBeenCalled();
  });

  it('returns safe not-found when the active Contract disappears during archive', async () => {
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(async work => work());
    workspaceModel.findOne.mockResolvedValue({
      _id: workspaceId,
      ownerId: userId,
      members: [],
      status: 'active',
    });
    contractModel.findOne.mockResolvedValue(null);
    const service = new StoryContractService(
      contractModel as any,
      counterModel as any,
      draftModel as any,
      approvalRequestModel as any,
      workspaceModel as any,
      requirementsService as any,
      new StoryAuthorizationService(),
      connection as any,
      events as any,
    );

    await expect(
      service.archive(workspaceId, storyContractId, actor),
    ).rejects.toEqual(new NotFoundException('Story contract not found'));
    expect(approvalRequestModel.findOne).not.toHaveBeenCalled();
  });

  it('reports an optimistic conflict when archive loses the Contract race', async () => {
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(async work => work());
    workspaceModel.findOne.mockResolvedValue({
      _id: workspaceId,
      ownerId: userId,
      members: [],
      status: 'active',
    });
    contractModel.findOne.mockResolvedValue({
      _id: storyContractId,
      status: 'active',
      version: 4,
      currentApprovedStoryVersionId: null,
    });
    approvalRequestModel.findOne.mockResolvedValue(null);
    contractModel.findOneAndUpdate.mockResolvedValue(null);
    const service = new StoryContractService(
      contractModel as any,
      counterModel as any,
      draftModel as any,
      approvalRequestModel as any,
      workspaceModel as any,
      requirementsService as any,
      new StoryAuthorizationService(),
      connection as any,
      events as any,
    );

    await expect(
      service.archive(workspaceId, storyContractId, actor),
    ).rejects.toMatchObject({
      response: { code: 'APPROVAL_VERSION_CONFLICT' },
    });
    expect(events.emit).not.toHaveBeenCalled();
  });
});
