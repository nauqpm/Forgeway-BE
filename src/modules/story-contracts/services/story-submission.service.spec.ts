import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { StorySubmissionService } from './story-submission.service';

describe('StorySubmissionService', () => {
  const workspaceId = new Types.ObjectId().toString();
  const storyContractId = new Types.ObjectId().toString();
  const draftId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const requirementId = new Types.ObjectId().toString();
  const draftModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const contractModel = { findOne: jest.fn(), findOneAndUpdate: jest.fn() };
  const versionModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const linkModel = { create: jest.fn() };
  const requirements = { findById: jest.fn() };
  const criteria = { resolveForSubmission: jest.fn() };
  const session = { withTransaction: jest.fn(), endSession: jest.fn() };
  const connection = { startSession: jest.fn() };
  const events = { emit: jest.fn() };
  const operations = {
    findOne: jest.fn(),
    create: jest.fn(),
  };
  const decisionProposals = { findOne: jest.fn() };
  const decisionRecords = { findOne: jest.fn() };

  const createService = () =>
    new (StorySubmissionService as any)(
      draftModel as any,
      contractModel as any,
      versionModel as any,
      linkModel as any,
      decisionProposals as any,
      decisionRecords as any,
      requirements as any,
      criteria as any,
      connection as any,
      events as any,
      operations as any,
    );

  const createServiceWithDecisionModels = () => {
    return createService();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(async work => work());
  });

  const prepareDecisionSubmission = (
    decisionProposalId: string,
    decisionRecordId = new Types.ObjectId().toString(),
  ) => {
    const versionId = new Types.ObjectId();
    draftModel.findOne.mockResolvedValue({
      _id: draftId,
      baseStoryVersionId: null,
      status: 'active',
      content: {},
      requirementLinks: [{ requirementId, role: 'PRIMARY' }],
      criterionInputs: [],
      decisionProposalIds: [decisionProposalId],
    });
    requirements.findById.mockResolvedValue({ _id: requirementId });
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      latestStoryVersionNumber: 1,
    });
    criteria.resolveForSubmission.mockResolvedValue([]);
    versionModel.create.mockResolvedValue([{ _id: versionId }]);
    linkModel.create.mockResolvedValue([]);
    draftModel.findOneAndUpdate.mockResolvedValue({
      _id: draftId,
      status: 'submitted',
      submittedStoryVersionId: versionId,
    });
    const sort = jest.fn().mockResolvedValue({ _id: decisionRecordId });
    decisionRecords.findOne.mockReturnValue({ sort });
    return { decisionRecordId, sort };
  };

  it('rejects submission without exactly one PRIMARY requirement before writes', async () => {
    draftModel.findOne.mockResolvedValue({
      _id: draftId,
      baseStoryVersionId: null,
      status: 'active',
      requirementLinks: [],
      criterionInputs: [],
    });

    await expect(
      createService().submit(workspaceId, storyContractId, draftId, userId),
    ).rejects.toEqual(
      new BadRequestException({
        code: 'PRIMARY_REQUIREMENT_REQUIRED',
        message: 'PRIMARY_REQUIREMENT_REQUIRED',
      }),
    );
    expect(contractModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(versionModel.create).not.toHaveBeenCalled();
    expect(draftModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('submits one immutable normalized version and marks the draft in the same transaction', async () => {
    const versionId = new Types.ObjectId();
    const criterionId = new Types.ObjectId();
    const criterionRevisionId = new Types.ObjectId();
    const draft = {
      _id: draftId,
      baseStoryVersionId: null,
      status: 'active',
      content: { expectedOutcome: 'Done', problem: 'Problem' },
      requirementLinks: [
        { requirementId, role: 'PRIMARY', evidenceNote: 'Source' },
      ],
      criterionInputs: [
        {
          key: 'AC-1',
          priority: 'MUST',
          statement: 'It works',
          verificationMethod: 'Test',
        },
      ],
      decisionProposalIds: [],
    };
    draftModel.findOne.mockResolvedValue(draft);
    requirements.findById.mockResolvedValue({ _id: requirementId });
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      latestStoryVersionNumber: 1,
    });
    criteria.resolveForSubmission.mockResolvedValue([
      {
        acceptanceCriterionId: criterionId,
        acceptanceCriterionRevisionId: criterionRevisionId,
        key: 'AC-1',
        priority: 'MUST',
      },
    ]);
    versionModel.create.mockResolvedValue([{ _id: versionId }]);
    linkModel.create.mockResolvedValue([]);
    draftModel.findOneAndUpdate.mockResolvedValue({
      ...draft,
      status: 'submitted',
      submittedStoryVersionId: versionId,
    });

    const result = await createService().submit(
      workspaceId,
      storyContractId,
      draftId,
      userId,
    );

    expect(result).toEqual(expect.objectContaining({ _id: versionId }));
    expect(contractModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: storyContractId,
        workspaceId,
        status: 'active',
        currentApprovedStoryVersionId: null,
      },
      {
        $inc: { latestStoryVersionNumber: 1, version: 1 },
      },
      { new: true, session },
    );
    expect(versionModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          workspaceId,
          storyContractId,
          versionNumber: 1,
          sourceDraftId: draftId,
          baseStoryVersionId: null,
          contentSnapshot: {
            expectedOutcome: 'Done',
            problem: 'Problem',
          },
          contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ],
      { session },
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
          status: 'submitted',
          submittedStoryVersionId: versionId,
          updatedBy: userId,
        },
      },
      { new: true, session },
    );
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'story.version.submitted',
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId,
          aggregateId: storyContractId,
          actorId: userId,
          storyVersionId: versionId.toString(),
        }),
      }),
    );
    expect(session.withTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      events.emit.mock.invocationCallOrder[0],
    );
  });

  it('rejects a decision proposal outside the Workspace and Contract before immutable writes', async () => {
    const decisionProposalId = new Types.ObjectId().toString();
    prepareDecisionSubmission(decisionProposalId);
    decisionProposals.findOne.mockResolvedValue(null);

    await expect(
      createServiceWithDecisionModels().submit(
        workspaceId,
        storyContractId,
        draftId,
        userId,
      ),
    ).rejects.toEqual(
      new NotFoundException('Approved decision proposal not found'),
    );
    expect(decisionProposals.findOne).toHaveBeenCalledWith(
      {
        _id: decisionProposalId,
        workspaceId,
        storyContractId,
        state: 'APPROVED',
      },
      null,
      { session },
    );
    expect(contractModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(versionModel.create).not.toHaveBeenCalled();
  });

  it('rejects a still-open decision proposal before immutable writes', async () => {
    const decisionProposalId = new Types.ObjectId().toString();
    prepareDecisionSubmission(decisionProposalId);
    decisionProposals.findOne.mockResolvedValue(null);

    await expect(
      createServiceWithDecisionModels().submit(
        workspaceId,
        storyContractId,
        draftId,
        userId,
      ),
    ).rejects.toEqual(
      new NotFoundException('Approved decision proposal not found'),
    );
    expect(versionModel.create).not.toHaveBeenCalled();
  });

  it('resolves approved proposal references to scoped immutable DecisionRecord ids', async () => {
    const decisionProposalId = new Types.ObjectId().toString();
    const { decisionRecordId, sort } =
      prepareDecisionSubmission(decisionProposalId);
    decisionProposals.findOne.mockResolvedValue({
      _id: decisionProposalId,
      state: 'APPROVED',
    });

    await createServiceWithDecisionModels().submit(
      workspaceId,
      storyContractId,
      draftId,
      userId,
    );

    expect(decisionRecords.findOne).toHaveBeenCalledWith(
      {
        workspaceId,
        storyContractId,
        sourceProposalId: decisionProposalId,
      },
      null,
      { session },
    );
    expect(sort).toHaveBeenCalledWith({ decidedAt: -1, _id: -1 });
    expect(versionModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          decisionRecordIds: [decisionRecordId],
        }),
      ],
      { session },
    );
  });

  it('rejects an approved proposal whose immutable DecisionRecord is missing', async () => {
    const decisionProposalId = new Types.ObjectId().toString();
    const { sort } = prepareDecisionSubmission(decisionProposalId);
    decisionProposals.findOne.mockResolvedValue({
      _id: decisionProposalId,
      state: 'APPROVED',
    });
    sort.mockResolvedValue(null);

    await expect(
      createServiceWithDecisionModels().submit(
        workspaceId,
        storyContractId,
        draftId,
        userId,
      ),
    ).rejects.toEqual(
      new NotFoundException('Approved decision record not found'),
    );
    expect(contractModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(versionModel.create).not.toHaveBeenCalled();
  });

  it('replays a submitted version for the same actor, key, and payload', async () => {
    const versionId = new Types.ObjectId();
    draftModel.findOne.mockResolvedValue({
      _id: draftId,
      baseStoryVersionId: null,
      status: 'active',
      content: {},
      requirementLinks: [{ requirementId, role: 'PRIMARY' }],
      criterionInputs: [],
      decisionProposalIds: [],
    });
    requirements.findById.mockResolvedValue({ _id: requirementId });
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      latestStoryVersionNumber: 1,
    });
    criteria.resolveForSubmission.mockResolvedValue([]);
    versionModel.create.mockResolvedValue([{ _id: versionId }]);
    linkModel.create.mockResolvedValue([]);
    draftModel.findOneAndUpdate.mockResolvedValue({ _id: draftId });
    let savedOperation: Record<string, unknown> | undefined;
    operations.findOne.mockImplementation(() =>
      Promise.resolve(savedOperation),
    );
    operations.create.mockImplementation(async ([record]) => {
      savedOperation = record;
      return [record];
    });

    const service = createService();
    const first = await service.submit(
      workspaceId,
      storyContractId,
      draftId,
      userId,
      'submit-key',
    );
    const replay = await service.submit(
      workspaceId,
      storyContractId,
      draftId,
      userId,
      'submit-key',
    );

    expect(replay).toEqual(first);
    expect(versionModel.create).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate criterion keys and leaves immutable history untouched', async () => {
    draftModel.findOne.mockResolvedValue({
      _id: draftId,
      baseStoryVersionId: null,
      status: 'active',
      requirementLinks: [{ requirementId, role: 'PRIMARY' }],
      criterionInputs: [
        {
          key: 'AC-1',
          priority: 'MUST',
          statement: 'First',
          verificationMethod: 'Test',
        },
        {
          key: 'AC-1',
          priority: 'SHOULD',
          statement: 'Second',
          verificationMethod: 'Review',
        },
      ],
    });
    requirements.findById.mockResolvedValue({ _id: requirementId });

    await expect(
      createService().submit(workspaceId, storyContractId, draftId, userId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CRITERION_KEY_DUPLICATE' }),
    });
    expect(versionModel.create).not.toHaveBeenCalled();
    expect(linkModel.create).not.toHaveBeenCalled();
  });

  it('returns safe not-found for a draft outside the URL ownership scope', async () => {
    draftModel.findOne.mockResolvedValue(null);

    await expect(
      createService().submit(workspaceId, storyContractId, draftId, userId),
    ).rejects.toEqual(new NotFoundException('Story draft not found'));
  });

  it('blocks a scoped stale draft with the stable base-version conflict', async () => {
    draftModel.findOne.mockImplementation((query: { status?: string }) =>
      query.status ? null : Promise.resolve({ _id: draftId, status: 'stale' }),
    );

    await expect(
      createService().submit(workspaceId, storyContractId, draftId, userId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DRAFT_BASE_VERSION_STALE',
        message: 'DRAFT_BASE_VERSION_STALE',
      }),
    });
    expect(versionModel.create).not.toHaveBeenCalled();
  });

  it('rejects multiple PRIMARY links and malformed criterion input', async () => {
    draftModel.findOne
      .mockResolvedValueOnce({
        _id: draftId,
        baseStoryVersionId: null,
        status: 'active',
        requirementLinks: [
          { requirementId, role: 'PRIMARY' },
          { requirementId: new Types.ObjectId(), role: 'PRIMARY' },
        ],
        criterionInputs: [],
      })
      .mockResolvedValueOnce({
        _id: draftId,
        baseStoryVersionId: null,
        status: 'active',
        requirementLinks: [{ requirementId, role: 'PRIMARY' }],
        criterionInputs: [{ key: null }],
      });
    requirements.findById.mockResolvedValue({ _id: requirementId });

    await expect(
      createService().submit(workspaceId, storyContractId, draftId, userId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PRIMARY_REQUIREMENT_REQUIRED',
      }),
    });
    await expect(
      createService().submit(workspaceId, storyContractId, draftId, userId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVALID_ACCEPTANCE_CRITERION',
      }),
    });
  });

  it('rejects a requirement from another workspace before immutable writes', async () => {
    draftModel.findOne.mockResolvedValue({
      _id: draftId,
      baseStoryVersionId: null,
      status: 'active',
      requirementLinks: [{ requirementId, role: 'PRIMARY' }],
      criterionInputs: [],
    });
    requirements.findById.mockRejectedValue(
      new NotFoundException('Requirement not found'),
    );

    await expect(
      createService().submit(workspaceId, storyContractId, draftId, userId),
    ).rejects.toEqual(new NotFoundException('Requirement not found'));
    expect(requirements.findById).toHaveBeenCalledWith(
      workspaceId,
      requirementId,
    );
    expect(versionModel.create).not.toHaveBeenCalled();
  });

  it('rejects a stale draft base before criteria or version writes', async () => {
    draftModel.findOne.mockResolvedValue({
      _id: draftId,
      baseStoryVersionId: new Types.ObjectId(),
      status: 'active',
      requirementLinks: [{ requirementId, role: 'PRIMARY' }],
      criterionInputs: [],
    });
    requirements.findById.mockResolvedValue({ _id: requirementId });
    contractModel.findOneAndUpdate.mockResolvedValue(null);
    contractModel.findOne.mockResolvedValue({
      _id: storyContractId,
      status: 'active',
    });

    await expect(
      createService().submit(workspaceId, storyContractId, draftId, userId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DRAFT_BASE_VERSION_STALE',
      }),
    });
    expect(criteria.resolveForSubmission).not.toHaveBeenCalled();
    expect(versionModel.create).not.toHaveBeenCalled();
  });

  it('does not mark the draft submitted when an immutable write fails', async () => {
    draftModel.findOne.mockResolvedValue({
      _id: draftId,
      baseStoryVersionId: null,
      status: 'active',
      content: {},
      requirementLinks: [{ requirementId, role: 'PRIMARY' }],
      criterionInputs: [],
      decisionProposalIds: [],
    });
    requirements.findById.mockResolvedValue({ _id: requirementId });
    contractModel.findOneAndUpdate.mockResolvedValue({
      _id: storyContractId,
      latestStoryVersionNumber: 1,
    });
    criteria.resolveForSubmission.mockResolvedValue([]);
    versionModel.create.mockResolvedValue([{ _id: new Types.ObjectId() }]);
    linkModel.create.mockRejectedValue(new Error('write failed'));

    await expect(
      createService().submit(workspaceId, storyContractId, draftId, userId),
    ).rejects.toThrow('write failed');
    expect(draftModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('uses workspace and contract ownership filters for version reads', async () => {
    const versionId = new Types.ObjectId().toString();
    versionModel.findOne.mockResolvedValue(null);

    await expect(
      createService().findVersion(workspaceId, storyContractId, versionId),
    ).rejects.toEqual(new NotFoundException('Story version not found'));
    expect(versionModel.findOne).toHaveBeenCalledWith({
      _id: versionId,
      workspaceId,
      storyContractId,
    });
  });
});
