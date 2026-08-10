import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

import { SPACE_ROLES } from '@/common/constants/space-role.constants';
import { ChannelsService } from '@/modules/chat/services/channels.service';
import { KanbanService } from '@/modules/kanban/services/kanban.service';
import { ScrumService } from '@/modules/scrum/services/scrum.service';
import { UsersService } from '@/modules/users/services/users.service';
import { WorkflowsService } from '@/modules/workflows/services/workflows.service';
import { WorkspacesRepository } from '@/modules/workspaces/repositories/workspaces.repository';
import { WorkspaceDomainEventPublisher } from '@/modules/workspaces/services/workspace-domain-event.publisher';
import { WorkspaceKeyService } from '@/modules/workspaces/services/workspace-key.service';
import { WorkspacesService } from '@/modules/workspaces/services/workspaces.service';
import { Task } from '@/modules/tasks/schemas/task.schema';
import { Page } from '@/modules/pages/schemas/page.schema';
import { DocumentEntity } from '@/modules/documents/schemas/document.schema';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeId = () => new Types.ObjectId().toString();

const OWNER_ID = makeId();
const WORKSPACE_ID = makeId();

const buildWorkspace = (overrides: Partial<any> = {}) => ({
  _id: new Types.ObjectId(WORKSPACE_ID),
  name: 'Test Workspace',
  description: 'A test workspace',
  slug: 'test-workspace',
  key: 'TESTWOR',
  type: 'kanban',
  access: 'public',
  status: 'active',
  ownerId: new Types.ObjectId(OWNER_ID),
  members: [
    { userId: new Types.ObjectId(OWNER_ID), role: SPACE_ROLES.WORKSPACE_ADMIN },
  ],
  settings: {},
  ...overrides,
});

// ─── Mock factories ──────────────────────────────────────────────────────────

const mockWorkspacesRepository = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findAllWithDeleted: jest.fn(),
  findById: jest.fn(),
  findByIdWithMembers: jest.fn(),
  findBySlug: jest.fn(),
  findAnyBySlug: jest.fn(),
  findByKey: jest.fn(),
  findAnyByKey: jest.fn(),
  findByUserId: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  restore: jest.fn(),
  addMember: jest.fn(),
  removeMember: jest.fn(),
  updateMemberRole: jest.fn(),
});

const mockWorkflowsService = () => ({
  createDefaultWorkflow: jest.fn(),
});

const mockKanbanService = () => ({
  createDefaultBoard: jest.fn(),
  deleteByWorkspace: jest.fn(),
});

const mockScrumService = () => ({
  deleteByWorkspace: jest.fn(),
  restoreByWorkspace: jest.fn(),
});

const mockUsersService = () => ({
  findByEmail: jest.fn(),
  getUserById: jest.fn(async () => ({
    _id: 'userId',
    workspaceOrder: [] as string[],
  })),
  updateUser: jest.fn(async () => ({})),
});

const mockWorkspaceKeyService = () => ({
  generateUniqueSlug: jest.fn(async (name: string) =>
    name.toLowerCase().replace(/\s+/g, '-'),
  ),
  generateUniqueKey: jest.fn(async (key: string) => key.toUpperCase()),
});

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let repo: ReturnType<typeof mockWorkspacesRepository>;
  let workflowsService: ReturnType<typeof mockWorkflowsService>;
  let kanbanService: ReturnType<typeof mockKanbanService>;
  let scrumService: ReturnType<typeof mockScrumService>;
  let usersService: ReturnType<typeof mockUsersService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: WorkspacesRepository, useFactory: mockWorkspacesRepository },
        { provide: WorkflowsService, useFactory: mockWorkflowsService },
        { provide: KanbanService, useFactory: mockKanbanService },
        { provide: ScrumService, useFactory: mockScrumService },
        { provide: UsersService, useFactory: mockUsersService },
        { provide: WorkspaceKeyService, useFactory: mockWorkspaceKeyService },
        {
          provide: WorkspaceDomainEventPublisher,
          useValue: {
            publishCreated: jest.fn(),
            publishUpdated: jest.fn(),
            publishDeleted: jest.fn(),
            publishArchived: jest.fn(),
            publishRestored: jest.fn(),
          },
        },
        {
          provide: getModelToken(Task.name),
          useValue: { countDocuments: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: getModelToken(Page.name),
          useValue: { countDocuments: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: getModelToken(DocumentEntity.name),
          useValue: { countDocuments: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: ChannelsService,
          useValue: { createWorkspaceChannel: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    service = module.get(WorkspacesService);
    repo = module.get(WorkspacesRepository);
    workflowsService = module.get(WorkflowsService);
    kanbanService = module.get(KanbanService);
    scrumService = module.get(ScrumService);
    usersService = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { name: 'My Workspace', slug: 'my-workspace', key: 'MYWOR' };

    it('creates workspace and initialises default board + workflow', async () => {
      repo.findAnyBySlug.mockResolvedValue(null);
      repo.findAnyByKey.mockResolvedValue(null);
      const workspace = buildWorkspace({ name: dto.name, slug: dto.slug });
      repo.create.mockResolvedValue(workspace);
      kanbanService.createDefaultBoard.mockResolvedValue(undefined);
      workflowsService.createDefaultWorkflow.mockResolvedValue(undefined);

      const result = await service.create(OWNER_ID, dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: dto.name,
          slug: dto.slug,
          ownerId: new Types.ObjectId(OWNER_ID),
          members: [
            {
              userId: new Types.ObjectId(OWNER_ID),
              role: SPACE_ROLES.WORKSPACE_ADMIN,
            },
          ],
        }),
      );
      expect(kanbanService.createDefaultBoard).toHaveBeenCalledWith(
        workspace._id.toString(),
      );
      expect(workflowsService.createDefaultWorkflow).toHaveBeenCalledWith(
        workspace._id.toString(),
      );
      expect(result).toEqual(workspace);
    });

    it('auto-generates slug from name when slug is not provided', async () => {
      const noSlugDto = { name: 'Auto Slug Workspace' };
      repo.findAnyBySlug.mockResolvedValue(null);
      repo.findAnyByKey.mockResolvedValue(null);
      const workspace = buildWorkspace({ slug: 'auto-slug-workspace' });
      repo.create.mockResolvedValue(workspace);
      kanbanService.createDefaultBoard.mockResolvedValue(undefined);
      workflowsService.createDefaultWorkflow.mockResolvedValue(undefined);

      await service.create(OWNER_ID, noSlugDto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: expect.any(String) }),
      );
    });

    it('throws BadRequestException when slug already exists', async () => {
      repo.findAnyBySlug.mockResolvedValue(buildWorkspace());
      repo.findAnyByKey.mockResolvedValue(null);

      await expect(service.create(OWNER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('does not throw when createDefaultBoard fails silently', async () => {
      repo.findAnyBySlug.mockResolvedValue(null);
      repo.findAnyByKey.mockResolvedValue(null);
      repo.create.mockResolvedValue(buildWorkspace());
      kanbanService.createDefaultBoard.mockRejectedValue(
        new Error('board error'),
      );
      workflowsService.createDefaultWorkflow.mockResolvedValue(undefined);

      await expect(service.create(OWNER_ID, dto)).resolves.not.toThrow();
    });

    it('does not throw when createDefaultWorkflow raises ConflictException', async () => {
      repo.findAnyBySlug.mockResolvedValue(null);
      repo.findAnyByKey.mockResolvedValue(null);
      repo.create.mockResolvedValue(buildWorkspace());
      kanbanService.createDefaultBoard.mockResolvedValue(undefined);
      workflowsService.createDefaultWorkflow.mockRejectedValue(
        new ConflictException('workflow exists'),
      );

      await expect(service.create(OWNER_ID, dto)).resolves.not.toThrow();
    });

    it('generates an incremented key when base key already exists', async () => {
      const dtoWithKey = { name: 'Workspace', slug: 'workspace', key: 'SPACE' };
      repo.findAnyBySlug.mockResolvedValue(null);
      // First findByKey call (for 'SPACE') returns a different workspace
      const other = buildWorkspace({ _id: new Types.ObjectId(), key: 'SPACE' });
      repo.findAnyByKey
        .mockResolvedValueOnce(other) // 'SPACE' → taken
        .mockResolvedValueOnce(null); // 'SPACE1' → free

      repo.create.mockResolvedValue(buildWorkspace({ key: 'SPACE1' }));
      kanbanService.createDefaultBoard.mockResolvedValue(undefined);
      workflowsService.createDefaultWorkflow.mockResolvedValue(undefined);

      const result = await service.create(OWNER_ID, dtoWithKey);
      expect(result.key).toBe('SPACE1');
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all workspaces with avatar field added', async () => {
      const workspaces = [buildWorkspace(), buildWorkspace()];
      repo.findAll.mockResolvedValue(workspaces);

      const result = await service.findAll();

      // withDefaultAvatar adds avatar field — use objectContaining
      expect(result).toHaveLength(2);
      result.forEach((ws, i) => {
        expect(ws).toEqual(
          expect.objectContaining({
            _id: workspaces[i]._id,
            name: workspaces[i].name,
            slug: workspaces[i].slug,
          }),
        );
        expect(ws.avatar).toBeDefined();
      });
      expect(repo.findAll).toHaveBeenCalledTimes(1);
    });
  });

  // ── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns workspace with avatar field when found', async () => {
      const workspace = buildWorkspace();
      repo.findById.mockResolvedValue(workspace);

      const result = await service.findById(WORKSPACE_ID);

      expect(result).toEqual(
        expect.objectContaining({
          _id: workspace._id,
          name: workspace.name,
          slug: workspace.slug,
        }),
      );
      expect(result.avatar).toBeDefined();
    });

    it('throws NotFoundException when workspace does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById(WORKSPACE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── findBySlug ─────────────────────────────────────────────────────────────

  describe('findBySlug', () => {
    it('returns workspace with avatar field when found', async () => {
      const workspace = buildWorkspace();
      repo.findBySlug.mockResolvedValue(workspace);

      const result = await service.findBySlug('test-workspace');

      expect(result).toEqual(
        expect.objectContaining({
          _id: workspace._id,
          name: workspace.name,
          slug: workspace.slug,
        }),
      );
      expect(result.avatar).toBeDefined();
    });

    it('throws NotFoundException for unknown slug', async () => {
      repo.findBySlug.mockResolvedValue(null);

      await expect(service.findBySlug('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── findByKey ──────────────────────────────────────────────────────────────

  describe('findByKey', () => {
    it('always throws BadRequestException with message about using workspaceId', async () => {
      await expect(service.findByKey('TESTWOR')).rejects.toThrow(
        new BadRequestException(
          'Workspace key lookup is not supported; use workspaceId',
        ),
      );
    });

    it('throws BadRequestException regardless of whether key exists', async () => {
      repo.findByKey.mockResolvedValue(null);

      await expect(service.findByKey('UNKNOWN')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── id-only lookup ────────────────────────────────────────────────────────

  describe('id-only lookup', () => {
    it('does not resolve public keys through workspace id lookup', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById('TESTWOR')).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.findById).toHaveBeenCalledWith('TESTWOR');
      expect(repo.findByKey).not.toHaveBeenCalled();
      expect((service as any).findByIdOrKey).toBeUndefined();
    });
  });

  // ── findByUserId ───────────────────────────────────────────────────────────

  describe('findByUserId', () => {
    it('returns workspaces with count fields for given user', async () => {
      const workspaces = [buildWorkspace()];
      repo.findByUserId.mockResolvedValue(workspaces);

      const result = await service.findByUserId(OWNER_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          _id: workspaces[0]._id,
          name: workspaces[0].name,
          taskCount: 0,
          tasksCount: 0,
          docsCount: 0,
        }),
      );
      expect(repo.findByUserId).toHaveBeenCalledWith(OWNER_ID);
    });

    it('sorts workspaces according to workspaceOrder and uses createdAt as tiebreaker', async () => {
      const ID_1 = new Types.ObjectId().toString();
      const ID_2 = new Types.ObjectId().toString();
      const ID_3 = new Types.ObjectId().toString();
      const ID_4 = new Types.ObjectId().toString();

      const ws1 = buildWorkspace({
        _id: new Types.ObjectId(ID_1),
        createdAt: new Date('2026-01-01'),
      });
      const ws2 = buildWorkspace({
        _id: new Types.ObjectId(ID_2),
        createdAt: new Date('2026-01-02'),
      });
      const ws3 = buildWorkspace({
        _id: new Types.ObjectId(ID_3),
        createdAt: new Date('2026-01-03'),
      });
      const ws4 = buildWorkspace({
        _id: new Types.ObjectId(ID_4),
        createdAt: new Date('2026-01-04'),
      });

      repo.findByUserId.mockResolvedValue([ws1, ws2, ws3, ws4]);
      usersService.getUserById.mockResolvedValue({
        _id: OWNER_ID,
        workspaceOrder: [ID_2, ID_1],
      });

      const result = await service.findByUserId(OWNER_ID);

      expect(result[0]._id.toString()).toBe(ID_2);
      expect(result[1]._id.toString()).toBe(ID_1);
      expect(result[2]._id.toString()).toBe(ID_4);
      expect(result[3]._id.toString()).toBe(ID_3);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates allowed fields and returns updated workspace with avatar', async () => {
      const workspace = buildWorkspace();
      repo.findById.mockResolvedValue(workspace);
      repo.findAnyByKey.mockResolvedValue(null);
      const updated = { ...workspace, name: 'Updated Name' };
      repo.update.mockResolvedValue(updated);

      const result = await service.update(WORKSPACE_ID, {
        name: 'Updated Name',
        description: 'new desc',
        settings: { theme: 'dark' },
        status: 'inactive',
        access: 'private',
      });

      expect(repo.update).toHaveBeenCalledWith(
        WORKSPACE_ID,
        expect.objectContaining({
          name: 'Updated Name',
          description: 'new desc',
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          name: 'Updated Name',
        }),
      );
      expect(result.avatar).toBeDefined();
    });

    it('throws NotFoundException when workspace is missing', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.update(WORKSPACE_ID, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('generates a new unique key when key field is provided in dto', async () => {
      const workspace = buildWorkspace();
      repo.findById.mockResolvedValue(workspace);
      repo.findAnyByKey.mockResolvedValue(null); // key is free
      repo.update.mockResolvedValue({ ...workspace, key: 'NEWKEY' });

      await service.update(WORKSPACE_ID, { key: 'newkey' });

      expect(repo.update).toHaveBeenCalledWith(
        WORKSPACE_ID,
        expect.objectContaining({ key: 'NEWKEY' }),
      );
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes boards, sprints, then workspace', async () => {
      repo.findById.mockResolvedValue(buildWorkspace());
      kanbanService.deleteByWorkspace.mockResolvedValue(undefined);
      scrumService.deleteByWorkspace.mockResolvedValue(undefined);
      repo.delete.mockResolvedValue(buildWorkspace());

      await service.delete(WORKSPACE_ID);

      expect(kanbanService.deleteByWorkspace).toHaveBeenCalledWith(
        WORKSPACE_ID,
      );
      expect(repo.delete).toHaveBeenCalledWith(WORKSPACE_ID);
      expect(usersService.updateUser).toHaveBeenCalledWith(OWNER_ID, {
        $pull: { workspaceOrder: WORKSPACE_ID },
      });
    });

    it('still attempts repo.delete even when cleanup throws', async () => {
      repo.findById.mockResolvedValue(buildWorkspace());
      kanbanService.deleteByWorkspace.mockRejectedValue(
        new Error('cleanup failed'),
      );
      scrumService.deleteByWorkspace.mockResolvedValue(undefined);
      repo.delete.mockResolvedValue(buildWorkspace());

      await service.delete(WORKSPACE_ID);

      expect(repo.delete).toHaveBeenCalledWith(WORKSPACE_ID);
    });

    it('throws NotFoundException when workspace not found in repo', async () => {
      repo.findById.mockResolvedValue(buildWorkspace());
      kanbanService.deleteByWorkspace.mockResolvedValue(undefined);
      scrumService.deleteByWorkspace.mockResolvedValue(undefined);
      repo.delete.mockResolvedValue(null);

      await expect(service.delete(WORKSPACE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException before cleanup when workspace does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.delete(WORKSPACE_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(kanbanService.deleteByWorkspace).not.toHaveBeenCalled();
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  // ── restore ────────────────────────────────────────────────────────────────

  describe('restore', () => {
    it('restores workspace and sprint data', async () => {
      const workspace = buildWorkspace();
      repo.restore.mockResolvedValue(workspace);
      scrumService.restoreByWorkspace.mockResolvedValue(undefined);

      const result = await service.restore(WORKSPACE_ID);

      expect(repo.restore).toHaveBeenCalledWith(WORKSPACE_ID);
      expect(scrumService.restoreByWorkspace).toHaveBeenCalledWith(
        WORKSPACE_ID,
      );
      expect(result).toEqual(
        expect.objectContaining({
          _id: workspace._id,
          name: workspace.name,
        }),
      );
      expect(result.avatar).toBeDefined();
    });

    it('throws NotFoundException when restore target is missing', async () => {
      repo.restore.mockResolvedValue(null);

      await expect(service.restore(WORKSPACE_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(scrumService.restoreByWorkspace).not.toHaveBeenCalled();
    });
  });
});
