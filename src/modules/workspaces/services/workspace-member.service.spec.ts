import { Types } from 'mongoose';

import { WorkspaceMemberService } from './workspace-member.service';
import { WorkspaceMembershipDualWriteService } from './workspace-membership-dual-write.service';

const makeService = (mode: string, membership?: any) => {
  const workspaceId = new Types.ObjectId();
  const organizationId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const audit = { log: jest.fn() };
  const memberships = {
    findOne: jest.fn(() => ({
      lean: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(membership) })),
    })),
    updateOne: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
  };
  const config = { get: jest.fn(() => mode) };
  const dualWrite = new WorkspaceMembershipDualWriteService(
    config as any,
    {} as any,
    {} as any,
    {} as any,
    memberships as any,
    {} as any,
    audit as any,
  );
  const workspace = {
    _id: workspaceId,
    organizationId,
    members: [{ userId, role: 'member' }],
  };
  const repository = { findById: jest.fn().mockResolvedValue(workspace) };
  const service = new WorkspaceMemberService(
    repository as any,
    {} as any,
    { emit: jest.fn() } as any,
    dualWrite,
  );

  return { service, workspaceId, organizationId, userId, audit, memberships };
};

describe('WorkspaceMemberService.getMemberRole shadow-read integration', () => {
  it('legacy mode returns the legacy role without querying WorkspaceMembership', async () => {
    const h = makeService('legacy');

    await expect(
      h.service.getMemberRole(h.workspaceId.toString(), h.userId.toString()),
    ).resolves.toBe('member');

    expect(h.memberships.findOne).not.toHaveBeenCalled();
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('matching shadow role returns legacy role without divergence', async () => {
    const h = makeService('shadow_read', {
      role: 'member',
      status: 'active',
    });

    await expect(
      h.service.getMemberRole(h.workspaceId.toString(), h.userId.toString()),
    ).resolves.toBe('member');

    expect(h.memberships.findOne).toHaveBeenCalledTimes(1);
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('different shadow role returns legacy role and emits one divergence', async () => {
    const h = makeService('shadow_read', {
      role: 'viewer',
      status: 'active',
    });

    await expect(
      h.service.getMemberRole(h.workspaceId.toString(), h.userId.toString()),
    ).resolves.toBe('member');

    expect(h.audit.log).toHaveBeenCalledTimes(1);
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'workspace.membership.divergence',
        metadata: expect.objectContaining({
          legacyRole: 'member',
          newRole: 'viewer',
        }),
      }),
    );
  });

  it('missing new membership returns legacy role and emits divergence', async () => {
    const h = makeService('shadow_read', null);

    await expect(
      h.service.getMemberRole(h.workspaceId.toString(), h.userId.toString()),
    ).resolves.toBe('member');

    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'workspace.membership.divergence',
        metadata: expect.objectContaining({
          legacyRole: 'member',
          newRole: null,
        }),
      }),
    );
  });

  it('new-model query failure returns legacy role and emits a shadow failure event', async () => {
    const h = makeService('shadow_read', { role: 'member', status: 'active' });
    h.memberships.findOne.mockReturnValue({
      lean: jest.fn(() => ({
        exec: jest.fn().mockRejectedValue(new Error('query timeout')),
      })),
    });

    await expect(
      h.service.getMemberRole(h.workspaceId.toString(), h.userId.toString()),
    ).resolves.toBe('member');

    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'workspace.membership.shadow_error',
      }),
    );
    expect(h.audit.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'workspace.membership.divergence' }),
    );
  });

  it('does not auto-heal either model when shadow roles diverge', async () => {
    const h = makeService('shadow_read', {
      role: 'viewer',
      status: 'active',
    });

    await h.service.getMemberRole(
      h.workspaceId.toString(),
      h.userId.toString(),
    );

    expect(h.memberships.updateOne).not.toHaveBeenCalled();
    expect(h.memberships.create).not.toHaveBeenCalled();
    expect(h.memberships.deleteOne).not.toHaveBeenCalled();
  });

  it('logs only the redacted divergence metadata needed for diagnosis', async () => {
    const h = makeService('shadow_read', {
      role: 'viewer',
      status: 'active',
      password: 'must-not-log',
      token: 'must-not-log',
    });

    await h.service.getMemberRole(
      h.workspaceId.toString(),
      h.userId.toString(),
    );

    const event = h.audit.log.mock.calls[0][0];
    expect(event.metadata).toEqual({
      workspaceId: h.workspaceId.toString(),
      userId: h.userId.toString(),
      organizationId: h.organizationId.toString(),
      legacyRole: 'member',
      newRole: 'viewer',
      mode: 'shadow_read',
    });
    expect(event.metadata).not.toHaveProperty('password');
    expect(event.metadata).not.toHaveProperty('token');
    expect(event.metadata).not.toHaveProperty('membership');
  });
});
