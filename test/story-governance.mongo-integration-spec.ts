import { Connection, Model, Schema, Types, createConnection } from 'mongoose';
import {
  CriterionVerification,
  CriterionVerificationSchema,
} from '../src/modules/story-contracts/schemas/criterion-verification.schema';
import {
  StoryOperation,
  StoryOperationSchema,
} from '../src/modules/story-contracts/schemas/story-operation.schema';
import {
  StoryVersion,
  StoryVersionSchema,
} from '../src/modules/story-contracts/schemas/story-version.schema';
import { StoryImpactService } from '../src/modules/story-contracts/services/story-impact.service';
import { runStoryOperation } from '../src/modules/story-contracts/utils/story-operation.util';

const describeMongo = process.env.MONGODB_TEST_URI ? describe : describe.skip;

describeMongo('Story Governance real Mongo transactions', () => {
  let connection: Connection;
  let contracts: Model<any>;
  let approvals: Model<any>;
  let tasks: Model<any>;
  let links: Model<any>;
  let versions: Model<any>;
  let verifications: Model<any>;
  let operations: Model<any>;

  beforeAll(async () => {
    connection = await createConnection(process.env.MONGODB_TEST_URI!, {
      dbName: `story_governance_${Date.now()}`,
    }).asPromise();
    contracts = connection.model(
      'IntegrationContract',
      new Schema(
        {
          workspaceId: Types.ObjectId,
          status: String,
          currentApprovedStoryVersionId: {
            type: Types.ObjectId,
            default: null,
          },
          version: Number,
        },
        { strict: true },
      ),
    );
    approvals = connection.model(
      'IntegrationApproval',
      new Schema({
        workspaceId: Types.ObjectId,
        storyContractId: Types.ObjectId,
        storyVersionId: Types.ObjectId,
        taskId: Types.ObjectId,
        fromStoryVersionId: Types.ObjectId,
        toStoryVersionId: Types.ObjectId,
        state: String,
      }),
    );
    tasks = connection.model(
      'IntegrationTask',
      new Schema({
        workspaceId: Types.ObjectId,
        storyContractId: Types.ObjectId,
        storyVersionId: Types.ObjectId,
        requirementsState: String,
      }),
    );
    links = connection.model(
      'IntegrationCriterionLink',
      new Schema({
        workspaceId: Types.ObjectId,
        taskId: Types.ObjectId,
        storyVersionId: Types.ObjectId,
      }),
    );
    versions = connection.model(StoryVersion.name, StoryVersionSchema);
    verifications = connection.model(
      CriterionVerification.name,
      CriterionVerificationSchema,
    );
    operations = connection.model(StoryOperation.name, StoryOperationSchema);
    await Promise.all(
      Object.values(connection.models).map(model => model.syncIndexes()),
    );
  });

  beforeEach(async () => {
    await Promise.all(
      Object.values(connection.collections).map(collection =>
        collection.deleteMany({}),
      ),
    );
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  it('rolls back a production idempotent operation with its domain writes', async () => {
    const workspaceId = new Types.ObjectId();
    const actorId = new Types.ObjectId();
    const resourceId = new Types.ObjectId();

    await expect(
      runStoryOperation(
        connection,
        operations,
        {
          workspaceId: String(workspaceId),
          actorId: String(actorId),
          operation: 'story.submit',
          key: 'rollback-key',
          resourceId: String(resourceId),
          request: { draftId: String(resourceId) },
        },
        async session => {
          await connection
            .collection('submission_rows')
            .insertOne({ immutable: true }, { session });
          throw new Error('forced submission failure');
        },
      ),
    ).rejects.toThrow('forced submission failure');

    expect(
      await connection.collection('submission_rows').countDocuments(),
    ).toBe(0);
    expect(await operations.countDocuments()).toBe(0);
  });

  it('suppresses concurrent duplicate writes through the production idempotency helper', async () => {
    const workspaceId = new Types.ObjectId();
    const actorId = new Types.ObjectId();
    const resourceId = new Types.ObjectId();
    const input = {
      workspaceId: String(workspaceId),
      actorId: String(actorId),
      operation: 'story.approve',
      key: 'concurrent-key',
      resourceId: String(resourceId),
      request: { expectedCurrentVersionId: null },
    };
    const work = async (session: import('mongoose').ClientSession) => {
      await connection
        .collection('approval_side_effects')
        .insertOne({ resourceId }, { session });
      return { resourceId: String(resourceId), approved: true };
    };

    const [first, replay] = await Promise.all([
      runStoryOperation(connection, operations, input, work),
      runStoryOperation(connection, operations, input, work),
    ]);

    expect(replay).toEqual(first);
    expect(
      await connection
        .collection('approval_side_effects')
        .countDocuments({ resourceId }),
    ).toBe(1);
    expect(await operations.countDocuments()).toBe(1);
  });

  it('rejects a changed payload under a committed production operation key', async () => {
    const workspaceId = new Types.ObjectId();
    const actorId = new Types.ObjectId();
    const resourceId = new Types.ObjectId();
    const base = {
      workspaceId: String(workspaceId),
      actorId: String(actorId),
      operation: 'story.resolve_impact',
      key: 'conflict-key',
      resourceId: String(resourceId),
    };
    const work = async () => ({ resourceId: String(resourceId) });

    await runStoryOperation(
      connection,
      operations,
      { ...base, request: { taskId: 'task-1' } },
      work,
    );

    await expect(
      runStoryOperation(
        connection,
        operations,
        { ...base, request: { taskId: 'task-2' } },
        work,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'IDEMPOTENCY_CONFLICT',
      },
    });
  });

  it('allows exactly one concurrent approval to become current', async () => {
    const workspaceId = new Types.ObjectId();
    const contractId = new Types.ObjectId();
    const candidates = [new Types.ObjectId(), new Types.ObjectId()];
    await contracts.create({
      _id: contractId,
      workspaceId,
      status: 'active',
      currentApprovedStoryVersionId: null,
      version: 1,
    });

    const results = await Promise.allSettled(
      candidates.map(candidate =>
        transaction(connection, session =>
          contracts.findOneAndUpdate(
            {
              _id: contractId,
              workspaceId,
              status: 'active',
              currentApprovedStoryVersionId: null,
              version: 1,
            },
            {
              $set: { currentApprovedStoryVersionId: candidate },
              $inc: { version: 1 },
            },
            { new: true, session },
          ),
        ),
      ),
    );
    const winners = results.filter(
      result => result.status === 'fulfilled' && result.value,
    );
    const contract: any = await contracts.findById(contractId).lean();

    expect(winners).toHaveLength(1);
    expect(contract.version).toBe(2);
    expect(candidates.map(String)).toContain(
      String(contract.currentApprovedStoryVersionId),
    );
  });

  it('rejects archive with a pending approval without changing either record', async () => {
    const workspaceId = new Types.ObjectId();
    const contractId = new Types.ObjectId();
    const approvalId = new Types.ObjectId();
    await contracts.create({
      _id: contractId,
      workspaceId,
      status: 'active',
      version: 1,
    });
    await approvals.create({
      _id: approvalId,
      workspaceId,
      storyContractId: contractId,
      storyVersionId: new Types.ObjectId(),
      state: 'PENDING',
    });

    await expect(
      transaction(connection, async session => {
        const pending = await approvals.findOne(
          { workspaceId, storyContractId: contractId, state: 'PENDING' },
          null,
          { session },
        );
        if (pending) throw new Error('STORY_PENDING_APPROVAL_EXISTS');
        return contracts.updateOne(
          { _id: contractId, workspaceId },
          { $set: { status: 'archived' } },
          { session },
        );
      }),
    ).rejects.toThrow('STORY_PENDING_APPROVAL_EXISTS');

    const unchangedContract: any = await contracts.findById(contractId).lean();
    const unchangedApproval: any = await approvals.findById(approvalId).lean();
    expect(unchangedContract.status).toBe('active');
    expect(unchangedApproval.state).toBe('PENDING');
  });

  it('lets only archive or approval win their concurrent contract write', async () => {
    const workspaceId = new Types.ObjectId();
    const contractId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    await contracts.create({
      _id: contractId,
      workspaceId,
      status: 'active',
      currentApprovedStoryVersionId: null,
      version: 1,
    });
    const base = {
      _id: contractId,
      workspaceId,
      status: 'active',
      currentApprovedStoryVersionId: null,
      version: 1,
    };

    const results = await Promise.allSettled([
      transaction(connection, session =>
        contracts.findOneAndUpdate(
          base,
          { $set: { status: 'archived' }, $inc: { version: 1 } },
          { new: true, session },
        ),
      ),
      transaction(connection, session =>
        contracts.findOneAndUpdate(
          base,
          {
            $set: { currentApprovedStoryVersionId: versionId },
            $inc: { version: 1 },
          },
          { new: true, session },
        ),
      ),
    ]);
    const winners = results.filter(
      result => result.status === 'fulfilled' && result.value,
    );
    const contract: any = await contracts.findById(contractId).lean();

    expect(winners).toHaveLength(1);
    expect(contract.version).toBe(2);
    expect(
      contract.status === 'archived' ||
        String(contract.currentApprovedStoryVersionId) === String(versionId),
    ).toBe(true);
  });

  it('rolls back production impact resolution pins and criterion links together', async () => {
    const workspaceId = new Types.ObjectId();
    const taskId = new Types.ObjectId();
    const contractId = new Types.ObjectId();
    const oldVersionId = new Types.ObjectId();
    const newVersionId = new Types.ObjectId();
    const assessmentId = new Types.ObjectId();
    await tasks.create({
      _id: taskId,
      workspaceId,
      storyContractId: contractId,
      storyVersionId: oldVersionId,
      requirementsState: 'REBASE_REQUIRED',
    });
    await links.create({ workspaceId, taskId, storyVersionId: oldVersionId });
    await versions.create({
      _id: newVersionId,
      workspaceId,
      storyContractId: contractId,
      versionNumber: 2,
      sourceDraftId: new Types.ObjectId(),
      baseStoryVersionId: oldVersionId,
      submittedBy: new Types.ObjectId(),
      submittedAt: new Date(),
      contentSnapshot: {},
      requirementLinkSnapshot: [],
      criteria: [],
      decisionRecordIds: [],
      contentHash: 'hash',
    });
    await approvals.create({
      _id: assessmentId,
      workspaceId,
      storyContractId: contractId,
      storyVersionId: newVersionId,
      taskId,
      fromStoryVersionId: oldVersionId,
      toStoryVersionId: newVersionId,
      state: 'PENDING',
    });
    const failingAssessments = {
      findOne: approvals.findOne.bind(approvals),
      updateOne: jest
        .fn()
        .mockRejectedValue(new Error('forced rebase failure')),
    };
    const impactService = new (StoryImpactService as any)(
      tasks,
      links,
      failingAssessments,
      {},
      versions,
      contracts,
      connection,
      { emit: jest.fn() },
      {},
      operations,
    );

    await expect(
      impactService.resolve(
        String(workspaceId),
        String(taskId),
        String(assessmentId),
        { userId: String(new Types.ObjectId()), isAdmin: true },
        'rebase-rollback-key',
      ),
    ).rejects.toThrow('forced rebase failure');

    const unchangedTask: any = await tasks.findById(taskId).lean();
    expect(String(unchangedTask.storyVersionId)).toBe(String(oldVersionId));
    expect(await links.countDocuments({ workspaceId, taskId })).toBe(1);
    expect(await operations.countDocuments()).toBe(0);
  });

  it('blocks immutable collection changes through application models', async () => {
    const workspaceId = new Types.ObjectId();
    const contractId = new Types.ObjectId();
    const version = await versions.create({
      workspaceId,
      storyContractId: contractId,
      versionNumber: 1,
      sourceDraftId: new Types.ObjectId(),
      baseStoryVersionId: null,
      submittedBy: new Types.ObjectId(),
      submittedAt: new Date(),
      contentSnapshot: {},
      requirementLinkSnapshot: [],
      criteria: [],
      decisionRecordIds: [],
      contentHash: 'hash',
    });
    const verification = await verifications.create({
      workspaceId,
      storyContractId: contractId,
      storyVersionId: version._id,
      acceptanceCriterionId: new Types.ObjectId(),
      acceptanceCriterionRevisionId: new Types.ObjectId(),
      status: 'PASSED',
      evidenceType: 'manual',
      evidenceRef: 'run-1',
      submittedBy: new Types.ObjectId(),
      submittedAt: new Date(),
    });

    await expect(
      versions.updateOne({ _id: version._id }, { $set: { contentHash: 'x' } }),
    ).rejects.toMatchObject({
      response: { code: 'STORY_VERSION_IMMUTABLE' },
    });
    await expect(
      verifications.updateOne(
        { _id: verification._id },
        { $set: { status: 'FAILED' } },
      ),
    ).rejects.toMatchObject({
      response: { code: 'CRITERION_VERIFICATION_IMMUTABLE' },
    });
  });
});

async function transaction<T>(
  connection: Connection,
  work: (session: import('mongoose').ClientSession) => Promise<T>,
): Promise<T> {
  const session = await connection.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}
