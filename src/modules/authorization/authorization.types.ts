import type { Permission } from './authorization.constants';
import type { GlobalRole } from '../../common/constants/global-role.constants';

export type AuthorizationDecision = 'allow' | 'deny' | 'not_applicable';
export type ResourceType =
  | 'workspace'
  | 'task'
  | 'board'
  | 'sprint'
  | 'page'
  | 'document'
  | 'channel'
  | 'message'
  | 'meeting';

export interface ResourceReference {
  type: ResourceType;
  id: string;
  organizationId?: string;
  workspaceId?: string;
  channelId?: string;
  ownerId?: string;
}

export interface ResolvedRole {
  scope: 'global' | 'organization' | 'department' | 'workspace' | 'channel';
  role: string;
  source:
    | 'global'
    | 'legacy_workspace'
    | 'workspace_membership'
    | 'channel_membership'
    | 'owner';
}

export interface AuthorizationContext {
  userId: string;
  userStatus?: string;
  resource: ResourceReference;
  roles: ResolvedRole[];
  effectivePermissions: Permission[];
  restrictions: string[];
}

export interface AuthorizationRequest {
  userId: string;
  globalRole?: GlobalRole;
  permission: Permission;
  resource: ResourceReference;
}

export interface AuthorizationResult {
  decision: AuthorizationDecision;
  allowed: boolean;
  reasonCode: string;
  matchedPermissions: Permission[];
  matchedRoles: ResolvedRole[];
  restrictions: string[];
  source: 'legacy' | 'resolver';
}

export interface LegacyAuthorizationAdapter {
  authorize(request: AuthorizationRequest): Promise<AuthorizationResult>;
}
