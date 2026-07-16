import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  Workspace,
  WorkspaceDocument,
} from '../workspaces/schemas/workspace.schema';
import {
  AuthorizationRequest,
  AuthorizationResult,
  LegacyAuthorizationAdapter,
} from './authorization.types';
import { resolveWorkspaceAuthorizationContext } from './workspace-authorization-context';

@Injectable()
export class LegacyAuthorizationAdapterService implements LegacyAuthorizationAdapter {
  constructor(
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
  ) {}

  async authorize(request: AuthorizationRequest): Promise<AuthorizationResult> {
    const context = await resolveWorkspaceAuthorizationContext(
      this.workspaceModel,
      request,
    );
    if (!context) {
      return this.notApplicable();
    }

    const allowed = context.effectivePermissions.includes(request.permission);
    return {
      decision: allowed ? 'allow' : 'deny',
      allowed,
      reasonCode: allowed
        ? 'ALLOW_PERMISSION_GRANTED'
        : 'DENY_PERMISSION_MISSING',
      matchedPermissions: allowed ? [request.permission] : [],
      matchedRoles: context.roles,
      restrictions: context.restrictions,
      source: 'legacy',
    };
  }

  private notApplicable(): AuthorizationResult {
    return {
      decision: 'not_applicable',
      allowed: false,
      reasonCode: 'LEGACY_ADAPTER_UNSUPPORTED_RESOURCE',
      matchedPermissions: [],
      matchedRoles: [],
      restrictions: [],
      source: 'legacy',
    };
  }
}
