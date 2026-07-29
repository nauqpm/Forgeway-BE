import {
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
  parsePositiveTtlSeconds,
} from '../modules/auth/config/auth-token-config.util';
import { parseAuthorizationMode } from '../modules/authorization/authorization.constants';

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

export function parseOrganizationSchemaEnabled(
  value: string | undefined,
): boolean {
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('ORGANIZATION_SCHEMA_ENABLED must be true or false');
}

export function parseChannelOrganizationScopeEnabled(
  value: string | undefined,
): boolean {
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('CHANNEL_ORGANIZATION_SCOPE_ENABLED must be true or false');
}

export function parseWorkspaceOrganizationBindingMode(
  value: string | undefined,
): 'legacy' | 'optional' | 'required' {
  const mode = value || 'legacy';
  if (mode === 'legacy' || mode === 'optional' || mode === 'required')
    return mode;
  throw new Error(
    'WORKSPACE_ORGANIZATION_BINDING_MODE must be legacy, optional, or required',
  );
}

export function parseWorkspaceMembershipMode(
  value: string | undefined,
): 'legacy' | 'dual_write' | 'shadow_read' {
  const mode = value || 'legacy';
  if (mode === 'legacy' || mode === 'dual_write' || mode === 'shadow_read')
    return mode;
  throw new Error(
    'WORKSPACE_MEMBERSHIP_MODE must be legacy, dual_write, or shadow_read',
  );
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
  parseAuthorizationMode(config.AUTHORIZATION_MODE);
  parseOrganizationSchemaEnabled(config.ORGANIZATION_SCHEMA_ENABLED);
  parseChannelOrganizationScopeEnabled(
    config.CHANNEL_ORGANIZATION_SCOPE_ENABLED,
  );
  parseWorkspaceOrganizationBindingMode(
    config.WORKSPACE_ORGANIZATION_BINDING_MODE,
  );
  parseWorkspaceMembershipMode(config.WORKSPACE_MEMBERSHIP_MODE);

  return config;
}
