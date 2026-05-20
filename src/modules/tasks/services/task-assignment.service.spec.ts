import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { TaskMapper } from '../mappers/task.mapper';
import { TasksRepository } from '../repositories/tasks.repository';
import { TaskAssignmentService } from './task-assignment.service';

describe('TaskAssignmentService', () => {
  let service: TaskAssignmentService;
  let repository: jest.Mocked<TasksRepository>;
  let mapper: jest.Mocked<TaskMapper>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskAssignmentService,
        {
          provide: TasksRepository,
          useValue: {
            findById: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: TaskMapper,
          useValue: {
            mapToDto: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TaskAssignmentService>(TaskAssignmentService);
    repository = module.get(TasksRepository);
    mapper = module.get(TaskMapper);
  });

  describe('assignTo', () => {
    it('should assign task to user', async () => {
      const taskId = new Types.ObjectId().toString();
      const userId = new Types.ObjectId().toString();
      const mockTask = { _id: new Types.ObjectId(taskId), key: 'TEST-1' };
      const updatedTask = {
        ...mockTask,
        assigneeId: new Types.ObjectId(userId),
      };
      const mockDto = { id: taskId, key: 'TEST-1' };

      repository.findById.mockResolvedValue(mockTask as any);
      repository.update.mockResolvedValue(updatedTask as any);
      mapper.mapToDto.mockReturnValue(mockDto as any);

      const result = await service.assignTo(taskId, userId);

      expect(result).toEqual(mockDto);
      expect(repository.update).toHaveBeenCalledWith(
        taskId,
        expect.objectContaining({
          assigneeId: expect.any(Types.ObjectId),
        }),
      );
    });

    it('should throw NotFoundException if task not found', async () => {
      const taskId = new Types.ObjectId().toString();
      const userId = new Types.ObjectId().toString();

      repository.findById.mockResolvedValue(null);

      await expect(service.assignTo(taskId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
