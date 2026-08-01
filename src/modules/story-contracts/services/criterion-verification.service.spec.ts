import { NotFoundException } from '@nestjs/common';
import { Mongoose, Types } from 'mongoose';
import { CriterionVerificationSchema } from '../schemas/criterion-verification.schema';
import { CriterionVerificationService } from './criterion-verification.service';

describe('CriterionVerificationService', () => {
  const workspaceId = new Types.ObjectId().toString();
  const storyContractId = new Types.ObjectId().toString();
  const storyVersionId = new Types.ObjectId().toString();
  const criterionId = new Types.ObjectId().toString();
  const revisionId = new Types.ObjectId().toString();
  const taskId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const created = { _id: new Types.ObjectId() };
  const verificationModel = {
    create: jest.fn(),
    find: jest.fn(),
  };
  const versionModel = { findOne: jest.fn() };
  const criterionModel = { findOne: jest.fn() };
  const revisionModel = { findOne: jest.fn() };
  const taskModel = { findOne: jest.fn() };

  const createService = () =>
    new CriterionVerificationService(
      verificationModel as any,
      versionModel as any,
      criterionModel as any,
      revisionModel as any,
      taskModel as any,
    );

  const dto = {
    storyVersionId,
    status: 'PASSED' as const,
    evidenceType: 'automated-test',
    evidenceRef: 'artifact://tests/criterion-1',
    taskId,
    pullRequestRef: 'github:org/repo#42',
    qaRunRef: 'vendor/run/alpha',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    versionModel.findOne.mockResolvedValue({ _id: storyVersionId });
    criterionModel.findOne.mockResolvedValue({ _id: criterionId });
    revisionModel.findOne.mockResolvedValue({ _id: revisionId });
    taskModel.findOne.mockResolvedValue({ _id: taskId });
    verificationModel.create.mockResolvedValue(created);
  });

  it('appends evidence pinned to the exact version, criterion and revision tuple', async () => {
    await expect(
      createService().create(
        workspaceId,
        storyContractId,
        criterionId,
        revisionId,
        dto,
        userId,
      ),
    ).resolves.toBe(created);

    expect(versionModel.findOne).toHaveBeenCalledWith({
      _id: storyVersionId,
      workspaceId,
      storyContractId,
      criteria: {
        $elemMatch: {
          acceptanceCriterionId: criterionId,
          acceptanceCriterionRevisionId: revisionId,
        },
      },
    });
    expect(criterionModel.findOne).toHaveBeenCalledWith({
      _id: criterionId,
      workspaceId,
      storyContractId,
    });
    expect(revisionModel.findOne).toHaveBeenCalledWith({
      _id: revisionId,
      workspaceId,
      storyContractId,
      acceptanceCriterionId: criterionId,
    });
    expect(taskModel.findOne).toHaveBeenCalledWith({
      _id: taskId,
      workspaceId,
    });
    expect(verificationModel.create).toHaveBeenCalledWith({
      workspaceId,
      storyContractId,
      storyVersionId,
      acceptanceCriterionId: criterionId,
      acceptanceCriterionRevisionId: revisionId,
      status: 'PASSED',
      evidenceType: 'automated-test',
      evidenceRef: 'artifact://tests/criterion-1',
      taskId,
      pullRequestRef: 'github:org/repo#42',
      qaRunRef: 'vendor/run/alpha',
      submittedBy: userId,
      submittedAt: expect.any(Date),
    });
  });

  it.each(['version', 'criterion', 'revision'] as const)(
    'returns the same safe not-found result for an invalid %s parent tuple',
    async missing => {
      const model = {
        version: versionModel,
        criterion: criterionModel,
        revision: revisionModel,
      }[missing];
      model.findOne.mockResolvedValue(null);

      await expect(
        createService().create(
          workspaceId,
          storyContractId,
          criterionId,
          revisionId,
          dto,
          userId,
        ),
      ).rejects.toEqual(
        new NotFoundException('Criterion verification target not found'),
      );
      expect(verificationModel.create).not.toHaveBeenCalled();
    },
  );

  it('returns the safe not-found result for malformed target ids', async () => {
    await expect(
      createService().create(
        workspaceId,
        storyContractId,
        criterionId,
        revisionId,
        { ...dto, storyVersionId: 'not-an-id' },
        userId,
      ),
    ).rejects.toEqual(
      new NotFoundException('Criterion verification target not found'),
    );
    expect(versionModel.findOne).not.toHaveBeenCalled();
    expect(verificationModel.create).not.toHaveBeenCalled();
  });

  it('rejects a Task reference outside the evidence Workspace without validating opaque PR/QA refs', async () => {
    taskModel.findOne.mockResolvedValue(null);

    await expect(
      createService().create(
        workspaceId,
        storyContractId,
        criterionId,
        revisionId,
        dto,
        userId,
      ),
    ).rejects.toEqual(
      new NotFoundException('Criterion verification target not found'),
    );
    expect(taskModel.findOne).toHaveBeenCalledWith({
      _id: taskId,
      workspaceId,
    });
    expect(verificationModel.create).not.toHaveBeenCalled();
  });

  it('lists only evidence for the requested exact tuple so revision 1 never verifies revision 2', async () => {
    const revision2Id = new Types.ObjectId().toString();
    const history = [{ _id: new Types.ObjectId(), status: 'FAILED' }];
    revisionModel.findOne.mockResolvedValue({ _id: revision2Id });
    versionModel.findOne.mockResolvedValue({ _id: storyVersionId });
    const sort = jest.fn().mockResolvedValue(history);
    verificationModel.find.mockReturnValue({ sort });

    await expect(
      createService().findAll(
        workspaceId,
        storyContractId,
        storyVersionId,
        criterionId,
        revision2Id,
      ),
    ).resolves.toBe(history);

    expect(verificationModel.find).toHaveBeenCalledWith({
      workspaceId,
      storyContractId,
      storyVersionId,
      acceptanceCriterionId: criterionId,
      acceptanceCriterionRevisionId: revision2Id,
    });
    expect(sort).toHaveBeenCalledWith({ submittedAt: 1 });
  });

  it('rejects repository updates and deletes because verification history is append-only', async () => {
    const mongoose = new Mongoose();
    const Verification = mongoose.model(
      'AppendOnlyCriterionVerificationSpec',
      CriterionVerificationSchema.clone(),
    );

    await expect(
      Verification.updateOne(
        { _id: new Types.ObjectId() },
        { status: 'FAILED' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CRITERION_VERIFICATION_IMMUTABLE',
      }),
    });
    await expect(
      Verification.deleteMany({ storyContractId }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CRITERION_VERIFICATION_IMMUTABLE',
      }),
    });
  });

  it('rejects document saves and deletes because verification history is append-only', async () => {
    const mongoose = new Mongoose();
    mongoose.set('bufferCommands', false);
    const Verification = mongoose.model(
      'AppendOnlyCriterionVerificationDocumentSpec',
      CriterionVerificationSchema.clone(),
    );
    const verification = new Verification({
      workspaceId,
      storyContractId,
      storyVersionId,
      acceptanceCriterionId: criterionId,
      acceptanceCriterionRevisionId: revisionId,
      status: 'PASSED',
      evidenceType: 'automated-test',
      evidenceRef: 'artifact://tests/criterion-1',
      submittedBy: userId,
      submittedAt: new Date(),
    });
    verification.isNew = false;
    verification.status = 'FAILED';

    await expect(verification.save()).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CRITERION_VERIFICATION_IMMUTABLE',
      }),
    });
    await expect(verification.deleteOne()).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CRITERION_VERIFICATION_IMMUTABLE',
      }),
    });
  });
});
