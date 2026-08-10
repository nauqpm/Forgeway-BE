import { isIP } from 'node:net';

export type Environment = Record<string, string | undefined>;

export interface WebPushRuntimeConfig {
  enabled: boolean;
  allowedEndpointHosts: ReadonlySet<string>;
}

export const WEB_PUSH_DELIVERY_POLICY = {
  maxSubscriptionsPerUser: 3,
  requestTimeoutMs: 10_000,
  leaseMs: 45_000,
  pollIntervalMs: 5_000,
  maxAttempts: 5,
  expiryMs: 15 * 60_000,
  retryDelaysMs: [30_000, 90_000, 180_000, 300_000],
  providerTtlSeconds: 300,
} as const;

function isExactHostname(host: string): boolean {
  return (
    host !== 'localhost' &&
    isIP(host) === 0 &&
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      host,
    )
  );
}

function normalizesToIpLiteral(host: string): boolean {
  return isIP(new URL(`https://${host}`).hostname) !== 0;
}

export function parseWebPushRuntimeConfig(
  config: Environment,
): WebPushRuntimeConfig {
  const enabled = config.WEB_PUSH_ENABLED?.trim().toLowerCase() === 'true';
  if (!enabled) return { enabled: false, allowedEndpointHosts: new Set() };
  const hosts =
    config.WEB_PUSH_ALLOWED_ENDPOINT_HOSTS?.split(',')
      .map(host => host.trim().toLowerCase())
      .filter(Boolean) ?? [];
  if (!hosts.length) {
    throw new Error(
      'Missing required environment variable: WEB_PUSH_ALLOWED_ENDPOINT_HOSTS',
    );
  }
  if (
    hosts.some(
      host =>
        host.includes('://') ||
        host.includes('/') ||
        host.includes(':') ||
        host.includes('*') ||
        !isExactHostname(host) ||
        normalizesToIpLiteral(host),
    )
  ) {
    throw new Error(
      'WEB_PUSH_ALLOWED_ENDPOINT_HOSTS must contain exact hostnames only',
    );
  }
  return { enabled: true, allowedEndpointHosts: new Set(hosts) };
}
