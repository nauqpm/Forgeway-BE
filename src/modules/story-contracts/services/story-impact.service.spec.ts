import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StoryImpactService } from './story-impact.service';

describe('StoryImpactService', () => {
  const session = { id: 'session-1' } as any;

  const createService = (overrides: Record<string, any> = {}) => {
    const taskModel = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      updateOne: jest.fn(),
      ...overrides.taskModel,
    };
    const links = {
      find: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      insertMany: jest.fn(),
      ...overrides.links,
    };
    const assessments = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      updateOne: jest.fn(),
      ...overrides.assessments,
    };
    const changes = {
      findOne: jest.fn().mockResolvedValue({}),
      ...overrides.changes,
    };
    const versions = {
      findOne: jest.fn(),
      ...overrides.versions,
    };
    const contracts = {
      findOne: jest.fn().mockResolvedValue({
        currentApprovedStoryVersionId: 'version-2',
      }),
      ...overrides.contracts,
    };
    const workflows = {
      findByWorkspace: jest.fn().mockResolvedValue({
        statuses: [{ id: 'done', category: 'done' }],
      }),
      ...overrides.workflows,
    };
    const transaction = jest.fn(async callback => callback());
    const dbSession = {
      withTransaction: transaction,
      endSession: jest.fn(),
    };
    const connection = {
      startSession: jest.fn().mockResolvedValue(dbSession),
      ...overrides.connection,
    };
    const events = { emit: jest.fn(), ...overrides.events };
    const operations = {
      findOne: jest.fn(),
      create: jest.fn(),
      ...overrides.operations,
    };

    return {
      service: new (StoryImpactService as any)(
        taskModel,
        links,
        assessments,
        changes,
        versions,
        contracts,
        connection,
        events,
        workflows,
        operations,
      ),
      taskModel,
      links,
      assessments,
      changes,
      versions,
      contracts,
      connection,
      dbSession,
      events,
      workflows,
      operations,
    };
  };

  it('classifies blocking, non-blocking, and irrelevant criterion changes per task', async () => {
    const tasks = [
      { _id: 'task-blocking' },
      { _id: 'task-review' },
      { _id: 'task-current' },
    ];
    const { service, taskModel, links } = createService({
      taskModel: { find: jest.fn().mockResolvedValue(tasks) },
      links: {
        find: jest.fn().mockImplementation(({ taskId }) =>
          Promise.resolve(
            taskId === 'task-current'
              ? []
              : [
                  {
                    acceptanceCriterionId:
                      taskId === 'task-blocking' ? 'ac-blocking' : 'ac-review',
                  },
                ],
          ),
        ),
      },
      changes: {
        findOne: jest.fn().mockResolvedValue({
          acceptanceCriterionChanges: [
            { entityId: 'ac-blocking', impactLevel: 'BLOCKING' },
            { entityId: 'ac-review', impactLevel: 'NON_BLOCKING' },
          ],
        }),
      },
    });

    await service.assess(
      'workspace-1',
      'contract-1',
      'version-1',
      'version-2',
      session,
    );

    expect(
      taskModel.updateOne.mock.calls.map(
        call => call[1].$set.requirementsState,
      ),
    ).toEqual(['REBASE_REQUIRED', 'REVIEW_REQUIRED', 'CURRENT']);
    expect(links.find).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['requirementChanges', 'BLOCKING', 'REBASE_REQUIRED'],
    ['businessRuleChanges', 'NON_BLOCKING', 'REVIEW_REQUIRED'],
  ])(
    'applies a %s Story-level change to every task pinned to the old version',
    async (changeField, impactLevel, expectedState) => {
      const { service, taskModel } = createService({
        taskModel: { find: jest.fn().mockResolvedValue([{ _id: 'task-1' }]) },
        changes: {
          findOne: jest.fn().mockResolvedValue({
            [changeField]: [{ entityId: 'story-change', impactLevel }],
          }),
        },
      });

      await service.assess(
        'workspace-1',
        'contract-1',
        'version-1',
        'version-2',
        session,
      );

      expect(taskModel.updateOne).toHaveBeenCalledWith(
        { _id: 'task-1', workspaceId: 'workspace-1' },
        { $set: { requirementsState: expectedState } },
        { session },
      );
    },
  );

  it('assesses only open tasks by excluding every dynamic done status', async () => {
    const { service, taskModel } = createService();

    await service.assess(
      'workspace-1',
      'contract-1',
      'version-1',
      'version-2',
      session,
    );

    expect(taskModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        status: { $nin: ['done'] },
      }),
      null,
      { session },
    );
  });

  it('rejects a superseded or not-yet-approved version', async () => {
    const { service, contracts } = createService({
      versions: {
        findOne: jest.fn().mockResolvedValue({ _id: 'version-draft' }),
      },
      contracts: {
        findOne: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(
      service.assertTaskVersion('workspace-1', 'contract-1', 'version-draft'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(contracts.findOne).toHaveBeenCalledWith({
      _id: 'contract-1',
      workspaceId: 'workspace-1',
      status: 'active',
      currentApprovedStoryVersionId: 'version-draft',
    });
  });

  it('returns not found for version impact beneath the wrong parent', async () => {
    const { service, assessments } = createService({
      versions: { findOne: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.findVersionImpact('workspace-1', 'wrong-contract', 'version-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(assessments.find).not.toHaveBeenCalled();
  });

  it('scopes task impact through the Task contract and rejects an empty read', async () => {
    const sort = jest.fn().mockResolvedValue(null);
    const { service, assessments } = createService({
      taskModel: {
        findOne: jest.fn().mockResolvedValue({
          _id: 'task-1',
          storyContractId: 'contract-1',
        }),
      },
      assessments: {
        findOne: jest.fn().mockReturnValue({ sort }),
      },
    });

    await expect(
      service.findTaskImpact('workspace-1', 'task-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(assessments.findOne).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      taskId: 'task-1',
      storyContractId: 'contract-1',
    });
  });

  it('links the exact Story Version and criterion snapshot in one transaction', async () => {
    const criteria = [
      {
        acceptanceCriterionId: 'criterion-1',
        acceptanceCriterionRevisionId: 'revision-1',
      },
    ];
    const { service, taskModel, links, versions, dbSession } = createService({
      taskModel: {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ _id: 'task-1' })
          .mockResolvedValueOnce({
            _id: 'task-1',
            storyVersionId: 'version-2',
          }),
      },
      versions: {
        findOne: jest.fn().mockResolvedValue({ _id: 'version-2', criteria }),
      },
    });

    await service.linkTask('workspace-1', 'contract-1', 'version-2', 'task-1');

    expect(taskModel.updateOne).toHaveBeenCalledWith(
      { _id: 'task-1', workspaceId: 'workspace-1' },
      expect.any(Object),
      { session: dbSession },
    );
    expect(links.deleteMany).toHaveBeenCalledWith(
      { workspaceId: 'workspace-1', taskId: 'task-1' },
      { session: dbSession },
    );
    expect(links.insertMany).toHaveBeenCalledWith(expect.any(Array), {
      session: dbSession,
    });
    expect(dbSession.endSession).toHaveBeenCalled();
    expect(versions.findOne).toHaveBeenCalledWith(
      {
        _id: 'version-2',
        workspaceId: 'workspace-1',
        storyContractId: 'contract-1',
      },
      null,
      { session: dbSession },
    );
  });

  it('rejects impact resolution by an unassigned non-admin without writing', async () => {
    const { service, taskModel, assessments, events } = createService({
      assessments: {
        findOne: jest.fn().mockResolvedValue({
          _id: 'impact-1',
          storyContractId: 'contract-1',
          toStoryVersionId: 'version-2',
        }),
      },
      taskModel: {
        findOne: jest.fn().mockResolvedValue({
          _id: 'task-1',
          assigneeId: 'assigned-user',
        }),
      },
    });

    await expect(
      service.resolve('workspace-1', 'task-1', 'impact-1', {
        userId: 'other-user',
        isAdmin: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(taskModel.updateOne).not.toHaveBeenCalled();
    expect(assessments.updateOne).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('rejects a stale impact after the Task was already relinked', async () => {
    const { service, taskModel, assessments, events } = createService({
      assessments: {
        findOne: jest.fn().mockResolvedValue({
          _id: 'impact-1',
          storyContractId: 'contract-1',
          fromStoryVersionId: 'version-1',
          toStoryVersionId: 'version-2',
        }),
      },
      taskModel: {
        findOne: jest
          .fn()
          .mockImplementation(query =>
            query.storyVersionId === 'version-1'
              ? null
              : { _id: 'task-1', assigneeId: 'assigned-user' },
          ),
      },
    });

    await expect(
      service.resolve('workspace-1', 'task-1', 'impact-1', {
        userId: 'assigned-user',
        isAdmin: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(taskModel.updateOne).not.toHaveBeenCalled();
    expect(assessments.updateOne).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('resolves impact atomically and emits the rebased event after commit', async () => {
    const assessment = {
      _id: 'impact-1',
      storyContractId: 'contract-1',
      fromStoryVersionId: 'version-1',
      toStoryVersionId: 'version-2',
    };
    const { service, taskModel, links, assessments, dbSession, events } =
      createService({
        assessments: { findOne: jest.fn().mockResolvedValue(assessment) },
        taskModel: {
          findOne: jest
            .fn()
            .mockResolvedValue({ _id: 'task-1', assigneeId: 'assigned-user' }),
        },
        versions: {
          findOne: jest.fn().mockResolvedValue({
            _id: 'version-2',
            criteria: [],
          }),
        },
      });

    await service.resolve('workspace-1', 'task-1', 'impact-1', {
      userId: 'assigned-user',
      isAdmin: false,
    });

    expect(taskModel.updateOne).toHaveBeenCalledWith(
      { _id: 'task-1', workspaceId: 'workspace-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          storyVersionId: 'version-2',
          requirementsState: 'CURRENT',
        }),
      }),
      { session: dbSession },
    );
    expect(links.deleteMany).toHaveBeenCalledWith(
      { workspaceId: 'workspace-1', taskId: 'task-1' },
      { session: dbSession },
    );
    expect(assessments.updateOne).toHaveBeenCalledWith(
      { _id: 'impact-1', workspaceId: 'workspace-1', state: 'PENDING' },
      expect.any(Object),
      { session: dbSession },
    );
    expect(events.emit).toHaveBeenCalledWith('task.story.rebased', {
      workspaceId: 'workspace-1',
      storyContractId: 'contract-1',
      taskId: 'task-1',
      assessmentId: 'impact-1',
      userId: 'assigned-user',
    });
  });

  it('replays impact resolution for the same actor, key, and payload', async () => {
    const assessment = {
      _id: 'impact-1',
      storyContractId: 'contract-1',
      fromStoryVersionId: 'version-1',
      toStoryVersionId: 'version-2',
    };
    const { service, taskModel, assessments, operations, events } =
      createService({
        assessments: { findOne: jest.fn().mockResolvedValue(assessment) },
        taskModel: {
          findOne: jest
            .fn()
            .mockResolvedValue({ _id: 'task-1', assigneeId: 'assigned-user' }),
        },
        versions: {
          findOne: jest.fn().mockResolvedValue({
            _id: 'version-2',
            criteria: [],
          }),
        },
        operations: {
          findOne: jest.fn(),
          create: jest.fn(),
        },
      });
    let savedOperation: Record<string, unknown> | undefined;
    operations.findOne.mockImplementation(() =>
      Promise.resolve(savedOperation),
    );
    operations.create.mockImplementation(async ([record]) => {
      savedOperation = record;
      return [record];
    });

    const actor = { userId: 'assigned-user', isAdmin: false };
    const first = await service.resolve(
      'workspace-1',
      'task-1',
      'impact-1',
      actor,
      'resolve-key',
    );
    const replay = await service.resolve(
      'workspace-1',
      'task-1',
      'impact-1',
      actor,
      'resolve-key',
    );

    expect(replay).toEqual(first);
    expect(taskModel.updateOne).toHaveBeenCalledTimes(1);
    expect(assessments.updateOne).toHaveBeenCalledTimes(1);
    expect(operations.create).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });
});
