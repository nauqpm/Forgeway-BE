export const REALTIME_EVENT_TYPES = {
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_MOVED: 'task.moved',
  TASK_REORDERED: 'task.reordered',
  TASK_ARCHIVED: 'task.archived',
  TASK_RESTORED: 'task.restored',
  TASK_DELETED: 'task.deleted',

  SPRINT_CREATED: 'sprint.created',

  NOTIFICATION_CREATED: 'notification.created',
  NOTIFICATION_READ: 'notification.read',
  NOTIFICATION_READ_ALL: 'notification.read_all',

  WORKSPACE_INVITE_CREATED: 'workspace.invite.created',
  WORKSPACE_MEMBER_JOINED: 'workspace.member.joined',
  WORKSPACE_MEMBER_REMOVED: 'workspace.member.removed',
  WORKSPACE_MEMBER_ROLE_UPDATED: 'workspace.member.role_updated',

  TASK_COMMENT_CREATED: 'task.comment.created',
  TASK_COMMENT_UPDATED: 'task.comment.updated',
  TASK_COMMENT_DELETED: 'task.comment.deleted',
  TASK_ATTACHMENT_ADDED: 'task.attachment.added',
  TASK_ATTACHMENT_DELETED: 'task.attachment.deleted',
  TASK_LABELS_UPDATED: 'task.labels.updated',
  TASK_COVER_UPDATED: 'task.cover.updated',
  TASK_ACTIVITY_CREATED: 'task.activity.created',

  PAGE_UPDATED: 'page.updated',
} as const;

export type RealtimeEventType =
  (typeof REALTIME_EVENT_TYPES)[keyof typeof REALTIME_EVENT_TYPES];
