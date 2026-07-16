import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { OrganizationMembershipsService } from './organization-memberships.service';

const id = new Types.ObjectId();

function query(value: unknown) {
  return { session: () => ({ exec: async () => value }) };
}

describe('OrganizationMembershipsService', () => {
  it('rejects suspending the final active owner', async () => {
    const membership = {
      _id: id,
      organizationId: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      role: 'owner',
      membershipType: 'employee',
      status: 'active',
      expiresAt: null,
      save: jest.fn(),
    };
    const memberships = {
      findById: jest.fn(() => query(membership)),
      countDocuments: jest.fn(() => query(1)),
    };
    const organizations = {
      findOneAndUpdate: jest.fn(() => ({
        exec: async () => ({ settings: {} }),
      })),
    };
    const audit = { log: jest.fn() };
    const service = new OrganizationMembershipsService(
      organizations as any,
      memberships as any,
      { run: async (operation: any) => operation({}) } as any,
      {} as any,
      audit as any,
    );

    await expect(
      service.suspendMembership(id.toString(), id.toString()),
    ).rejects.toThrow(ConflictException);
    expect(membership.save).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'organization.owner_invariant_rejected',
      }),
    );
  });

  it('rejects ownership transfer from a non-owner source', async () => {
    const organizationId = new Types.ObjectId();
    const source = {
      _id: new Types.ObjectId(),
      organizationId,
      userId: new Types.ObjectId(),
      role: 'member',
      membershipType: 'employee',
      status: 'active',
      expiresAt: null,
      save: jest.fn(),
    };
    const target = {
      ...source,
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(),
    };
    const memberships = {
      findById: jest
        .fn()
        .mockReturnValueOnce(query(source))
        .mockReturnValueOnce(query(target)),
    };
    const service = new OrganizationMembershipsService(
      {} as any,
      memberships as any,
      { run: async (operation: any) => operation({}) } as any,
      {} as any,
      { log: jest.fn() } as any,
    );

    await expect(
      service.transferOwnership(
        source._id.toString(),
        target._id.toString(),
        source.userId.toString(),
      ),
    ).rejects.toThrow('Ownership transfer source must be an owner');
    expect(target.save).not.toHaveBeenCalled();
  });
});
