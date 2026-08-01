import { NotFoundException } from '@nestjs/common';
import { Mongoose, Types } from 'mongoose';
import { AcceptanceCriterionRevisionSchema } from '../schemas/acceptance-criterion-revision.schema';
import { StoryVersionSchema } from '../schemas/story-version.schema';
import { createStoryContentHash } from '../utils/story-content-hash.util';
import { AcceptanceCriterionService } from './acceptance-criterion.service';

describe('AcceptanceCriterionService', () => {
  const workspaceId = new Types.ObjectId().toString();
  const storyContractId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const session = {} as any;
  const criterionModel = {
    create: jest.fn(),
    findOne: jest.fn(),
  };
  const revisionModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('reuses stable identities for unchanged content and creates revision 2 for a change', async () => {
    const criterionId = new Types.ObjectId();
    const revisionId = new Types.ObjectId();
    const criterion = { _id: criterionId, key: 'AC-1' };
    const unchanged = {
      _id: revisionId,
      revisionNumber: 1,
      contentHash: expect.any(String),
    };
    criterionModel.findOne.mockResolvedValue(criterion);
    revisionModel.findOne
      .mockReturnValueOnce({
        sort: jest.fn().mockResolvedValue({
          ...unchanged,
          contentHash: createStoryContentHash({
            priority: 'MUST',
            statement: 'User can submit',
            verificationMethod: 'Automated test',
          }),
        }),
      })
      .mockReturnValueOnce({
        sort: jest.fn().mockResolvedValue({
          _id: revisionId,
          revisionNumber: 1,
          contentHash: 'different',
        }),
      });
    revisionModel.create.mockResolvedValue([
      { _id: new Types.ObjectId(), revisionNumber: 2 },
    ]);
    const service = new AcceptanceCriterionService(
      criterionModel as any,
      revisionModel as any,
    );
    const input = {
      key: 'AC-1',
      priority: 'MUST' as const,
      statement: 'User can submit',
      verificationMethod: 'Automated test',
    };

    const first = await service.resolveForSubmission(
      workspaceId,
      storyContractId,
      [input],
      userId,
      session,
    );
    const second = await service.resolveForSubmission(
      workspaceId,
      storyContractId,
      [{ ...input, statement: 'User can submit safely' }],
      userId,
      session,
    );

    expect(first[0]).toEqual(
      expect.objectContaining({
        acceptanceCriterionId: criterionId,
        acceptanceCriterionRevisionId: revisionId,
        key: 'AC-1',
      }),
    );
    expect(second[0]).toEqual(
      expect.objectContaining({
        acceptanceCriterionId: criterionId,
        key: 'AC-1',
      }),
    );
    expect(criterionModel.create).not.toHaveBeenCalled();
    expect(revisionModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          acceptanceCriterionId: criterionId,
          revisionNumber: 2,
          statement: 'User can submit safely',
        }),
      ],
      { session },
    );
    expect(revisionModel).not.toHaveProperty('updateOne');
  });

  it('uses nested ownership filters for criterion and revision reads', async () => {
    const criterionId = new Types.ObjectId().toString();
    criterionModel.findOne.mockResolvedValue(null);
    const service = new AcceptanceCriterionService(
      criterionModel as any,
      revisionModel as any,
    );

    await expect(
      service.findById(workspaceId, storyContractId, criterionId),
    ).rejects.toEqual(new NotFoundException('Acceptance criterion not found'));
    expect(criterionModel.findOne).toHaveBeenCalledWith({
      _id: criterionId,
      workspaceId,
      storyContractId,
    });
  });

  it('rejects repository replacement and deletion of immutable history', async () => {
    const mongoose = new Mongoose();
    const versions = mongoose.model(
      'ImmutableStoryVersionSpec',
      StoryVersionSchema.clone(),
    );
    const revisions = mongoose.model(
      'ImmutableCriterionRevisionSpec',
      AcceptanceCriterionRevisionSchema.clone(),
    );

    await expect(
      versions.replaceOne({ _id: new Types.ObjectId() }, {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STORY_VERSION_IMMUTABLE' }),
    });
    await expect(
      revisions.deleteMany({ storyContractId }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STORY_VERSION_IMMUTABLE' }),
    });
  });

  it('rejects document saves and deletes of immutable history', async () => {
    const mongoose = new Mongoose();
    mongoose.set('bufferCommands', false);
    const Version = mongoose.model(
      'ImmutableStoryVersionDocumentSpec',
      StoryVersionSchema.clone(),
    );
    const Revision = mongoose.model(
      'ImmutableCriterionRevisionDocumentSpec',
      AcceptanceCriterionRevisionSchema.clone(),
    );
    const version = new Version({
      workspaceId,
      storyContractId,
      versionNumber: 1,
      sourceDraftId: new Types.ObjectId(),
      baseStoryVersionId: null,
      submittedBy: userId,
      submittedAt: new Date(),
      contentSnapshot: {},
      requirementLinkSnapshot: [],
      criteria: [],
      decisionRecordIds: [],
      contentHash: 'before',
    });
    const revision = new Revision({
      workspaceId,
      storyContractId,
      acceptanceCriterionId: new Types.ObjectId(),
      revisionNumber: 1,
      priority: 'MUST',
      statement: 'Approved behavior',
      verificationMethod: 'Automated test',
      contentHash: 'before',
      createdBy: userId,
    });
    version.isNew = false;
    revision.isNew = false;
    version.contentHash = 'after';
    revision.contentHash = 'after';

    await expect(version.save()).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STORY_VERSION_IMMUTABLE' }),
    });
    await expect(revision.save()).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STORY_VERSION_IMMUTABLE' }),
    });
    await expect(version.deleteOne()).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STORY_VERSION_IMMUTABLE' }),
    });
    await expect(revision.deleteOne()).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STORY_VERSION_IMMUTABLE' }),
    });
  });
});
