import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { Organization, OrganizationDocument } from '../../organizations/schemas/organization.schema';
import { Workspace, WorkspaceDocument } from '../schemas/workspace.schema';

export type WorkspaceOrganizationBindingMode = 'legacy' | 'optional' | 'required';

@Injectable()
export class WorkspaceTenantBindingService {
  constructor(
    @InjectModel(Workspace.name) private readonly workspaces: Model<WorkspaceDocument>,
    @InjectModel(Organization.name) private readonly organizations: Model<OrganizationDocument>,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
  ) {}

  mode(): WorkspaceOrganizationBindingMode {
    return (this.config.get<string>('WORKSPACE_ORGANIZATION_BINDING_MODE') ?? 'legacy') as WorkspaceOrganizationBindingMode;
  }

  async validateWorkspaceOrganizationBinding(organizationId: string): Promise<Types.ObjectId> {
    if (!Types.ObjectId.isValid(organizationId)) throw new BadRequestException('Organization binding is invalid');
    const id = new Types.ObjectId(organizationId);
    const organization = await this.organizations.findOne({ _id: id, status: 'active', deletedAt: null }).exec();
    if (!organization) throw new BadRequestException('Organization binding must reference an active organization');
    return id;
  }

  async bindWorkspaceToOrganization(workspaceId: string, organizationId: string): Promise<void> {
    if (!Types.ObjectId.isValid(workspaceId)) throw new BadRequestException('Workspace binding is invalid');
    const workspace = await this.workspaces.findById(workspaceId).exec();
    if (!workspace) throw new BadRequestException('Workspace does not exist');
    const target = await this.validateWorkspaceOrganizationBinding(organizationId);
    if (workspace.organizationId?.equals(target)) return;
    if (workspace.organizationId) throw new ConflictException('Workspace is already bound to a different organization');
    await this.workspaces.updateOne({ _id: workspace._id, organizationId: null }, { $set: { organizationId: target } }).exec();
    this.audit.log({ type: 'workspace.organization_binding.created', severity: 'INFO', metadata: { workspaceId, organizationId } });
  }
}
