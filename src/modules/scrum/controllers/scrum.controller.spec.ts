import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { ScrumController } from './scrum.controller';
import { ScrumService } from '../services/scrum.service';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceTypeGuard } from '../../../common/guards/workspace-type.guard';
import { ScopedRoleGuard } from '../../../common/guards/scoped-role.guard';
import { Workspace } from '../../workspaces/schemas/workspace.schema';
import { TokenService } from '../../auth/services/token.service';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { JwtService } from '@nestjs/jwt';
import {
  CreateSprintDto,
  UpdateSprintDto,
  StartSprintDto,
  CompleteSprintDto,
  MoveTasksToSprintDto,
} from '../dtos/sprint.dto';

describe('ScrumController', () => {
  let controller: ScrumController;
  let scrumService: jest.Mocked<ScrumService>;
  let workspacesService: jest.Mocked<WorkspacesService>;

  const workspaceId = new Types.ObjectId().toString();
  const workspaceKey = 'PROJ';
  const mockWorkspace = {
    _id: new Types.ObjectId(workspaceId),
    key: workspaceKey,
    name: 'Test Project',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScrumController],
      providers: [
        {
          provide: ScrumService,
          useValue: {
            createSprint: jest.fn(),
            findByWorkspace: jest.fn(),
            updateSprint: jest.fn(),
            deleteSprint: jest.fn(),
            startSprint: jest.fn(),
            completeSprint: jest.fn(),
            getBacklog: jest.fn(),
            getActiveSprint: jest.fn(),
            moveTasksToSprint: jest.fn(),
            moveTasksToBacklog: jest.fn(),
            getSprintTasks: jest.fn(),
            getCompleteSprintPreview: jest.fn(),
          },
        },
        {
          provide: WorkspacesService,
          useValue: {
            findByKey: jest.fn().mockResolvedValue(mockWorkspace),
          },
        },
        {
          provide: getModelToken(Workspace.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnThis(),
              lean: jest.fn().mockReturnThis(),
              exec: jest.fn().mockResolvedValue({ type: 'scrum' }),
            }),
          },
        },
        {
          provide: TokenService,
          useValue: {
            verifyAccessToken: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            logEvent: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(WorkspaceTypeGuard('scrum'))
      .useValue({ canActivate: () => true })
      .overrideGuard(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
      .useValue({ canActivate: () => true })
      .overrideGuard(ScopedRoleGuard('workspace', SPACE_ROLES.VIEWER))
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ScrumController>(ScrumController);
    scrumService = module.get(ScrumService);
    workspacesService = module.get(WorkspacesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createSprint', () => {
    it('should call scrumService.createSprint with correct arguments', async () => {
      const dto: CreateSprintDto = { name: 'Sprint 1', goal: 'Initial goal' } as any;
      const expectedResult = { _id: 'sprint1', ...dto };
      scrumService.createSprint.mockResolvedValue(expectedResult as any);

      const result = await controller.createSprint(workspaceKey, dto);

      expect(workspacesService.findByKey).toHaveBeenCalledWith(workspaceKey);
      expect(scrumService.createSprint).toHaveBeenCalledWith(workspaceId, dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findByWorkspace', () => {
    it('should return all sprints in the workspace', async () => {
      const sprints = [{ _id: 's1', name: 'Sprint 1' }, { _id: 's2', name: 'Sprint 2' }];
      scrumService.findByWorkspace.mockResolvedValue(sprints as any);

      const result = await controller.findByWorkspace(workspaceKey);

      expect(workspacesService.findByKey).toHaveBeenCalledWith(workspaceKey);
      expect(scrumService.findByWorkspace).toHaveBeenCalledWith(workspaceId);
      expect(result).toEqual(sprints);
    });
  });

  describe('updateSprint', () => {
    it('should update and return the sprint', async () => {
      const sprintId = new Types.ObjectId().toString();
      const dto: UpdateSprintDto = { name: 'Sprint 1 - Updated' };
      const updatedSprint = { _id: sprintId, name: 'Sprint 1 - Updated' };
      scrumService.updateSprint.mockResolvedValue(updatedSprint as any);

      const result = await controller.updateSprint(workspaceKey, sprintId, dto);

      expect(scrumService.updateSprint).toHaveBeenCalledWith(workspaceId, sprintId, dto);
      expect(result).toEqual(updatedSprint);
    });
  });

  describe('deleteSprint', () => {
    it('should delete the sprint and return undefined', async () => {
      const sprintId = new Types.ObjectId().toString();
      scrumService.deleteSprint.mockResolvedValue(undefined);

      const result = await controller.deleteSprint(workspaceKey, sprintId);

      expect(scrumService.deleteSprint).toHaveBeenCalledWith(workspaceId, sprintId);
      expect(result).toBeUndefined();
    });
  });

  describe('startSprint', () => {
    it('should start the sprint and return it', async () => {
      const sprintId = new Types.ObjectId().toString();
      const dto: StartSprintDto = { startDate: '2026-06-01', endDate: '2026-06-15' };
      const startedSprint = { _id: sprintId, status: 'active', ...dto };
      scrumService.startSprint.mockResolvedValue(startedSprint as any);

      const result = await controller.startSprint(workspaceKey, sprintId, dto);

      expect(scrumService.startSprint).toHaveBeenCalledWith(workspaceId, sprintId, dto);
      expect(result).toEqual(startedSprint);
    });
  });

  describe('completeSprint', () => {
    it('should complete the sprint and return summary', async () => {
      const sprintId = new Types.ObjectId().toString();
      const dto: CompleteSprintDto = { moveToSprintId: 'sprint2' };
      const summary = { _id: sprintId, status: 'completed', incompleteTasksMovedTo: 'sprint2' };
      scrumService.completeSprint.mockResolvedValue(summary);

      const result = await controller.completeSprint(workspaceKey, sprintId, dto);

      expect(scrumService.completeSprint).toHaveBeenCalledWith(workspaceId, sprintId, dto);
      expect(result).toEqual(summary);
    });
  });

  describe('getBacklog', () => {
    it('should return flat backlog tasks when grouped query is false', async () => {
      const tasks = [{ _id: 't1', title: 'Task 1' }];
      scrumService.getBacklog.mockResolvedValue(tasks);

      const result = await controller.getBacklog(workspaceKey, 'false');

      expect(scrumService.getBacklog).toHaveBeenCalledWith(workspaceId, false);
      expect(result).toEqual(tasks);
    });

    it('should return grouped backlog when grouped query is true', async () => {
      const groupedData = { activeSprint: null, futureSprints: [], backlogTasks: [] };
      scrumService.getBacklog.mockResolvedValue(groupedData);

      const result = await controller.getBacklog(workspaceKey, 'true');

      expect(scrumService.getBacklog).toHaveBeenCalledWith(workspaceId, true);
      expect(result).toEqual(groupedData);
    });
  });

  describe('getActiveSprint', () => {
    it('should return the active sprint details', async () => {
      const activeSprint = { _id: 's1', status: 'active', tasks: [] };
      scrumService.getActiveSprint.mockResolvedValue(activeSprint as any);

      const result = await controller.getActiveSprint(workspaceKey);

      expect(scrumService.getActiveSprint).toHaveBeenCalledWith(workspaceId);
      expect(result).toEqual(activeSprint);
    });
  });

  describe('moveTasksToSprint', () => {
    it('should move tasks to sprint and return modified count', async () => {
      const sprintId = new Types.ObjectId().toString();
      const dto: MoveTasksToSprintDto = { taskIds: ['t1', 't2'] };
      const user = { userId: 'u1', role: 'member' };
      scrumService.moveTasksToSprint.mockResolvedValue({ modifiedCount: 2 });

      const result = await controller.moveTasksToSprint(workspaceKey, sprintId, dto, user as any);

      expect(scrumService.moveTasksToSprint).toHaveBeenCalledWith(workspaceId, sprintId, dto.taskIds, false);
      expect(result).toEqual({ modifiedCount: 2 });
    });

    it('should call moveTasksToSprint with isSuperAdmin=true when user has super_admin role', async () => {
      const sprintId = new Types.ObjectId().toString();
      const dto: MoveTasksToSprintDto = { taskIds: ['t1'] };
      const user = { userId: 'u1', role: 'super_admin' };
      scrumService.moveTasksToSprint.mockResolvedValue({ modifiedCount: 1 });

      await controller.moveTasksToSprint(workspaceKey, sprintId, dto, user as any);

      expect(scrumService.moveTasksToSprint).toHaveBeenCalledWith(workspaceId, sprintId, dto.taskIds, true);
    });
  });

  describe('moveTasksToBacklog', () => {
    it('should move tasks to backlog and return modified count', async () => {
      const dto: MoveTasksToSprintDto = { taskIds: ['t1'] };
      const user = { userId: 'u1', role: 'member' };
      scrumService.moveTasksToBacklog.mockResolvedValue({ modifiedCount: 1 });

      const result = await controller.moveTasksToBacklog(workspaceKey, dto, user as any);

      expect(scrumService.moveTasksToBacklog).toHaveBeenCalledWith(workspaceId, dto.taskIds, false);
      expect(result).toEqual({ modifiedCount: 1 });
    });
  });

  describe('getSprintTasks', () => {
    it('should return tasks in the sprint', async () => {
      const sprintId = new Types.ObjectId().toString();
      const tasks = [{ _id: 't1', title: 'Task 1' }];
      scrumService.getSprintTasks.mockResolvedValue(tasks as any);

      const result = await controller.getSprintTasks(workspaceKey, sprintId);

      expect(scrumService.getSprintTasks).toHaveBeenCalledWith(workspaceId, sprintId);
      expect(result).toEqual(tasks);
    });
  });

  describe('getCompleteSprintPreview', () => {
    it('should return complete sprint preview details', async () => {
      const sprintId = new Types.ObjectId().toString();
      const preview = { sprintId, totalTasks: 5, completedTasks: 3, incompleteTasks: 2 };
      scrumService.getCompleteSprintPreview.mockResolvedValue(preview);

      const result = await controller.getCompleteSprintPreview(workspaceKey, sprintId);

      expect(scrumService.getCompleteSprintPreview).toHaveBeenCalledWith(workspaceId, sprintId);
      expect(result).toEqual(preview);
    });
  });
});
