export const TASK_TYPES = ['task', 'bug', 'story', 'epic'] as const;
export const TASK_PRIORITIES = [
  'lowest',
  'low',
  'medium',
  'high',
  'highest',
] as const;

export const TASK_STATUSES = {
  TODO: 'todo',
  IN_PROGRESS: 'inprogress',
  DONE: 'done',
} as const;

export const TASK_STATUS_VALUES = Object.values(TASK_STATUSES);

export const TASK_KEY_PATTERN = /^[A-Z][A-Z0-9]*-\d+$/;
export const TASK_LABEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-_ ]{0,49}$/;

export type TaskType = (typeof TASK_TYPES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[keyof typeof TASK_STATUSES];
