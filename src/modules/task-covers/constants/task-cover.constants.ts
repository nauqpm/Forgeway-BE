export const TASK_COVER_TYPES = {
  COLOR: 'color',
  IMAGE: 'image',
} as const;

export type TaskCoverType =
  (typeof TASK_COVER_TYPES)[keyof typeof TASK_COVER_TYPES];

export const TASK_COVER_TYPE_VALUES = Object.values(TASK_COVER_TYPES);

export const TASK_COVER_SOURCES = {
  SYSTEM: 'system',
  UPLOAD: 'upload',
  UNSPLASH: 'unsplash',
} as const;

export type TaskCoverSource =
  (typeof TASK_COVER_SOURCES)[keyof typeof TASK_COVER_SOURCES];

export const TASK_COVER_SOURCE_VALUES = Object.values(TASK_COVER_SOURCES);

export const TASK_COVER_COLOR_PATTERN = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
