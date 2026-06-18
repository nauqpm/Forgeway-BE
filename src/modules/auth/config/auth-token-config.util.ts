export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 900;
export const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 604800;

const POSITIVE_INTEGER_PATTERN = /^\d+$/;

export function parsePositiveTtlSeconds(
  value: string | undefined,
  key: string,
  fallback: number,
): number {
  const normalized = value?.trim();

  if (!normalized) {
    return fallback;
  }

  if (!POSITIVE_INTEGER_PATTERN.test(normalized)) {
    throw new Error(`${key} must be a positive integer number of seconds`);
  }

  const ttl = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(ttl) || ttl <= 0) {
    throw new Error(`${key} must be a positive integer number of seconds`);
  }

  return ttl;
}

export function secondsToJwtExpiresIn(seconds: number): string {
  return `${seconds}s`;
}
