import { TASK_KEY_PATTERN } from '../constants/task-status.constants';

export const normalizeTaskKey = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : undefined;
};

export const isTaskKey = (value: unknown): boolean => {
  const normalized = normalizeTaskKey(value);
  return !!normalized && TASK_KEY_PATTERN.test(normalized);
};
