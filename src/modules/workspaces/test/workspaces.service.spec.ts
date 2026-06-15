import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

import { SPACE_ROLES } from '@/common/constants/space-role.constants';
import { KanbanService } from '@/modules/kanban/services/kanban.service';
import { ScrumService } from '@/modules/scrum/services/scrum.service';
import { UsersService } from '@/modules/users/services/users.service';
import { WorkflowsService } from '@/modules/workflows/services/workflows.service';
import { WorkspacesRepository } from '@/modules/workspaces/repositories/workspaces.repository';
import { WorkspaceDomainEventPublisher } from '@/modules/workspaces/services/workspace-domain-event.publisher';
import { WorkspaceKeyService } from '@/modules/workspaces/services/workspace-key.service';
import { WorkspacesService } from '@/modules/workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '@/modules/workspaces/services/workspace-member.service';
import { Task } from '@/modules/tasks/schemas/task.schema';
import { Page } from '@/modules/pages/schemas/page.schema';
import { DocumentEntity } from '@/modules/documents/schemas/document.schema';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeId = () => new Types.ObjectId().toString();

const OWNER_ID = makeId();
const WORKSPACE_ID = makeId();
const MEMBER_USER_ID = makeId();

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
});

const mockWorkspaceKeyService = () => ({
  generateUniqueSlug: jest.fn(async (name: string) =>
    name.toLowerCase().replace(/\s+/g, '-'),
  ),
  generateUniqueKey: jest.fn(async (key: string) => key.toUpperCase()),
});

const mockWorkspaceMemberService = () => ({
  addMember: jest.fn(),
  removeMember: jest.fn(),
  updateMemberRole: jest.fn(),
  getMembers: jest.fn(),
  isMember: jest.fn(),
});

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let repo: ReturnType<typeof mockWorkspacesRepository>;
  let workflowsService: ReturnType<typeof mockWorkflowsService>;
  let kanbanService: ReturnType<typeof mockKanbanService>;
  let scrumService: ReturnType<typeof mockScrumService>;
  let usersService: ReturnType<typeof mockUsersService>;
  let workspaceMemberService: ReturnType<typeof mockWorkspaceMemberService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: WorkspacesRepository, useFactory: mockWorkspacesRepository },
        { provide: WorkflowsService, useFactory: mockWorkflowsService },
        { provide: KanbanService, useFactory: mockKanbanService },
        { provide: ScrumService, useFactory: mockScrumService },
        { provide: UsersService, useFactory: mockUsersService },
        {
          provide: WorkspaceMemberService,
          useFactory: mockWorkspaceMemberService,
        },
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
      ],
    }).compile();

    service = module.get(WorkspacesService);
    repo = module.get(WorkspacesRepository);
    workflowsService = module.get(WorkflowsService);
    kanbanService = module.get(KanbanService);
    scrumService = module.get(ScrumService);
    usersService = module.get(UsersService);
    workspaceMemberService = module.get(WorkspaceMemberService);
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
    it('returns all workspaces', async () => {
      const workspaces = [buildWorkspace(), buildWorkspace()];
      repo.findAll.mockResolvedValue(workspaces);

      const result = await service.findAll();

      expect(result).toEqual(workspaces);
      expect(repo.findAll).toHaveBeenCalledTimes(1);
    });
  });

  // ── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns workspace when found', async () => {
      const workspace = buildWorkspace();
      repo.findById.mockResolvedValue(workspace);

      const result = await service.findById(WORKSPACE_ID);

      expect(result).toEqual(workspace);
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
    it('returns workspace when found', async () => {
      const workspace = buildWorkspace();
      repo.findBySlug.mockResolvedValue(workspace);

      const result = await service.findBySlug('test-workspace');

      expect(result).toEqual(workspace);
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
    it('returns workspace when found', async () => {
      const workspace = buildWorkspace();
      repo.findByKey.mockResolvedValue(workspace);

      const result = await service.findByKey('TESTWOR');

      expect(result).toEqual(workspace);
    });

    it('throws NotFoundException for unknown key', async () => {
      repo.findByKey.mockResolvedValue(null);

      await expect(service.findByKey('UNKNOWN')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── findByUserId ───────────────────────────────────────────────────────────

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

  describe('findByUserId', () => {
    it('returns workspaces for given user', async () => {
      const workspaces = [buildWorkspace()];
      repo.findByUserId.mockResolvedValue(workspaces);

      const result = await service.findByUserId(OWNER_ID);

      expect(result).toEqual(workspaces);
      expect(repo.findByUserId).toHaveBeenCalledWith(OWNER_ID);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates allowed fields and returns updated workspace', async () => {
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
      expect(result).toEqual(updated);
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
      kanbanService.deleteByWorkspace.mockResolvedValue(undefined);
      scrumService.deleteByWorkspace.mockResolvedValue(undefined);
      repo.delete.mockResolvedValue(buildWorkspace());

      await service.delete(WORKSPACE_ID);

      expect(kanbanService.deleteByWorkspace).toHaveBeenCalledWith(
        WORKSPACE_ID,
      );
      expect(repo.delete).toHaveBeenCalledWith(WORKSPACE_ID);
    });

    it('still attempts repo.delete even when cleanup throws', async () => {
      kanbanService.deleteByWorkspace.mockRejectedValue(
        new Error('cleanup failed'),
      );
      scrumService.deleteByWorkspace.mockResolvedValue(undefined);
      repo.delete.mockResolvedValue(buildWorkspace());

      await service.delete(WORKSPACE_ID);

      expect(repo.delete).toHaveBeenCalledWith(WORKSPACE_ID);
    });

    it('throws NotFoundException when workspace not found in repo', async () => {
      kanbanService.deleteByWorkspace.mockResolvedValue(undefined);
      scrumService.deleteByWorkspace.mockResolvedValue(undefined);
      repo.delete.mockResolvedValue(null);

      await expect(service.delete(WORKSPACE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── addMember ──────────────────────────────────────────────────────────────

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
      expect(result).toEqual(workspace);
    });

    it('throws NotFoundException when restore target is missing', async () => {
      repo.restore.mockResolvedValue(null);

      await expect(service.restore(WORKSPACE_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(scrumService.restoreByWorkspace).not.toHaveBeenCalled();
    });
  });

  // ── addMember (moved to WorkspaceMemberService) ──────────────────────────

  describe('WorkspaceMemberService.addMember', () => {
    const email = 'newmember@example.com';
    const newUser = { _id: new Types.ObjectId(MEMBER_USER_ID), email };

    it('adds a new member successfully', async () => {
      const workspace = buildWorkspace();
      repo.findById.mockResolvedValue(workspace);
      usersService.findByEmail.mockResolvedValue(newUser);
      const updatedWorkspace = buildWorkspace({
        members: [
          ...workspace.members,
          { userId: newUser._id, role: SPACE_ROLES.MEMBER },
        ],
      });
      repo.addMember.mockResolvedValue(updatedWorkspace);

      const result = await workspaceMemberService.addMember(
        WORKSPACE_ID,
        email,
        SPACE_ROLES.MEMBER,
      );

      expect(repo.addMember).toHaveBeenCalledWith(
        WORKSPACE_ID,
        MEMBER_USER_ID,
        SPACE_ROLES.MEMBER,
      );
      expect(result).toEqual(updatedWorkspace);
    });

    it('throws NotFoundException when workspace not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        workspaceMemberService.addMember(
          WORKSPACE_ID,
          email,
          SPACE_ROLES.MEMBER,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when user email not found', async () => {
      repo.findById.mockResolvedValue(buildWorkspace());
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        workspaceMemberService.addMember(
          WORKSPACE_ID,
          email,
          SPACE_ROLES.MEMBER,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when user is already a member', async () => {
      const workspace = buildWorkspace({
        members: [
          {
            userId: new Types.ObjectId(MEMBER_USER_ID),
            role: SPACE_ROLES.MEMBER,
          },
        ],
      });
      repo.findById.mockResolvedValue(workspace);
      usersService.findByEmail.mockResolvedValue(newUser);

      await expect(
        workspaceMemberService.addMember(
          WORKSPACE_ID,
          email,
          SPACE_ROLES.MEMBER,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── removeMember ───────────────────────────────────────────────────────────

  // ── removeMember (moved to WorkspaceMemberService) ────────────────────────

  describe('WorkspaceMemberService.removeMember', () => {
    it('removes a regular member successfully', async () => {
      const workspace = buildWorkspace({
        members: [
          {
            userId: new Types.ObjectId(OWNER_ID),
            role: SPACE_ROLES.WORKSPACE_ADMIN,
          },
          {
            userId: new Types.ObjectId(MEMBER_USER_ID),
            role: SPACE_ROLES.MEMBER,
          },
        ],
      });
      repo.findById.mockResolvedValue(workspace);
      repo.removeMember.mockResolvedValue({ ...workspace });

      await workspaceMemberService.removeMember(WORKSPACE_ID, MEMBER_USER_ID);

      expect(repo.removeMember).toHaveBeenCalledWith(
        WORKSPACE_ID,
        MEMBER_USER_ID,
      );
    });

    it('throws NotFoundException when workspace not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        workspaceMemberService.removeMember(WORKSPACE_ID, MEMBER_USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when user is not a member', async () => {
      repo.findById.mockResolvedValue(buildWorkspace());

      await expect(
        workspaceMemberService.removeMember(WORKSPACE_ID, MEMBER_USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when trying to remove the owner', async () => {
      const workspace = buildWorkspace({
        members: [
          {
            userId: new Types.ObjectId(OWNER_ID),
            role: SPACE_ROLES.WORKSPACE_ADMIN,
          },
        ],
      });
      repo.findById.mockResolvedValue(workspace);

      await expect(
        workspaceMemberService.removeMember(WORKSPACE_ID, OWNER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── updateMemberRole ───────────────────────────────────────────────────────

  // ── updateMemberRole (moved to WorkspaceMemberService) ────────────────────

  describe('WorkspaceMemberService.updateMemberRole', () => {
    it('updates the role of a regular member', async () => {
      const workspace = buildWorkspace({
        members: [
          {
            userId: new Types.ObjectId(OWNER_ID),
            role: SPACE_ROLES.WORKSPACE_ADMIN,
          },
          {
            userId: new Types.ObjectId(MEMBER_USER_ID),
            role: SPACE_ROLES.MEMBER,
          },
        ],
      });
      repo.findById.mockResolvedValue(workspace);
      repo.updateMemberRole.mockResolvedValue(workspace);

      await workspaceMemberService.updateMemberRole(
        WORKSPACE_ID,
        MEMBER_USER_ID,
        SPACE_ROLES.WORKSPACE_ADMIN,
      );

      expect(repo.updateMemberRole).toHaveBeenCalledWith(
        WORKSPACE_ID,
        MEMBER_USER_ID,
        SPACE_ROLES.WORKSPACE_ADMIN,
      );
    });

    it('throws NotFoundException when workspace not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        workspaceMemberService.updateMemberRole(
          WORKSPACE_ID,
          MEMBER_USER_ID,
          SPACE_ROLES.MEMBER,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when user is not a member', async () => {
      repo.findById.mockResolvedValue(buildWorkspace());

      await expect(
        workspaceMemberService.updateMemberRole(
          WORKSPACE_ID,
          MEMBER_USER_ID,
          SPACE_ROLES.MEMBER,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when trying to change the owner role', async () => {
      const workspace = buildWorkspace({
        members: [
          {
            userId: new Types.ObjectId(OWNER_ID),
            role: SPACE_ROLES.WORKSPACE_ADMIN,
          },
        ],
      });
      repo.findById.mockResolvedValue(workspace);

      await expect(
        workspaceMemberService.updateMemberRole(
          WORKSPACE_ID,
          OWNER_ID,
          SPACE_ROLES.MEMBER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── getMembers ─────────────────────────────────────────────────────────────

  // ── getMembers (moved to WorkspaceMemberService) ──────────────────────────

  describe('WorkspaceMemberService.getMembers', () => {
    it('returns the members array of the workspace', async () => {
      const workspace = buildWorkspace();
      repo.findByIdWithMembers.mockResolvedValue(workspace);

      const result = await workspaceMemberService.getMembers(WORKSPACE_ID);

      expect(result).toEqual(workspace.members);
    });

    it('throws NotFoundException when workspace not found', async () => {
      repo.findByIdWithMembers.mockResolvedValue(null);

      await expect(
        workspaceMemberService.getMembers(WORKSPACE_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── generateUniqueSlug (via create) ───────────────────────────────────────

  describe('slug uniqueness via create', () => {
    it('appends counter suffix when slug collides', async () => {
      const dto = { name: 'My WS' };
      // 'my-ws' is taken, 'my-ws-1' is free
      repo.findAnyBySlug
        .mockResolvedValueOnce(buildWorkspace({ slug: 'my-ws' })) // slug check in create
        // Note: because slug is already taken during the explicit check, BadRequestException is thrown.
        // To test slug generation we rely on the auto-generation path (no dto.slug provided):
        .mockResolvedValueOnce(null);
      repo.findAnyByKey.mockResolvedValue(null);
      repo.create.mockResolvedValue(buildWorkspace({ slug: 'my-ws' }));
      kanbanService.createDefaultBoard.mockResolvedValue(undefined);
      workflowsService.createDefaultWorkflow.mockResolvedValue(undefined);

      // When dto has no explicit slug, findBySlug is called inside generateUniqueSlug
      // then again to validate. We simulate: first slug attempt free → valid.
      repo.findAnyBySlug.mockReset();
      repo.findAnyBySlug
        .mockResolvedValueOnce(buildWorkspace()) // 'my-ws' taken inside generateUniqueSlug
        .mockResolvedValueOnce(null) // 'my-ws-1' free inside generateUniqueSlug
        .mockResolvedValueOnce(null); // explicit slug check passes

      await service.create(OWNER_ID, dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'my-ws-1' }),
      );
    });
  });
});
