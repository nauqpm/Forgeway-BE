export const DOMAIN_EVENT_TYPES = {
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_MOVED: 'task.moved',
  TASK_REORDERED: 'task.reordered',
  TASK_ARCHIVED: 'task.archived',
  TASK_RESTORED: 'task.restored',
  TASK_DELETED: 'task.deleted',
} as const;

export type DomainEventType =
  (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];
