const SEARCH_TOKEN_MAX_PREFIX_LENGTH = 32;

export const normalizeSearchToken = (value: string): string =>
  value.trim().toLowerCase();

export const buildTaskSearchTokens = (
  key?: string,
  title?: string,
): string[] => {
  const tokens = new Set<string>();

  for (const value of [key, title]) {
    if (!value?.trim()) {
      continue;
    }

    const normalized = normalizeSearchToken(value);
    addPrefixes(normalized, tokens);

    for (const part of normalized.split(/[^a-z0-9]+/).filter(Boolean)) {
      addPrefixes(part, tokens);
    }
  }

  return [...tokens];
};

const addPrefixes = (value: string, tokens: Set<string>): void => {
  const maxLength = Math.min(value.length, SEARCH_TOKEN_MAX_PREFIX_LENGTH);

  for (let index = 1; index <= maxLength; index += 1) {
    tokens.add(value.slice(0, index));
  }
};
