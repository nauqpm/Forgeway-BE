import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SprintNotificationService } from './sprint-notification.service';
import { NotificationsService } from './notifications.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import {
  SprintStartedEvent,
  SprintCompletedEvent,
} from '../../../shared/events/domain-events/sprint';
import { Types } from 'mongoose';

describe('SprintNotificationService', () => {
  let service: SprintNotificationService;

  const mockNotificationsService = {
    notifySprintStarted: jest.fn(),
    notifySprintCompleted: jest.fn(),
  };

  const mockWorkspaceMemberService = {
    getMemberIdsSet: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintNotificationService,
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: WorkspaceMemberService,
          useValue: mockWorkspaceMemberService,
        },
      ],
    }).compile();

    service = module.get<SprintNotificationService>(SprintNotificationService);

    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleSprintStarted', () => {
    it('should notify all members except the actor', async () => {
      const workspaceId = new Types.ObjectId().toString();
      const sprintId = new Types.ObjectId().toString();
      const actorId = new Types.ObjectId().toString();
      const member1 = new Types.ObjectId().toString();
      const member2 = new Types.ObjectId().toString();

      mockWorkspaceMemberService.getMemberIdsSet.mockResolvedValue(
        new Set([actorId, member1, member2]),
      );

      const event = new SprintStartedEvent({
        sprintId,
        workspaceId,
        actorId,
        sprint: {
          name: 'Sprint 1',
          endDate: new Date('2026-08-10'),
        } as any,
      });

      await service.handleSprintStarted(event);

      expect(mockWorkspaceMemberService.getMemberIdsSet).toHaveBeenCalledWith(
        workspaceId,
      );
      expect(mockNotificationsService.notifySprintStarted).toHaveBeenCalledWith(
        {
          recipientIds: [member1, member2],
          actorId,
          workspaceId,
          sprintId,
          sprintName: 'Sprint 1',
          endDate: event.data.sprint.endDate,
        },
      );
    });

    it('should not notify if no other members exist', async () => {
      const workspaceId = new Types.ObjectId().toString();
      const sprintId = new Types.ObjectId().toString();
      const actorId = new Types.ObjectId().toString();

      mockWorkspaceMemberService.getMemberIdsSet.mockResolvedValue(
        new Set([actorId]),
      );

      const event = new SprintStartedEvent({
        sprintId,
        workspaceId,
        actorId,
        sprint: {
          name: 'Sprint 1',
        } as any,
      });

      await service.handleSprintStarted(event);

      expect(
        mockNotificationsService.notifySprintStarted,
      ).not.toHaveBeenCalled();
    });
  });

  describe('handleSprintCompleted', () => {
    it('should notify all members except the actor', async () => {
      const workspaceId = new Types.ObjectId().toString();
      const sprintId = new Types.ObjectId().toString();
      const actorId = new Types.ObjectId().toString();
      const member1 = new Types.ObjectId().toString();
      const member2 = new Types.ObjectId().toString();

      mockWorkspaceMemberService.getMemberIdsSet.mockResolvedValue(
        new Set([actorId, member1, member2]),
      );

      const event = new SprintCompletedEvent({
        sprintId,
        workspaceId,
        actorId,
        sprint: {
          name: 'Sprint 1',
        } as any,
        incompleteTasksMovedTo: null,
      });

      await service.handleSprintCompleted(event);

      expect(mockWorkspaceMemberService.getMemberIdsSet).toHaveBeenCalledWith(
        workspaceId,
      );
      expect(
        mockNotificationsService.notifySprintCompleted,
      ).toHaveBeenCalledWith({
        recipientIds: [member1, member2],
        actorId,
        workspaceId,
        sprintId,
        sprintName: 'Sprint 1',
      });
    });

    it('should handle errors gracefully', async () => {
      const workspaceId = new Types.ObjectId().toString();
      const sprintId = new Types.ObjectId().toString();
      const actorId = new Types.ObjectId().toString();

      mockWorkspaceMemberService.getMemberIdsSet.mockRejectedValue(
        new Error('DB Error'),
      );

      const event = new SprintCompletedEvent({
        sprintId,
        workspaceId,
        actorId,
        sprint: {
          name: 'Sprint 1',
        } as any,
        incompleteTasksMovedTo: null,
      });

      await expect(
        service.handleSprintCompleted(event),
      ).resolves.toBeUndefined();
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        `Failed to create sprint completed notifications for sprint ${sprintId}: DB Error`,
      );
    });
  });
});
