import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { WorkspaceMembershipDualWriteService } from './workspace-membership-dual-write.service';
import { SPACE_ROLES } from '@/common/constants/space-role.constants';

const id = () => new Types.ObjectId();
const query = (value: unknown) => ({
  session: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
});

type AtomicState = {
  workspace: any | null;
  membership: any | null;
};

const copyState = (state: AtomicState): AtomicState => ({
  workspace: state.workspace
    ? {
        ...state.workspace,
        members: state.workspace.members.map((member: any) => ({
          ...member,
          userId: new Types.ObjectId(member.userId),
        })),
      }
    : null,
  membership: state.membership ? { ...state.membership } : null,
});

const atomicHarness = () => {
  const workspaceId = id();
  const organizationId = id();
  const ownerId = id();
  const memberId = id();
  const membershipId = id();
  const state: AtomicState = { workspace: null, membership: null };
  const failures = {
    workspaceSave: false,
    embeddedWrite: false,
    membershipWrite: false,
  };
  let transactionSnapshot: AtomicState = copyState(state);
  const session: any = {
    startTransaction: jest.fn(() => {
      transactionSnapshot = copyState(state);
    }),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn(() => {
      state.workspace = copyState(transactionSnapshot).workspace;
      state.membership = copyState(transactionSnapshot).membership;
    }),
    endSession: jest.fn().mockResolvedValue(undefined),
    inTransaction: jest.fn().mockReturnValue(true),
  };
  const organizationMemberships: any = {
    findOne: jest.fn(() => query({ membershipType: 'employee' })),
  };
  const memberships: any = {
    create: jest.fn(),
    findOne: jest.fn(() => query(state.membership)),
    findOneAndUpdate: jest.fn((_filter: any, update: any) => ({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn(async () => {
        if (failures.membershipWrite) throw new Error('membership failed');
        const isInsert = !state.membership;
        state.membership = {
          ...(state.membership ?? {}),
          ...(isInsert ? { _id: membershipId, ...update.$setOnInsert } : {}),
          ...(update.$set ?? {}),
        };
        return state.membership;
      }),
    })),
  };
  const workspaceDocument = (data: any) => {
    const document: any = { ...data, _id: workspaceId };
    document.save = jest.fn(async () => {
      if (failures.workspaceSave) throw new Error('workspace failed');
      state.workspace = {
        ...document,
        members: document.members.map((member: any) => ({ ...member })),
      };
      return state.workspace;
    });
    return document;
  };
  const workspaces: any = Object.assign(
    jest.fn().mockImplementation(workspaceDocument),
    {
      findOne: jest.fn(() => query(state.workspace)),
      updateOne: jest.fn((_filter: any, update: any) => ({
        exec: jest.fn(async () => {
          if (failures.embeddedWrite) throw new Error('embedded failed');
          if (update.$pull && state.workspace) {
            state.workspace.members = state.workspace.members.filter(
              (member: any) =>
                !member.userId.equals(update.$pull.members.userId),
            );
          }
        }),
      })),
      findByIdAndUpdate: jest.fn((_id: any, update: any) => ({
        exec: jest.fn(async () => {
          if (failures.embeddedWrite) throw new Error('embedded failed');
          if (state.workspace && update.$pull?.members) {
            state.workspace.members = state.workspace.members.filter(
              (member: any) =>
                !member.userId.equals(update.$pull.members.userId),
            );
          }
          if (state.workspace && update.$addToSet?.members) {
            const member = update.$addToSet.members;
            if (
              !state.workspace.members.some((existing: any) =>
                existing.userId.equals(member.userId),
              )
            ) {
              state.workspace.members.push({ ...member });
            }
          }
          return state.workspace;
        }),
      })),
    },
  );
  const audit = { log: jest.fn() };
  const legacy = {
    addMember: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ _id: workspaceId }),
    updateMemberRole: jest.fn().mockResolvedValue(null),
    removeMember: jest.fn().mockResolvedValue(null),
  };
  const config = { get: jest.fn().mockReturnValue('dual_write') };
  const connection = { startSession: jest.fn().mockResolvedValue(session) };
  const service = new WorkspaceMembershipDualWriteService(
    config as unknown as ConfigService,
    legacy as any,
    connection as any,
    workspaces,
    memberships,
    organizationMemberships,
    audit as any,
  );

  state.workspace = {
    _id: workspaceId,
    ownerId,
    organizationId,
    members: [],
  };

  return {
    service,
    state,
    failures,
    session,
    workspaces,
    memberships,
    organizationMemberships,
    audit,
    legacy,
    config,
    connection,
    workspaceId,
    organizationId,
    ownerId,
    memberId,
    membershipId,
  };
};

describe('WorkspaceMembershipDualWriteService', () => {
  const workspaceId = id();
  const organizationId = id();
  const ownerId = id();
  let config: Pick<ConfigService, 'get'>;
  let session: any;
  let connection: any;
  let workspaces: any;
  let memberships: any;
  let organizationMemberships: any;
  let audit: any;
  let service: WorkspaceMembershipDualWriteService;

  beforeEach(() => {
    config = { get: jest.fn().mockReturnValue('dual_write') };
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      abortTransaction: jest.fn().mockResolvedValue(undefined),
      endSession: jest.fn().mockResolvedValue(undefined),
      inTransaction: jest.fn().mockReturnValue(true),
    };
    connection = { startSession: jest.fn().mockResolvedValue(session) };
    workspaces = {
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      updateOne: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }),
    };
    memberships = { findOne: jest.fn(), findOneAndUpdate: jest.fn() };
    organizationMemberships = { findOne: jest.fn() };
    audit = { log: jest.fn() };
    service = new WorkspaceMembershipDualWriteService(
      config as ConfigService,
      { addMember: jest.fn(), create: jest.fn() } as any,
      connection,
      workspaces,
      memberships,
      organizationMemberships,
      audit,
    );
  });

  it('rolls back an embedded member write when the membership write fails', async () => {
    const workspace = { _id: workspaceId, ownerId, organizationId };
    workspaces.findOne.mockReturnValue(query(workspace));
    organizationMemberships.findOne.mockReturnValue(
      query({ membershipType: 'employee' }),
    );
    memberships.findOne.mockReturnValue(query(null));
    workspaces.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(workspace),
    });
    memberships.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockRejectedValue(new Error('membership failed')),
    });

    await expect(
      service.addMember({
        workspaceId: workspaceId.toString(),
        userId: id().toString(),
        role: SPACE_ROLES.MEMBER,
      }),
    ).rejects.toThrow('membership failed');

    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('fails closed when transactions are unavailable', async () => {
    connection.startSession.mockRejectedValue(
      new Error('replica set unavailable'),
    );

    await expect(
      service.addMember({
        workspaceId: workspaceId.toString(),
        userId: id().toString(),
        role: SPACE_ROLES.MEMBER,
      }),
    ).rejects.toThrow('DUAL_WRITE_TRANSACTION_UNAVAILABLE');

    expect(workspaces.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('returns the legacy role and emits divergence only in shadow mode', async () => {
    (config.get as jest.Mock).mockReturnValue('shadow_read');
    const userId = id().toString();
    memberships.findOne.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      exec: jest
        .fn()
        .mockResolvedValue({ role: SPACE_ROLES.VIEWER, status: 'active' }),
    });

    await service.shadowCompare(
      { _id: workspaceId, organizationId } as any,
      userId,
      SPACE_ROLES.MEMBER,
    );

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'workspace.membership.divergence',
        metadata: expect.objectContaining({
          workspaceId: workspaceId.toString(),
          userId,
          legacyRole: SPACE_ROLES.MEMBER,
          newRole: SPACE_ROLES.VIEWER,
        }),
      }),
    );
  });

  it('does not query WorkspaceMembership in legacy mode', async () => {
    (config.get as jest.Mock).mockReturnValue('legacy');

    await service.shadowCompare(
      { _id: workspaceId, organizationId } as any,
      id().toString(),
      SPACE_ROLES.MEMBER,
    );

    expect(memberships.findOne).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('commits workspace creation and owner membership in one transaction', async () => {
    const h = atomicHarness();
    h.state.workspace = null;

    await h.service.createWorkspace({
      _id: h.workspaceId,
      organizationId: h.organizationId,
      ownerId: h.ownerId,
      members: [],
    });

    expect(h.session.commitTransaction).toHaveBeenCalledTimes(1);
    expect(h.session.abortTransaction).not.toHaveBeenCalled();
    expect(h.state.workspace).not.toBeNull();
    expect(h.state.membership).toEqual(
      expect.objectContaining({
        organizationId: h.organizationId,
        role: SPACE_ROLES.WORKSPACE_ADMIN,
        status: 'active',
      }),
    );
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'workspace.membership.owner_synced',
      }),
    );
    expect(h.memberships.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ session: h.session }),
    );
  });

  it('rolls back workspace creation when owner membership write fails', async () => {
    const h = atomicHarness();
    h.state.workspace = null;
    h.failures.membershipWrite = true;

    await expect(
      h.service.createWorkspace({
        organizationId: h.organizationId,
        ownerId: h.ownerId,
        members: [],
      }),
    ).rejects.toThrow('membership failed');

    expect(h.session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(h.state.workspace).toBeNull();
    expect(h.state.membership).toBeNull();
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('does not create owner membership when workspace creation fails first', async () => {
    const h = atomicHarness();
    h.state.workspace = null;
    h.failures.workspaceSave = true;

    await expect(
      h.service.createWorkspace({
        organizationId: h.organizationId,
        ownerId: h.ownerId,
        members: [],
      }),
    ).rejects.toThrow('workspace failed');

    expect(h.session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(h.memberships.findOneAndUpdate).not.toHaveBeenCalled();
    expect(h.state.workspace).toBeNull();
    expect(h.state.membership).toBeNull();
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('rolls back WorkspaceMembership when the embedded member write fails', async () => {
    const h = atomicHarness();
    h.failures.embeddedWrite = true;

    await expect(
      h.service.addMember({
        workspaceId: h.workspaceId.toString(),
        userId: h.memberId.toString(),
        role: SPACE_ROLES.MEMBER,
      }),
    ).rejects.toThrow('embedded failed');

    expect(h.session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(h.state.workspace?.members).toEqual([]);
    expect(h.state.membership).toBeNull();
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('rolls back embedded Workspace.members when the membership write fails', async () => {
    const h = atomicHarness();
    h.failures.membershipWrite = true;

    await expect(
      h.service.addMember({
        workspaceId: h.workspaceId.toString(),
        userId: h.memberId.toString(),
        role: SPACE_ROLES.MEMBER,
      }),
    ).rejects.toThrow('membership failed');

    expect(h.session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(h.state.workspace?.members).toEqual([]);
    expect(h.state.membership).toBeNull();
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('fails closed without falling back when the transaction session is unavailable', async () => {
    const h = atomicHarness();
    h.connection.startSession.mockResolvedValue(null);

    await expect(
      h.service.addMember({
        workspaceId: h.workspaceId.toString(),
        userId: h.memberId.toString(),
        role: SPACE_ROLES.MEMBER,
      }),
    ).rejects.toThrow();

    expect(h.legacy.addMember).not.toHaveBeenCalled();
    expect(h.workspaces.updateOne).not.toHaveBeenCalled();
    expect(h.workspaces.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(h.memberships.findOneAndUpdate).not.toHaveBeenCalled();
    expect(h.state.workspace?.members).toEqual([]);
    expect(h.state.membership).toBeNull();
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('does not call WorkspaceMembership in legacy mode for every mutation entrypoint', async () => {
    const h = atomicHarness();
    h.config.get.mockReturnValue('legacy');

    await h.service.addMember({
      workspaceId: h.workspaceId.toString(),
      userId: h.memberId.toString(),
      role: SPACE_ROLES.MEMBER,
    });
    await h.service.changeRole(
      h.workspaceId.toString(),
      h.memberId.toString(),
      SPACE_ROLES.VIEWER,
    );
    await h.service.removeMember(
      h.workspaceId.toString(),
      h.memberId.toString(),
    );
    await h.service.removeMember(
      h.workspaceId.toString(),
      h.memberId.toString(),
      'left',
    );
    await h.service.inviteMember({
      workspaceId: h.workspaceId.toString(),
      userId: h.memberId.toString(),
      role: SPACE_ROLES.MEMBER,
    });
    await h.service.activateInvite({
      workspaceId: h.workspaceId.toString(),
      userId: h.memberId.toString(),
      role: SPACE_ROLES.MEMBER,
    });
    await h.service.syncOwnerMembership(h.workspaceId.toString());
    await h.service.createWorkspace({
      organizationId: h.organizationId,
      ownerId: h.ownerId,
      members: [],
    });

    expect(h.connection.startSession).not.toHaveBeenCalled();
    expect(h.workspaces.findOne).not.toHaveBeenCalled();
    expect(h.workspaces.updateOne).not.toHaveBeenCalled();
    expect(h.workspaces.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(h.memberships.findOne).not.toHaveBeenCalled();
    expect(h.memberships.findOneAndUpdate).not.toHaveBeenCalled();
    expect(h.organizationMemberships.findOne).not.toHaveBeenCalled();
    expect(h.legacy.addMember).toHaveBeenCalledTimes(2);
    expect(h.legacy.updateMemberRole).toHaveBeenCalledTimes(1);
    expect(h.legacy.removeMember).toHaveBeenCalledTimes(2);
    expect(h.legacy.create).toHaveBeenCalledTimes(1);
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('does not emit a success audit event when the transaction rolls back', async () => {
    const h = atomicHarness();
    h.state.workspace = null;
    h.failures.membershipWrite = true;

    await expect(
      h.service.createWorkspace({
        organizationId: h.organizationId,
        ownerId: h.ownerId,
        members: [],
      }),
    ).rejects.toThrow('membership failed');

    expect(h.session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(h.audit.log).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'workspace.membership.owner_synced',
      }),
    );
  });

  it('emits the success audit only after transaction commit completes', async () => {
    const h = atomicHarness();
    h.state.workspace = null;
    let releaseCommit!: () => void;
    h.session.commitTransaction.mockImplementation(
      () => new Promise<void>(resolve => (releaseCommit = resolve)),
    );

    const createPromise = h.service.createWorkspace({
      organizationId: h.organizationId,
      ownerId: h.ownerId,
      members: [],
    });
    await new Promise(resolve => setImmediate(resolve));
    expect(h.audit.log).not.toHaveBeenCalled();

    releaseCommit();
    await createPromise;

    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'workspace.membership.owner_synced',
      }),
    );
    expect(
      h.session.commitTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(h.audit.log.mock.invocationCallOrder[0]);
  });

  it('owner sync twice reuses one membership through the same upsert path', async () => {
    const h = atomicHarness();

    await h.service.syncOwnerMembership(h.workspaceId.toString());
    const firstMembershipId = h.state.membership?._id;
    await h.service.syncOwnerMembership(h.workspaceId.toString());

    expect(h.state.membership?._id).toBe(firstMembershipId);
    expect(h.memberships.create).not.toHaveBeenCalled();
    expect(h.memberships.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(h.memberships.findOneAndUpdate.mock.calls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ upsert: true, session: h.session }),
        ]),
      ]),
    );
  });

  it('adding the same member twice does not create a duplicate membership', async () => {
    const h = atomicHarness();
    const input = {
      workspaceId: h.workspaceId.toString(),
      userId: h.memberId.toString(),
      role: SPACE_ROLES.MEMBER,
    };

    await h.service.addMember(input);
    const firstMembershipId = h.state.membership?._id;
    await h.service.addMember(input);

    expect(
      h.state.workspace?.members.filter((member: any) =>
        member.userId.equals(h.memberId),
      ),
    ).toHaveLength(1);
    expect(h.state.membership?._id).toBe(firstMembershipId);
    expect(h.memberships.create).not.toHaveBeenCalled();
    expect(h.memberships.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(h.memberships.findOneAndUpdate.mock.calls[1][2]).toEqual(
      expect.objectContaining({ upsert: true, session: h.session }),
    );
  });

  it('accepting the same invitation twice reuses membership and preserves joinedAt', async () => {
    const h = atomicHarness();
    const input = {
      workspaceId: h.workspaceId.toString(),
      userId: h.memberId.toString(),
      role: SPACE_ROLES.MEMBER,
    };

    await h.service.activateInvite(input);
    const firstMembershipId = h.state.membership?._id;
    const firstJoinedAt = h.state.membership?.joinedAt;
    await h.service.activateInvite(input);

    expect(h.state.membership?._id).toBe(firstMembershipId);
    expect(h.state.membership?.joinedAt).toBe(firstJoinedAt);
    expect(h.memberships.create).not.toHaveBeenCalled();
    expect(h.memberships.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(h.memberships.findOneAndUpdate.mock.calls[1][2]).toEqual(
      expect.objectContaining({ upsert: true, session: h.session }),
    );
  });

  it('remove then reactivate reuses the existing membership document', async () => {
    const h = atomicHarness();
    const joinedAt = new Date('2026-01-01T00:00:00.000Z');
    h.state.workspace!.members = [
      { userId: h.memberId, role: SPACE_ROLES.MEMBER },
    ];
    h.state.membership = {
      _id: h.membershipId,
      workspaceId: h.workspaceId,
      userId: h.memberId,
      organizationId: h.organizationId,
      role: SPACE_ROLES.MEMBER,
      status: 'active',
      joinedAt,
    };

    await h.service.removeMember(
      h.workspaceId.toString(),
      h.memberId.toString(),
    );
    expect(h.state.membership).toEqual(
      expect.objectContaining({ _id: h.membershipId, status: 'removed' }),
    );

    await h.service.addMember({
      workspaceId: h.workspaceId.toString(),
      userId: h.memberId.toString(),
      role: SPACE_ROLES.MEMBER,
    });

    expect(h.state.membership).toEqual(
      expect.objectContaining({ _id: h.membershipId, status: 'active' }),
    );
    expect(h.memberships.create).not.toHaveBeenCalled();
    expect(h.memberships.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(h.memberships.findOneAndUpdate.mock.calls[1][2]).toEqual(
      expect.objectContaining({ upsert: true, session: h.session }),
    );
  });
});
