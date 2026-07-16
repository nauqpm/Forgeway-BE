import { SPACE_ROLES } from '../../common/constants/space-role.constants';
import { WORKSPACE_PERMISSIONS } from '../../common/constants/workspace-permissions.constants';
import { parseAuthorizationMode, PERMISSIONS } from './authorization.constants';
import { AuthorizationResolverService } from './authorization-resolver.service';
import { LegacyAuthorizationAdapterService } from './legacy-authorization-adapter.service';

const workspace = {
  ownerId: { toString: () => 'owner-1' },
  members: [
    { userId: { toString: () => 'member-1' }, role: SPACE_ROLES.MEMBER },
    { userId: { toString: () => 'viewer-1' }, role: SPACE_ROLES.VIEWER },
  ],
};

describe('authorization workspace compatibility', () => {
  const workspaceModel = { findById: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    workspaceModel.findById.mockReturnValue({ lean: () => workspace });
  });

  it('keeps catalog permission strings unique and legacy workspace constants compatible', () => {
    const permissions = Object.values(PERMISSIONS);
    expect(new Set(permissions).size).toBe(permissions.length);
    expect(WORKSPACE_PERMISSIONS.TASK_VIEW).toBe(PERMISSIONS.TASK_VIEW);
    expect(WORKSPACE_PERMISSIONS.PAGE_EDIT).toBe(PERMISSIONS.PAGE_EDIT);
    expect(parseAuthorizationMode('invalid')).toBe('legacy');
  });

  it('maps the legacy viewer page grant without changing it', async () => {
    const adapter = new LegacyAuthorizationAdapterService(
      workspaceModel as never,
    );

    await expect(
      adapter.authorize({
        userId: 'viewer-1',
        permission: PERMISSIONS.PAGE_VIEW,
        resource: { type: 'workspace', id: 'workspace-1' },
      }),
    ).resolves.toMatchObject({ allowed: true, source: 'legacy' });
  });

  it.each([
    ['owner-1', PERMISSIONS.WORKSPACE_UPDATE],
    ['member-1', PERMISSIONS.TASK_EDIT],
  ])('maps legacy role permissions for %s', async (userId, permission) => {
    const adapter = new LegacyAuthorizationAdapterService(
      workspaceModel as never,
    );

    await expect(
      adapter.authorize({
        userId,
        permission,
        resource: { type: 'workspace', id: 'workspace-1' },
      }),
    ).resolves.toMatchObject({ allowed: true, source: 'legacy' });
  });

  it('preserves the legacy super-admin workspace bypass', async () => {
    const adapter = new LegacyAuthorizationAdapterService(
      workspaceModel as never,
    );

    await expect(
      adapter.authorize({
        userId: 'admin-1',
        globalRole: 'super_admin',
        permission: PERMISSIONS.WORKSPACE_UPDATE,
        resource: { type: 'workspace', id: 'workspace-1' },
      }),
    ).resolves.toMatchObject({ allowed: true, source: 'legacy' });
  });

  it('returns not applicable instead of allowing unsupported legacy resources', async () => {
    const adapter = new LegacyAuthorizationAdapterService(
      workspaceModel as never,
    );

    await expect(
      adapter.authorize({
        userId: 'viewer-1',
        permission: PERMISSIONS.MESSAGE_SEND,
        resource: { type: 'channel', id: 'channel-1' },
      }),
    ).resolves.toMatchObject({
      decision: 'not_applicable',
      allowed: false,
      reasonCode: 'LEGACY_ADAPTER_UNSUPPORTED_RESOURCE',
    });
  });

  it('denies an unsupported resource in the new resolver', async () => {
    const resolver = new AuthorizationResolverService(workspaceModel as never);

    await expect(
      resolver.authorize({
        userId: 'viewer-1',
        permission: PERMISSIONS.MESSAGE_SEND,
        resource: { type: 'channel', id: 'channel-1' },
      }),
    ).resolves.toMatchObject({
      decision: 'deny',
      allowed: false,
      reasonCode: 'DENY_RESOURCE_UNSUPPORTED',
    });
  });

  it('denies a workspace permission missing from the effective role', async () => {
    const resolver = new AuthorizationResolverService(workspaceModel as never);

    await expect(
      resolver.authorize({
        userId: 'viewer-1',
        permission: PERMISSIONS.TASK_EDIT,
        resource: { type: 'workspace', id: 'workspace-1' },
      }),
    ).resolves.toMatchObject({
      decision: 'deny',
      reasonCode: 'DENY_PERMISSION_MISSING',
    });
  });
});
