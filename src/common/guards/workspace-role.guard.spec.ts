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
    expect(getPermissionsForWorkspaceRole(SPACE_ROLES.MEMBER)).toEqual(
      expect.arrayContaining([
        WORKSPACE_PERMISSIONS.TASK_CREATE,
        WORKSPACE_PERMISSIONS.TASK_EDIT,
        WORKSPACE_PERMISSIONS.TASK_DELETE,
        WORKSPACE_PERMISSIONS.TASK_MOVE,
        WORKSPACE_PERMISSIONS.SPRINT_MANAGE,
        WORKSPACE_PERMISSIONS.PAGE_CREATE,
        WORKSPACE_PERMISSIONS.PAGE_EDIT,
        WORKSPACE_PERMISSIONS.PAGE_DELETE,
      ]),
    );
    expect(getPermissionsForWorkspaceRole(SPACE_ROLES.VIEWER)).toEqual([]);
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
});
