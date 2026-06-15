import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { Task } from '../../tasks/schemas/task.schema';
import { TaskActivityMapper } from '../mappers/task-activity.mapper';
import { TaskActivitiesRepository } from '../repositories/task-activities.repository';
import { TaskActivitiesService } from './task-activities.service';

describe('TaskActivitiesService', () => {
  let service: TaskActivitiesService;
  let repository: jest.Mocked<TaskActivitiesRepository>;
  let mapper: jest.Mocked<TaskActivityMapper>;
  let workspacesService: jest.Mocked<WorkspacesService>;
  let workspaceMemberService: jest.Mocked<WorkspaceMemberService>;
  let taskModel: { findOne: jest.Mock };

  const workspaceId = new Types.ObjectId().toString();
  const taskId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      findByTaskInWorkspace: jest.fn(),
    } as unknown as jest.Mocked<TaskActivitiesRepository>;
    mapper = {
      mapToDtos: jest.fn(),
    } as unknown as jest.Mocked<TaskActivityMapper>;
    workspacesService = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<WorkspacesService>;
    workspaceMemberService = {
      isMember: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceMemberService>;
    taskModel = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskActivitiesService,
        { provide: TaskActivitiesRepository, useValue: repository },
        { provide: TaskActivityMapper, useValue: mapper },
        { provide: WorkspacesService, useValue: workspacesService },
        { provide: WorkspaceMemberService, useValue: workspaceMemberService },
        { provide: getModelToken(Task.name), useValue: taskModel },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(TaskActivitiesService);
  });

  it('lists task activities scoped by workspace key and task id', async () => {
    const activities = [{ _id: new Types.ObjectId() }];
    const mapped = [{ id: activities[0]._id.toString(), taskId }];

    workspacesService.findById.mockResolvedValue({
      _id: new Types.ObjectId(workspaceId),
      key: 'TESKB',
    } as any);
    workspaceMemberService.isMember.mockResolvedValue(true);
    taskModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(taskId),
        workspaceId: new Types.ObjectId(workspaceId),
      }),
    });
    repository.findByTaskInWorkspace.mockResolvedValue({
      activities,
      total: 1,
      page: 1,
      limit: 20,
    } as any);
    mapper.mapToDtos.mockReturnValue(mapped as any);

    await expect(
      service.findByTaskInWorkspaceKey('TESKB', taskId, userId),
    ).resolves.toEqual({
      activities: mapped,
      total: 1,
      page: 1,
      limit: 20,
    });

    expect(workspacesService.findById).toHaveBeenCalledWith('TESKB');
    expect(workspaceMemberService.isMember).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
    expect(repository.findByTaskInWorkspace).toHaveBeenCalledWith(
      workspaceId,
      taskId,
      {},
    );
  });

  it('returns not found when user is not a workspace member', async () => {
    workspacesService.findById.mockResolvedValue({
      _id: new Types.ObjectId(workspaceId),
      key: 'TESKB',
    } as any);
    workspaceMemberService.isMember.mockResolvedValue(false);

    await expect(
      service.findByTaskInWorkspaceKey('TESKB', taskId, userId),
    ).rejects.toThrow(NotFoundException);

    expect(repository.findByTaskInWorkspace).not.toHaveBeenCalled();
  });
});
