import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { StoryDraftService } from './story-draft.service';

describe('StoryDraftService', () => {
  const workspaceId = new Types.ObjectId().toString();
  const storyContractId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const draftModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const contractModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const versionModel = { findOne: jest.fn() };
  const requirementsService = { findById: jest.fn() };
  const session = {
    withTransaction: jest.fn(),
    endSession: jest.fn(),
  };
  const connection = {
    startSession: jest.fn(),
    model: jest.fn().mockReturnValue(versionModel),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(async work => work());
    versionModel.findOne.mockResolvedValue({ requirementLinkSnapshot: [] });
    requirementsService.findById.mockResolvedValue({ status: 'active' });
  });

  it('creates a sibling active draft from the contract approved version, not a client base', async () => {
    const approvedVersionId = new Types.ObjectId();
    const draft = { _id: new Types.ObjectId(), status: 'active' };
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      currentApprovedStoryVersionId: approvedVersionId,
      status: 'active',
    });
    draftModel.create.mockResolvedValue([draft]);
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await expect(
      service.create(
        workspaceId,
        storyContractId,
        { baseStoryVersionId: new Types.ObjectId().toString() },
        userId,
      ),
    ).resolves.toEqual(draft);

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(contractModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: storyContractId,
        workspaceId,
        status: 'active',
      },
      { $inc: { version: 1 } },
      { new: true, session },
    );
    expect(draftModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          workspaceId,
          storyContractId,
          baseStoryVersionId: approvedVersionId,
          status: 'active',
          draftRevision: 1,
          content: {},
          requirementLinks: [],
          criterionInputs: [],
          decisionProposalIds: [],
          createdBy: userId,
          updatedBy: userId,
        }),
      ],
      { session },
    );
  });

  it('seeds a sibling draft with submit-capable links from its scoped approved version', async () => {
    const approvedVersionId = new Types.ObjectId();
    const requirementId = new Types.ObjectId();
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      currentApprovedStoryVersionId: approvedVersionId,
      status: 'active',
    });
    versionModel.findOne.mockResolvedValue({
      _id: approvedVersionId,
      requirementLinkSnapshot: [
        {
          requirementId,
          relationship: 'PRIMARY',
          evidenceNote: 'Approved source',
        },
      ],
    });
    draftModel.create.mockResolvedValue([{ status: 'active' }]);
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await service.create(workspaceId, storyContractId, {}, userId);

    expect(versionModel.findOne).toHaveBeenCalledWith(
      {
        _id: approvedVersionId,
        workspaceId,
        storyContractId,
      },
      null,
      { session },
    );
    expect(draftModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          requirementLinks: [
            {
              requirementId,
              role: 'PRIMARY',
              evidenceNote: 'Approved source',
            },
          ],
        }),
      ],
      { session },
    );
  });

  it('uses null as the base when the contract has no approved version', async () => {
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      status: 'active',
    });
    draftModel.create.mockResolvedValue([{ status: 'active' }]);
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await service.create(workspaceId, storyContractId, {}, userId);

    expect(draftModel.create).toHaveBeenCalledWith(
      [expect.objectContaining({ baseStoryVersionId: null })],
      { session },
    );
  });

  it('updates only mutable fields with the current revision and increments it', async () => {
    const draftId = new Types.ObjectId().toString();
    const updated = { _id: draftId, draftRevision: 2 };
    const content = { problem: 'A clear problem' };
    const criterionInputs = [{ text: 'Given a user' }];
    const decisionProposalIds = [new Types.ObjectId().toString()];
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      status: 'active',
    });
    draftModel.findOneAndUpdate.mockResolvedValue(updated);
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await expect(
      service.update(
        workspaceId,
        storyContractId,
        draftId,
        {
          expectedDraftRevision: 1,
          content,
          criterionInputs,
          decisionProposalIds,
        },
        userId,
      ),
    ).resolves.toEqual(updated);

    expect(contractModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: storyContractId,
        workspaceId,
        status: 'active',
      },
      { $inc: { version: 1 } },
      { new: true, session },
    );
    expect(draftModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: draftId,
        workspaceId,
        storyContractId,
        status: 'active',
        draftRevision: 1,
      },
      {
        $set: {
          content,
          criterionInputs,
          decisionProposalIds,
          updatedBy: userId,
        },
        $inc: { draftRevision: 1 },
      },
      { new: true, session },
    );
  });

  it('rejects stale edits with the stable draft revision conflict', async () => {
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      status: 'active',
    });
    draftModel.findOneAndUpdate.mockResolvedValue(null);
    draftModel.findOne.mockResolvedValue({
      draftRevision: 2,
      status: 'active',
    });
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await expect(
      service.update(
        workspaceId,
        storyContractId,
        new Types.ObjectId().toString(),
        {
          expectedDraftRevision: 1,
          content: { title: '  New title  ' },
        },
        userId,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DRAFT_REVISION_CONFLICT',
        message: 'DRAFT_REVISION_CONFLICT',
      }),
    });
  });

  it('updates one primary and secondary requirement links only after scoped requirement validation', async () => {
    const draftId = new Types.ObjectId().toString();
    const primaryRequirementId = new Types.ObjectId().toString();
    const supportingRequirementId = new Types.ObjectId().toString();
    const requirementLinks = [
      {
        requirementId: primaryRequirementId,
        role: 'PRIMARY',
        evidenceNote: 'Original request',
      },
      {
        requirementId: supportingRequirementId,
        role: 'SUPPORTING',
      },
    ];
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      status: 'active',
    });
    draftModel.findOneAndUpdate.mockResolvedValue({
      _id: draftId,
      requirementLinks,
      draftRevision: 2,
    });
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await service.update(
      workspaceId,
      storyContractId,
      draftId,
      { expectedDraftRevision: 1, requirementLinks },
      userId,
    );

    expect(requirementsService.findById).toHaveBeenNthCalledWith(
      1,
      workspaceId,
      primaryRequirementId,
    );
    expect(requirementsService.findById).toHaveBeenNthCalledWith(
      2,
      workspaceId,
      supportingRequirementId,
    );
    expect(draftModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: draftId,
        workspaceId,
        storyContractId,
      }),
      {
        $set: {
          requirementLinks: [
            requirementLinks[0],
            { ...requirementLinks[1], evidenceNote: '' },
          ],
          updatedBy: userId,
        },
        $inc: { draftRevision: 1 },
      },
      { new: true, session },
    );
  });

  it('rejects a requirement-link edit without exactly one primary', async () => {
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      status: 'active',
    });
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await expect(
      service.update(
        workspaceId,
        storyContractId,
        new Types.ObjectId().toString(),
        {
          expectedDraftRevision: 1,
          requirementLinks: [
            {
              requirementId: new Types.ObjectId().toString(),
              role: 'SUPPORTING',
            },
          ],
        },
        userId,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'PRIMARY_REQUIREMENT_REQUIRED',
        message: 'PRIMARY_REQUIREMENT_REQUIRED',
      },
    });
    expect(requirementsService.findById).not.toHaveBeenCalled();
    expect(draftModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns the same safe draft not-found response for a cross-contract edit', async () => {
    contractModel.findOneAndUpdate.mockResolvedValue(null);
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await expect(
      service.update(
        workspaceId,
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
        { expectedDraftRevision: 1, content: {} },
        userId,
      ),
    ).rejects.toEqual(new NotFoundException('Story draft not found'));
    expect(draftModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each(['submitted', 'abandoned', 'stale'])(
    'does not edit a %s draft',
    async status => {
      const draftId = new Types.ObjectId().toString();
      contractModel.findOneAndUpdate.mockResolvedValue({
        _id: storyContractId,
        status: 'active',
      });
      draftModel.findOneAndUpdate.mockResolvedValue(null);
      draftModel.findOne.mockResolvedValue({ draftRevision: 1, status });
      const service = new StoryDraftService(
        draftModel as any,
        contractModel as any,
        connection as any,
        requirementsService as any,
      );

      await expect(
        service.update(
          workspaceId,
          storyContractId,
          draftId,
          { expectedDraftRevision: 1, content: {} },
          userId,
        ),
      ).rejects.toEqual(new NotFoundException('Story draft not found'));
    },
  );

  it('abandons only after acquiring the active contract transaction gate', async () => {
    const draftId = new Types.ObjectId().toString();
    const abandoned = { _id: draftId, status: 'abandoned' };
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      status: 'active',
    });
    draftModel.findOneAndUpdate.mockResolvedValue(abandoned);
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await expect(
      service.abandon(workspaceId, storyContractId, draftId, userId),
    ).resolves.toEqual(abandoned);

    expect(contractModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: storyContractId,
        workspaceId,
        status: 'active',
      },
      { $inc: { version: 1 } },
      { new: true, session },
    );
    expect(draftModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: draftId,
        workspaceId,
        storyContractId,
        status: 'active',
      },
      {
        $set: {
          status: 'abandoned',
          updatedBy: userId,
        },
      },
      { new: true, session },
    );
  });

  it('keeps archived contract draft history readable with nested ownership filters', async () => {
    const draft = { _id: new Types.ObjectId(), status: 'abandoned' };
    const sort = jest.fn().mockResolvedValue([draft]);
    contractModel.findOne.mockResolvedValue({
      _id: storyContractId,
      status: 'archived',
    });
    draftModel.find.mockReturnValue({ sort });
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await expect(
      service.findAll(workspaceId, storyContractId),
    ).resolves.toEqual([draft]);
    expect(draftModel.find).toHaveBeenCalledWith({
      workspaceId,
      storyContractId,
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('blocks draft creation when the contract is archived', async () => {
    contractModel.findOneAndUpdate.mockResolvedValue(null);
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await expect(
      service.create(workspaceId, storyContractId, {}, userId),
    ).rejects.toEqual(new NotFoundException('Story contract not found'));
    expect(draftModel.create).not.toHaveBeenCalled();
  });

  it('fails safely when the Contract points to a missing approved version', async () => {
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      currentApprovedStoryVersionId: new Types.ObjectId(),
      status: 'active',
    });
    versionModel.findOne.mockResolvedValue(null);
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await expect(
      service.create(workspaceId, storyContractId, {}, userId),
    ).rejects.toEqual(new NotFoundException('Story version not found'));
    expect(draftModel.create).not.toHaveBeenCalled();
  });

  it('returns safe not-found for a Draft outside the scoped Contract', async () => {
    draftModel.findOne.mockResolvedValue(null);
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await expect(
      service.findById(
        workspaceId,
        storyContractId,
        new Types.ObjectId().toString(),
      ),
    ).rejects.toEqual(new NotFoundException('Story draft not found'));
  });

  it('returns safe not-found when abandon cannot acquire the active Contract gate', async () => {
    contractModel.findOneAndUpdate.mockResolvedValue(null);
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await expect(
      service.abandon(
        workspaceId,
        storyContractId,
        new Types.ObjectId().toString(),
        userId,
      ),
    ).rejects.toEqual(new NotFoundException('Story draft not found'));
    expect(draftModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns safe not-found when abandon loses the active Draft race', async () => {
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      status: 'active',
    });
    draftModel.findOneAndUpdate.mockResolvedValue(null);
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await expect(
      service.abandon(
        workspaceId,
        storyContractId,
        new Types.ObjectId().toString(),
        userId,
      ),
    ).rejects.toEqual(new NotFoundException('Story draft not found'));
  });

  it('does not list Drafts when their parent Contract is outside the Workspace', async () => {
    contractModel.findOne.mockResolvedValue(null);
    const service = new StoryDraftService(
      draftModel as any,
      contractModel as any,
      connection as any,
      requirementsService as any,
    );

    await expect(service.findAll(workspaceId, storyContractId)).rejects.toEqual(
      new NotFoundException('Story contract not found'),
    );
    expect(draftModel.find).not.toHaveBeenCalled();
  });
});
