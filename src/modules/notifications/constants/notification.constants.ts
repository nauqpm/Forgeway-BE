export const NOTIFICATION_TYPES = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  COMMENT_MENTIONED: 'COMMENT_MENTIONED',
  TASK_COMMENT_CREATED: 'TASK_COMMENT_CREATED',
  WORKSPACE_INVITED: 'WORKSPACE_INVITED',
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const NOTIFICATION_TYPE_VALUES = Object.values(NOTIFICATION_TYPES);

export const NOTIFICATION_ENTITY_TYPES = {
  TASK: 'task',
  COMMENT: 'comment',
  WORKSPACE: 'workspace',
  INVITE: 'invite',
} as const;

export type NotificationEntityType =
  (typeof NOTIFICATION_ENTITY_TYPES)[keyof typeof NOTIFICATION_ENTITY_TYPES];

export const NOTIFICATION_ENTITY_TYPE_VALUES = Object.values(
  NOTIFICATION_ENTITY_TYPES,
);

export const NOTIFICATION_LIMITS = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;