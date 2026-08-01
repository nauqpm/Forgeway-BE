import { NotFoundException } from '@nestjs/common';
import {
  computeStoryVersionChangeSet,
  StoryVersionDiffService,
} from './story-version-diff.service';

describe('computeStoryVersionChangeSet', () => {
  const version = (overrides: Record<string, unknown> = {}) => ({
    _id: 'version-1',
    workspaceId: 'workspace-1',
    storyContractId: 'contract-1',
    contentHash: 'hash-1',
    contentSnapshot: {
      problem: 'Problem',
      actors: ['operator', 'admin'],
      businessRules: [
        { id: 'rule-2', statement: 'Second' },
        { id: 'rule-1', statement: 'First' },
      ],
    },
    requirementLinkSnapshot: [
      { requirementId: 'requirement-2', relationship: 'SUPPORTING' },
      { requirementId: 'requirement-1', relationship: 'PRIMARY' },
    ],
    criteria: [
      {
        acceptanceCriterionId: 'criterion-2',
        acceptanceCriterionRevisionId: 'revision-2',
        priority: 'SHOULD',
      },
      {
        acceptanceCriterionId: 'criterion-1',
        acceptanceCriterionRevisionId: 'revision-1',
        priority: 'MUST',
      },
    ],
    decisionRecordIds: ['decision-2', 'decision-1'],
    ...overrides,
  });

  it('returns an empty diff for semantically equal versions with reordered arrays and object keys', () => {
    const from = version();
    const to = version({
      _id: 'version-2',
      contentHash: 'hash-2',
      contentSnapshot: {
        businessRules: [
          { statement: 'First', id: 'rule-1' },
          { statement: 'Second', id: 'rule-2' },
        ],
        actors: ['admin', 'operator'],
        problem: 'Problem',
      },
      requirementLinkSnapshot: [
        { relationship: 'PRIMARY', requirementId: 'requirement-1' },
        { relationship: 'SUPPORTING', requirementId: 'requirement-2' },
      ],
      criteria: [
        {
          priority: 'MUST',
          acceptanceCriterionRevisionId: 'revision-1',
          acceptanceCriterionId: 'criterion-1',
        },
        {
          priority: 'SHOULD',
          acceptanceCriterionRevisionId: 'revision-2',
          acceptanceCriterionId: 'criterion-2',
        },
      ],
      decisionRecordIds: ['decision-1', 'decision-2'],
    });

    expect(computeStoryVersionChangeSet(from, to)).toEqual({
      workspaceId: 'workspace-1',
      storyContractId: 'contract-1',
      fromStoryVersionId: 'version-1',
      toStoryVersionId: 'version-2',
      fromContentHash: 'hash-1',
      toContentHash: 'hash-2',
      scopeChanges: [],
      businessRuleChanges: [],
      permissionChanges: [],
      requirementChanges: [],
      acceptanceCriterionChanges: [],
      decisionChanges: [],
      dependencyChanges: [],
    });
  });

  it('reports stable-ID additions and removals in entity order', () => {
    const from = version({
      contentSnapshot: {
        businessRules: [
          { id: 'rule-z', statement: 'Removed' },
          { id: 'rule-b', statement: 'Kept' },
        ],
      },
    });
    const to = version({
      _id: 'version-2',
      contentSnapshot: {
        businessRules: [
          { id: 'rule-a', statement: 'Added' },
          { id: 'rule-b', statement: 'Kept' },
        ],
      },
    });

    expect(computeStoryVersionChangeSet(from, to).businessRuleChanges).toEqual([
      {
        changeType: 'ADDED',
        entityId: 'rule-a',
        impactLevel: 'REVIEW_REQUIRED',
      },
      {
        changeType: 'REMOVED',
        entityId: 'rule-z',
        impactLevel: 'REVIEW_REQUIRED',
      },
    ]);
  });

  it('classifies a changed criterion revision by stable criterion identity', () => {
    const from = version({
      criteria: [
        {
          acceptanceCriterionId: 'criterion-1',
          acceptanceCriterionRevisionId: 'revision-1',
          priority: 'MUST',
        },
      ],
    });
    const to = version({
      _id: 'version-2',
      criteria: [
        {
          acceptanceCriterionId: 'criterion-1',
          acceptanceCriterionRevisionId: 'revision-2',
          priority: 'MUST',
        },
      ],
    });

    expect(
      computeStoryVersionChangeSet(from, to).acceptanceCriterionChanges,
    ).toEqual([
      {
        changeType: 'MODIFIED',
        entityId: 'criterion-1',
        oldRevisionId: 'revision-1',
        newRevisionId: 'revision-2',
        impactLevel: 'BLOCKING',
      },
    ]);
  });

  it('uses explicit severity rules for requirements, lower-priority criteria, and ordinary text', () => {
    const from = version({
      contentSnapshot: { problem: 'Old' },
      requirementLinkSnapshot: [
        { requirementId: 'primary', relationship: 'PRIMARY' },
        { requirementId: 'supporting', relationship: 'SUPPORTING' },
      ],
      criteria: [
        {
          acceptanceCriterionId: 'should',
          acceptanceCriterionRevisionId: 'should-1',
          priority: 'SHOULD',
        },
        {
          acceptanceCriterionId: 'could',
          acceptanceCriterionRevisionId: 'could-1',
          priority: 'COULD',
        },
      ],
    });
    const to = version({
      _id: 'version-2',
      contentSnapshot: { problem: 'New' },
      requirementLinkSnapshot: [
        { requirementId: 'primary', relationship: 'CONSTRAINT' },
      ],
      criteria: [
        {
          acceptanceCriterionId: 'should',
          acceptanceCriterionRevisionId: 'should-2',
          priority: 'SHOULD',
        },
        {
          acceptanceCriterionId: 'could',
          acceptanceCriterionRevisionId: 'could-2',
          priority: 'COULD',
        },
      ],
    });

    const result = computeStoryVersionChangeSet(from, to);

    expect(result.scopeChanges).toEqual([
      {
        changeType: 'MODIFIED',
        entityId: 'problem',
        impactLevel: 'INFORMATIONAL',
      },
    ]);
    expect(result.requirementChanges).toEqual([
      {
        changeType: 'MODIFIED',
        entityId: 'primary',
        impactLevel: 'BLOCKING',
      },
      {
        changeType: 'REMOVED',
        entityId: 'supporting',
        impactLevel: 'REVIEW_REQUIRED',
      },
    ]);
    expect(result.acceptanceCriterionChanges).toEqual([
      {
        changeType: 'MODIFIED',
        entityId: 'could',
        oldRevisionId: 'could-1',
        newRevisionId: 'could-2',
        impactLevel: 'INFORMATIONAL',
      },
      {
        changeType: 'MODIFIED',
        entityId: 'should',
        oldRevisionId: 'should-1',
        newRevisionId: 'should-2',
        impactLevel: 'REVIEW_REQUIRED',
      },
    ]);
  });

  it('returns byte-stable ordering across repeated calls', () => {
    const from = version();
    const to = version({
      _id: 'version-2',
      contentSnapshot: {
        problem: 'Changed',
        businessRules: [
          { id: 'rule-3', statement: 'Third' },
          { id: 'rule-1', statement: 'Changed first' },
        ],
      },
    });

    const first = computeStoryVersionChangeSet(from, to);

    expect(JSON.stringify(computeStoryVersionChangeSet(from, to))).toBe(
      JSON.stringify(first),
    );
  });
});

describe('StoryVersionDiffService', () => {
  const workspaceId = 'workspace-1';
  const storyContractId = 'contract-1';
  const fromStoryVersionId = 'version-1';
  const toStoryVersionId = 'version-2';
  const from = {
    _id: fromStoryVersionId,
    workspaceId,
    storyContractId,
    contentHash: 'from-hash',
    contentSnapshot: {},
  };
  const to = {
    _id: toStoryVersionId,
    workspaceId,
    storyContractId,
    contentHash: 'to-hash',
    contentSnapshot: { problem: 'New' },
  };
  const versionModel = { findOne: jest.fn() };
  const changeSetModel = { findOneAndUpdate: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('persists one final deterministic change set by the unique version tuple', async () => {
    versionModel.findOne.mockResolvedValueOnce(from).mockResolvedValueOnce(to);
    const persisted = { _id: 'change-set-1' };
    changeSetModel.findOneAndUpdate.mockResolvedValue(persisted);
    const service = new StoryVersionDiffService(
      versionModel as any,
      changeSetModel as any,
    );

    await expect(
      service.compare(
        workspaceId,
        storyContractId,
        fromStoryVersionId,
        toStoryVersionId,
      ),
    ).resolves.toBe(persisted);

    expect(versionModel.findOne).toHaveBeenNthCalledWith(1, {
      _id: fromStoryVersionId,
      workspaceId,
      storyContractId,
    });
    expect(versionModel.findOne).toHaveBeenNthCalledWith(2, {
      _id: toStoryVersionId,
      workspaceId,
      storyContractId,
    });
    expect(changeSetModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        workspaceId,
        storyContractId,
        fromStoryVersionId,
        toStoryVersionId,
      },
      {
        $setOnInsert: expect.objectContaining({
          workspaceId,
          storyContractId,
          fromStoryVersionId,
          toStoryVersionId,
          fromContentHash: 'from-hash',
          toContentHash: 'to-hash',
        }),
      },
      { new: true, upsert: true },
    );
  });

  it('returns safe not-found when either version is outside the nested route scope', async () => {
    versionModel.findOne
      .mockResolvedValueOnce(from)
      .mockResolvedValueOnce(null);
    const service = new StoryVersionDiffService(
      versionModel as any,
      changeSetModel as any,
    );

    await expect(
      service.compare(
        workspaceId,
        storyContractId,
        fromStoryVersionId,
        toStoryVersionId,
      ),
    ).rejects.toEqual(new NotFoundException('Story version not found'));
    expect(changeSetModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
