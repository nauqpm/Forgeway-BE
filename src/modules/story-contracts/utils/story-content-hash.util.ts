import { createHash } from 'crypto';

const STABLE_KEYS = [
  'id',
  '_id',
  'key',
  'requirementId',
  'acceptanceCriterionId',
  'criterionId',
  'decisionRecordId',
] as const;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const items = value.map(canonicalize);
    const sortable = items.every(
      item =>
        item === null ||
        typeof item !== 'object' ||
        STABLE_KEYS.some(key => key in item),
    );
    return sortable
      ? [...items].sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        )
      : items;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
};

export const canonicalStringify = (value: unknown): string =>
  JSON.stringify(canonicalize(value));

export const canonicalSnapshot = <T>(value: T): T =>
  JSON.parse(canonicalStringify(value)) as T;

export const createStoryContentHash = (value: unknown): string =>
  createHash('sha256').update(canonicalStringify(value)).digest('hex');
