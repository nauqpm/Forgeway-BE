import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TaskMapper } from '../mappers/task.mapper';
import { TaskReadRepository } from '../repositories/task-read.repository';
import { TaskCreationValidationService } from './task-creation-validation.service';
import { TaskDetailService } from './task-detail.service';

describe('TaskDetailService', () => {
  let service: TaskDetailService;
  let repository: jest.Mocked<TaskReadRepository>;
  let mapper: jest.Mocked<TaskMapper>;
  let validationService: jest.Mocked<TaskCreationValidationService>;

  const userId = new Types.ObjectId().toString();
  const workspaceId = new Types.ObjectId().toString();
  const workspace = { _id: new Types.ObjectId(workspaceId), key: 'TESKB' };

  beforeEach(() => {
    repository = {
      findDetailByIdInWorkspace: jest.fn(),
      findDetailByKeyInWorkspace: jest.fn(),
    } as unknown as jest.Mocked<TaskReadRepository>;

    mapper = {
      mapToDetailDto: jest.fn(),
    } as unknown as jest.Mocked<TaskMapper>;

    validationService = {
      getWorkspaceById: jest.fn(),
      validateWorkspaceMember: jest.fn(),
      validateObjectId: jest.fn((id: string, resourceName: string) => {
        if (!Types.ObjectId.isValid(id)) {
          throw new BadRequestException(`Invalid ${resourceName} ID format`);
        }
      }),
    } as unknown as jest.Mocked<TaskCreationValidationService>;

    service = new TaskDetailService(repository, mapper, validationService);
  });

  it('returns task detail by task id scoped to workspace key', async () => {
    const taskId = new Types.ObjectId().toString();
    const task = {
      _id: new Types.ObjectId(taskId),
      workspaceId: new Types.ObjectId(workspaceId),
      key: 'TESKB-1',
      isArchived: false,
    };
    const detail = { id: taskId, workspaceId, key: 'TESKB-1' };

    validationService.getWorkspaceById.mockResolvedValue(workspace as any);
    repository.findDetailByIdInWorkspace.mockResolvedValue(task as any);
    mapper.mapToDetailDto.mockReturnValue(detail as any);

    await expect(
      service.getDetailByIdInWorkspaceKey('TESKB', taskId, userId),
    ).resolves.toEqual(detail);

    expect(validationService.getWorkspaceById).toHaveBeenCalledWith('TESKB');
    expect(validationService.validateWorkspaceMember).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
    expect(repository.findDetailByIdInWorkspace).toHaveBeenCalledWith(
      taskId,
      workspaceId,
      { includeArchived: true },
    );
  });

  it('returns task detail by task key scoped to workspace key', async () => {
    const task = {
      _id: new Types.ObjectId(),
      workspaceId: new Types.ObjectId(workspaceId),
      key: 'TESKB-2',
    };
    const detail = { id: task._id.toString(), workspaceId, key: 'TESKB-2' };

    validationService.getWorkspaceById.mockResolvedValue(workspace as any);
    repository.findDetailByKeyInWorkspace.mockResolvedValue(task as any);
    mapper.mapToDetailDto.mockReturnValue(detail as any);

    await expect(
      service.getDetailByKeyInWorkspaceKey('TESKB', 'teskb-2', userId),
    ).resolves.toEqual(detail);

    expect(repository.findDetailByKeyInWorkspace).toHaveBeenCalledWith(
      'TESKB-2',
      workspaceId,
      {
        includeArchived: true,
      },
    );
  });

  it('rejects invalid task id before repository lookup', async () => {
    validationService.getWorkspaceById.mockResolvedValue(workspace as any);

    await expect(
      service.getDetailByIdInWorkspaceKey('TESKB', 'invalid-id', userId),
    ).rejects.toThrow(BadRequestException);

    expect(repository.findDetailByIdInWorkspace).not.toHaveBeenCalled();
  });

  it('returns not found when scoped task lookup misses', async () => {
    const taskId = new Types.ObjectId().toString();

    validationService.getWorkspaceById.mockResolvedValue(workspace as any);
    repository.findDetailByIdInWorkspace.mockResolvedValue(null);

    await expect(
      service.getDetailByIdInWorkspaceKey('TESKB', taskId, userId),
    ).rejects.toThrow(NotFoundException);
  });
});
