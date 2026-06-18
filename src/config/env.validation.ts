import {
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
  parsePositiveTtlSeconds,
} from '../modules/auth/config/auth-token-config.util';

type Env = Record<string, string | undefined>;

const REQUIRED_ENV_VARS = [
  'DB_CONNECTION_STRING',
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET',
] as const;

const MIN_SECRET_LENGTH = 32;

function requireValue(
  config: Env,
  key: (typeof REQUIRED_ENV_VARS)[number],
): string {
  const value = config[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function requireStrongSecret(
  config: Env,
  key: 'JWT_SECRET' | 'REFRESH_TOKEN_SECRET',
): void {
  const value = requireValue(config, key);
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${key} must be at least ${MIN_SECRET_LENGTH} characters long`,
    );
  }
}

export function validateEnv(config: Env): Env {
  for (const key of REQUIRED_ENV_VARS) {
    requireValue(config, key);
  }

  requireStrongSecret(config, 'JWT_SECRET');
  requireStrongSecret(config, 'REFRESH_TOKEN_SECRET');

  parsePositiveTtlSeconds(
    config.ACCESS_TOKEN_TTL_SECONDS,
    'ACCESS_TOKEN_TTL_SECONDS',
    DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  );
  parsePositiveTtlSeconds(
    config.REFRESH_TOKEN_TTL_SECONDS,
    'REFRESH_TOKEN_TTL_SECONDS',
    DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
  );

  return config;
}
