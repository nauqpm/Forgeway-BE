import { NotFoundException } from '@nestjs/common';
import { StoryDraftRebaseService } from './story-draft-rebase.service';

describe('StoryDraftRebaseService', () => {
  const workspaceId = 'workspace-1';
  const storyContractId = 'contract-1';
  const staleDraftId = 'draft-stale';
  const baseVersionId = 'version-1';
  const currentVersionId = 'version-2';
  const userId = 'user-1';
  const session = {
    withTransaction: jest.fn(),
    endSession: jest.fn(),
  };
  const connection = { startSession: jest.fn() };
  const draftModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
  };
  const contractModel = { findOne: jest.fn(), findOneAndUpdate: jest.fn() };
  const versionModel = { findOne: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(async work => work());
  });

  it('creates a new active draft from the current approved snapshot with explicit conflicts', async () => {
    const staleDraft = {
      _id: staleDraftId,
      workspaceId,
      storyContractId,
      status: 'stale',
      baseStoryVersionId: baseVersionId,
      content: { problem: 'Working copy', expectedOutcome: 'Keep my edits' },
      requirementLinks: [
        {
          requirementId: 'requirement-working',
          role: 'CONSTRAINT',
          evidenceNote: 'Working evidence',
        },
      ],
      criterionInputs: [
        {
          key: 'AC-WORKING',
          priority: 'SHOULD',
          statement: 'Working criterion',
          verificationMethod: 'Manual review',
        },
      ],
      decisionProposalIds: ['proposal-working'],
    };
    const baseVersion = {
      _id: baseVersionId,
      workspaceId,
      storyContractId,
      contentHash: 'hash-1',
      contentSnapshot: { problem: 'Old' },
      requirementLinkSnapshot: [],
      criteria: [],
      decisionRecordIds: [],
    };
    const currentVersion = {
      _id: currentVersionId,
      workspaceId,
      storyContractId,
      contentHash: 'hash-2',
      contentSnapshot: { problem: 'Approved' },
      requirementLinkSnapshot: [
        {
          requirementId: 'requirement-1',
          relationship: 'PRIMARY',
          evidenceNote: 'Source',
        },
      ],
      criteria: [
        {
          acceptanceCriterionId: 'criterion-1',
          acceptanceCriterionRevisionId: 'revision-2',
          key: 'AC-1',
          priority: 'MUST',
        },
      ],
      decisionRecordIds: ['decision-1'],
    };
    const created = { _id: 'draft-new', status: 'active' };
    draftModel.findOne.mockResolvedValue(staleDraft);
    contractModel.findOne.mockResolvedValue({
      _id: storyContractId,
      currentApprovedStoryVersionId: currentVersionId,
    });
    versionModel.findOne
      .mockResolvedValueOnce(baseVersion)
      .mockResolvedValueOnce(currentVersion);
    draftModel.create.mockResolvedValue([created]);
    const service = new StoryDraftRebaseService(
      draftModel as any,
      contractModel as any,
      versionModel as any,
      connection as any,
    );

    await expect(
      service.rebase(workspaceId, storyContractId, staleDraftId, userId),
    ).resolves.toBe(created);

    expect(draftModel.create).toHaveBeenCalledWith(
      [
        {
          workspaceId,
          storyContractId,
          baseStoryVersionId: currentVersionId,
          status: 'active',
          draftRevision: 1,
          content: {
            expectedOutcome: 'Keep my edits',
            problem: 'Working copy',
          },
          requirementLinks: [
            {
              requirementId: 'requirement-working',
              role: 'CONSTRAINT',
              evidenceNote: 'Working evidence',
            },
          ],
          criterionInputs: [
            {
              key: 'AC-WORKING',
              priority: 'SHOULD',
              statement: 'Working criterion',
              verificationMethod: 'Manual review',
            },
          ],
          decisionProposalIds: ['proposal-working'],
          rebasedFromDraftId: staleDraftId,
          rebaseConflicts: [
            {
              category: 'scope',
              fromStoryVersionId: baseVersionId,
              toStoryVersionId: currentVersionId,
              changeType: 'MODIFIED',
              entityId: 'problem',
              impactLevel: 'INFORMATIONAL',
              resolution: 'UNRESOLVED',
            },
            {
              category: 'requirement',
              fromStoryVersionId: baseVersionId,
              toStoryVersionId: currentVersionId,
              changeType: 'ADDED',
              entityId: 'requirement-1',
              impactLevel: 'BLOCKING',
              resolution: 'UNRESOLVED',
            },
            {
              category: 'acceptanceCriterion',
              fromStoryVersionId: baseVersionId,
              toStoryVersionId: currentVersionId,
              changeType: 'ADDED',
              entityId: 'criterion-1',
              impactLevel: 'BLOCKING',
              resolution: 'UNRESOLVED',
            },
            {
              category: 'decision',
              fromStoryVersionId: baseVersionId,
              toStoryVersionId: currentVersionId,
              changeType: 'ADDED',
              entityId: 'decision-1',
              impactLevel: 'REVIEW_REQUIRED',
              resolution: 'UNRESOLVED',
            },
          ],
          createdBy: userId,
          updatedBy: userId,
        },
      ],
      { session },
    );
    expect(draftModel.findOne).toHaveBeenCalledWith(
      {
        _id: staleDraftId,
        workspaceId,
        storyContractId,
        status: 'stale',
      },
      null,
      { session },
    );
    expect(draftModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(contractModel.findOne).toHaveBeenCalledWith(
      {
        _id: storyContractId,
        workspaceId,
        status: 'active',
        currentApprovedStoryVersionId: { $ne: null },
      },
      null,
      { session },
    );
    expect(contractModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns safe not-found for a stale draft outside the nested route scope', async () => {
    draftModel.findOne.mockResolvedValue(null);
    const service = new StoryDraftRebaseService(
      draftModel as any,
      contractModel as any,
      versionModel as any,
      connection as any,
    );

    await expect(
      service.rebase(workspaceId, storyContractId, staleDraftId, userId),
    ).rejects.toEqual(new NotFoundException('Story draft not found'));
    expect(draftModel.create).not.toHaveBeenCalled();
  });
});
