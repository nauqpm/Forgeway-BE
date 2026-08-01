import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { SPACE_ROLES } from '../constants/space-role.constants';
import {
  WORKSPACE_PERMISSIONS,
  getPermissionsForWorkspaceRole,
} from '../constants/workspace-permissions.constants';
import { WorkspaceRoleGuard } from './workspace-role.guard';

const workspaceId = new Types.ObjectId();
const ownerId = new Types.ObjectId();
const memberId = new Types.ObjectId();
const viewerId = new Types.ObjectId();

const makeContext = (request: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  }) as unknown as ExecutionContext;

describe('workspace permissions', () => {
  it('maps workspace roles to granular permissions', () => {
    const memberPermissions = getPermissionsForWorkspaceRole(
      SPACE_ROLES.MEMBER,
    );

    expect(memberPermissions).toEqual(
      expect.arrayContaining([
        WORKSPACE_PERMISSIONS.STORY_CREATE,
        WORKSPACE_PERMISSIONS.STORY_READ,
        WORKSPACE_PERMISSIONS.STORY_CREATE_DRAFT,
        WORKSPACE_PERMISSIONS.STORY_EDIT_DRAFT,
        WORKSPACE_PERMISSIONS.STORY_SUBMIT,
        WORKSPACE_PERMISSIONS.STORY_COMPARE_VERSIONS,
        WORKSPACE_PERMISSIONS.STORY_READ_IMPACT,
        WORKSPACE_PERMISSIONS.STORY_RESOLVE_IMPACT,
        WORKSPACE_PERMISSIONS.DECISION_PROPOSE,
        WORKSPACE_PERMISSIONS.CRITERION_SUBMIT_VERIFICATION,
      ]),
    );
    for (const permission of [
      WORKSPACE_PERMISSIONS.STORY_ARCHIVE,
      WORKSPACE_PERMISSIONS.STORY_APPROVE,
      WORKSPACE_PERMISSIONS.STORY_SUPERSEDE,
      WORKSPACE_PERMISSIONS.DECISION_APPROVE,
    ]) {
      expect(memberPermissions).not.toContain(permission);
    }
    expect(getPermissionsForWorkspaceRole(SPACE_ROLES.WORKSPACE_ADMIN)).toEqual(
      Object.values(WORKSPACE_PERMISSIONS),
    );
    expect(getPermissionsForWorkspaceRole(SPACE_ROLES.VIEWER)).toEqual(
      expect.arrayContaining([
        WORKSPACE_PERMISSIONS.STORY_READ,
        WORKSPACE_PERMISSIONS.STORY_COMPARE_VERSIONS,
        WORKSPACE_PERMISSIONS.STORY_READ_IMPACT,
      ]),
    );
  });
});

describe('WorkspaceRoleGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as jest.Mocked<Reflector>;

  const workspacesService = {
    findByKey: jest.fn(),
    findById: jest.fn(),
  };

  const pagesService = {
    findById: jest.fn(),
  };

  const moduleRef = {
    get: jest.fn(token => {
      if (token?.name === 'WorkspacesService') return workspacesService;
      if (token?.name === 'PagesService') return pagesService;
      return undefined;
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue([
      WORKSPACE_PERMISSIONS.TASK_MOVE,
    ]);
    workspacesService.findByKey.mockResolvedValue({
      _id: workspaceId,
      ownerId,
      members: [
        { userId: memberId, role: SPACE_ROLES.MEMBER },
        { userId: viewerId, role: SPACE_ROLES.VIEWER },
      ],
    });
    workspacesService.findById.mockResolvedValue({
      _id: workspaceId,
      ownerId,
      members: [
        { userId: memberId, role: SPACE_ROLES.MEMBER },
        { userId: viewerId, role: SPACE_ROLES.VIEWER },
      ],
    });
  });

  it('allows a workspace member when their role grants every required permission', async () => {
    const guard = new WorkspaceRoleGuard(reflector, moduleRef as any);
    const request = {
      params: { workspaceId: workspaceId.toString() },
      user: { userId: memberId.toString(), role: 'user' },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect((request as any).workspaceAuth.permissions).toContain(
      WORKSPACE_PERMISSIONS.TASK_MOVE,
    );
  });

  it('rejects key strings passed to id-only workspaceId params', async () => {
    const guard = new WorkspaceRoleGuard(reflector, moduleRef as any);
    const request = {
      params: { workspaceId: 'ALTASK' },
      user: { userId: memberId.toString(), role: 'user' },
    };

    await expect(
      guard.canActivate(makeContext(request)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(workspacesService.findByKey).not.toHaveBeenCalled();
    expect(workspacesService.findById).not.toHaveBeenCalled();
  });

  it('rejects a viewer when the role does not grant the required permission', async () => {
    const guard = new WorkspaceRoleGuard(reflector, moduleRef as any);
    const request = {
      params: { workspaceId: workspaceId.toString() },
      user: { userId: viewerId.toString(), role: 'user' },
    };

    await expect(
      guard.canActivate(makeContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a viewer to read stories', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      WORKSPACE_PERMISSIONS.STORY_READ,
    ]);
    const guard = new WorkspaceRoleGuard(reflector, moduleRef as any);
    const request = {
      params: { workspaceId: workspaceId.toString() },
      user: { userId: viewerId.toString(), role: 'user' },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
  });

  it('rejects a viewer who creates stories', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      WORKSPACE_PERMISSIONS.STORY_CREATE,
    ]);
    const guard = new WorkspaceRoleGuard(reflector, moduleRef as any);
    const request = {
      params: { workspaceId: workspaceId.toString() },
      user: { userId: viewerId.toString(), role: 'user' },
    };

    await expect(
      guard.canActivate(makeContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves page routes through the page workspaceId when no workspace param exists', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      WORKSPACE_PERMISSIONS.PAGE_EDIT,
    ]);
    pagesService.findById.mockResolvedValue({ workspaceId });

    const guard = new WorkspaceRoleGuard(reflector, moduleRef as any);
    const request = {
      params: { id: new Types.ObjectId().toString() },
      user: { userId: memberId.toString(), role: 'user' },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(pagesService.findById).toHaveBeenCalledWith(request.params.id);
  });

  it('resolves workspaceId from query for list routes', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      WORKSPACE_PERMISSIONS.PAGE_VIEW,
    ]);

    const guard = new WorkspaceRoleGuard(reflector, moduleRef as any);
    const request = {
      query: { workspaceId: workspaceId.toString() },
      user: { userId: viewerId.toString(), role: 'user' },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect((request as any).workspaceAuth.workspaceId).toBe(
      workspaceId.toString(),
    );
  });

  it('resolves workspaceId from query for import routes', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      WORKSPACE_PERMISSIONS.PAGE_EDIT,
    ]);

    const guard = new WorkspaceRoleGuard(reflector, moduleRef as any);
    const request = {
      query: { workspaceId: workspaceId.toString() },
      user: { userId: memberId.toString(), role: 'user' },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect((request as any).workspaceAuth.workspaceId).toBe(
      workspaceId.toString(),
    );
  });
});
