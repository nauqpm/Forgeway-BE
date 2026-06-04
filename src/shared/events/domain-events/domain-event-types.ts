export const DOMAIN_EVENT_TYPES = {
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_MOVED: 'task.moved',
  TASK_REORDERED: 'task.reordered',
  TASK_ARCHIVED: 'task.archived',
  TASK_RESTORED: 'task.restored',
  TASK_DELETED: 'task.deleted',
  NOTIFICATION_CREATED: 'notification.created',
  NOTIFICATION_READ: 'notification.read',
  NOTIFICATION_READ_ALL: 'notification.read_all',
  WORKSPACE_INVITE_CREATED: 'workspace.invite.created',
  WORKSPACE_MEMBER_JOINED: 'workspace.member.joined',
  WORKSPACE_MEMBER_REMOVED: 'workspace.member.removed',
  WORKSPACE_MEMBER_ROLE_UPDATED: 'workspace.member.role_updated',
} as const;

export type DomainEventType =
  (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];
