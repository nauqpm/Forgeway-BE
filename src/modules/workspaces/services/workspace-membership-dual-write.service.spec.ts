import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { WorkspaceMembershipDualWriteService } from './workspace-membership-dual-write.service';
import { SPACE_ROLES } from '@/common/constants/space-role.constants';

const id = () => new Types.ObjectId();
const query = (value: unknown) => ({
  session: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
});

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
});
