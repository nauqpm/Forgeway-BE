export const PERMISSIONS = {
  WORKSPACE_VIEW: 'workspace:view',
  WORKSPACE_UPDATE: 'workspace:update',
  WORKSPACE_DELETE: 'workspace:delete',
  MEMBER_VIEW: 'member:view',
  MEMBER_MANAGE: 'member:manage',
  INVITE_CREATE: 'invite:create',
  INVITE_MANAGE: 'invite:manage',
  TASK_VIEW: 'task:view',
  TASK_CREATE: 'task:create',
  TASK_EDIT: 'task:edit',
  TASK_DELETE: 'task:delete',
  TASK_MOVE: 'task:move',
  TASK_BULK_IMPORT: 'task:bulk_import',
  BOARD_VIEW: 'board:view',
  BOARD_MANAGE: 'board:manage',
  SPRINT_MANAGE: 'sprint:manage',
  PAGE_VIEW: 'page:view',
  PAGE_CREATE: 'page:create',
  PAGE_EDIT: 'page:edit',
  PAGE_DELETE: 'page:delete',
  DOCUMENT_VIEW: 'document:view',
  DOCUMENT_EDIT: 'document:edit',
  CHANNEL_VIEW: 'channel:view',
  CHANNEL_MANAGE: 'channel:manage',
  MESSAGE_VIEW: 'message:view',
  MESSAGE_SEND: 'message:send',
  MEETING_VIEW: 'meeting:view',
  MEETING_MANAGE: 'meeting:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const AUTHORIZATION_MODES = ['legacy', 'shadow', 'enforce'] as const;
export type AuthorizationMode = (typeof AUTHORIZATION_MODES)[number];

export function parseAuthorizationMode(value?: string): AuthorizationMode {
  return AUTHORIZATION_MODES.includes(value as AuthorizationMode)
    ? (value as AuthorizationMode)
    : 'legacy';
}
