import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { WorkspaceTenantBindingService } from './workspace-tenant-binding.service';

const query = (value: unknown) => ({ exec: async () => value });

describe('WorkspaceTenantBindingService', () => {
  const organizationId = new Types.ObjectId();
  const workspaceId = new Types.ObjectId();

  it('binds an unbound workspace to an active organization', async () => {
    const workspace = { _id: workspaceId, organizationId: null };
    const workspaces = { findById: jest.fn(() => query(workspace)), updateOne: jest.fn(() => query({ modifiedCount: 1 })) };
    const organizations = { findOne: jest.fn(() => query({ _id: organizationId, status: 'active', deletedAt: null })) };
    const service = new WorkspaceTenantBindingService(workspaces as any, organizations as any, { get: () => 'optional' } as any, { log: jest.fn() } as any);

    await service.bindWorkspaceToOrganization(workspaceId.toString(), organizationId.toString());

    expect(workspaces.updateOne).toHaveBeenCalledWith(
      { _id: workspaceId, organizationId: null },
      { $set: { organizationId } },
    );
  });

  it('refuses to overwrite a different organization binding', async () => {
    const workspaces = { findById: jest.fn(() => query({ _id: workspaceId, organizationId: new Types.ObjectId() })) };
    const organizations = { findOne: jest.fn(() => query({ _id: organizationId, status: 'active', deletedAt: null })) };
    const service = new WorkspaceTenantBindingService(workspaces as any, organizations as any, { get: () => 'optional' } as any, { log: jest.fn() } as any);

    await expect(service.bindWorkspaceToOrganization(workspaceId.toString(), organizationId.toString())).rejects.toThrow(ConflictException);
  });

  it('rejects missing or deactivated organizations', async () => {
    const workspaces = { findById: jest.fn(() => query({ _id: workspaceId, organizationId: null })) };
    const organizations = { findOne: jest.fn(() => query(null)) };
    const service = new WorkspaceTenantBindingService(workspaces as any, organizations as any, { get: () => 'optional' } as any, { log: jest.fn() } as any);

    await expect(service.bindWorkspaceToOrganization(workspaceId.toString(), organizationId.toString())).rejects.toThrow(BadRequestException);
  });

  it('defaults the create compatibility mode to legacy', () => {
    const service = new WorkspaceTenantBindingService({} as any, {} as any, { get: () => undefined } as any, { log: jest.fn() } as any);
    expect(service.mode()).toBe('legacy');
  });
});
