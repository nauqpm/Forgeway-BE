export function getField(
  record: Record<string, string>,
  ...keys: string[]
): string {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return String(record[key]).trim();
    }
  }
  return '';
}

export interface NumericFieldOptions {
  min?: number;
  max?: number;
}

export interface NumericFieldResult {
  value?: number;
  error?: string;
}

export function parseNumericField(
  raw: string | undefined,
  options: NumericFieldOptions,
  errorMsg: string,
): NumericFieldResult {
  if (!raw || raw.trim() === '') return {};

  const value = parseFloat(raw);
  const { min, max } = options;

  if (
    isNaN(value) ||
    (min !== undefined && value < min) ||
    (max !== undefined && value > max)
  ) {
    return { error: errorMsg };
  }

  return { value };
}

export interface DateFieldResult {
  value?: string;
  error?: string;
}

export function parseDateField(
  raw: string | undefined,
  errorMsg: string,
): DateFieldResult {
  if (!raw || raw.trim() === '') return {};

  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    return { error: errorMsg };
  }

  return { value: d.toISOString() };
}

export interface LookupResult {
  id?: string;
  warning?: string;
}

export function lookupWithWarning(
  raw: string | undefined,
  map: Map<string, string>,
  warningMsg: string,
): LookupResult {
  if (!raw || raw.trim() === '') return {};

  const key = raw.trim().toLowerCase();
  const id = map.get(key);

  if (!id) {
    return { warning: warningMsg };
  }

  return { id };
}
