import {
  parseWebPushRuntimeConfig,
  WEB_PUSH_DELIVERY_POLICY,
} from './web-push.config';

describe('parseWebPushRuntimeConfig', () => {
  it('disables delivery without requiring provider hosts', () => {
    expect(parseWebPushRuntimeConfig({ WEB_PUSH_ENABLED: 'false' })).toEqual({
      enabled: false,
      allowedEndpointHosts: new Set(),
    });
  });

  it('normalizes and deduplicates enabled provider hosts', () => {
    const config = parseWebPushRuntimeConfig({
      WEB_PUSH_ENABLED: ' TRUE ',
      WEB_PUSH_ALLOWED_ENDPOINT_HOSTS:
        ' FCM.GOOGLEAPIS.COM,updates.push.services.mozilla.com,fcm.googleapis.com ',
    });

    expect(config.enabled).toBe(true);
    expect(config.allowedEndpointHosts).toEqual(
      new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com']),
    );
  });

  it('rejects enabled delivery without provider hosts', () => {
    expect(() =>
      parseWebPushRuntimeConfig({ WEB_PUSH_ENABLED: 'true' }),
    ).toThrow(
      'Missing required environment variable: WEB_PUSH_ALLOWED_ENDPOINT_HOSTS',
    );
  });

  it.each([
    'https://fcm.googleapis.com',
    'fcm.googleapis.com/path',
    'fcm.googleapis.com:443',
    '*.googleapis.com',
    'localhost',
    '127.0.0.1',
    'fcm..googleapis.com',
    '-fcm.googleapis.com',
    'fcm-.googleapis.com',
    'fcm.googleapis.com.',
  ])('rejects non-exact provider host %s', host => {
    expect(() =>
      parseWebPushRuntimeConfig({
        WEB_PUSH_ENABLED: 'true',
        WEB_PUSH_ALLOWED_ENDPOINT_HOSTS: host,
      }),
    ).toThrow('WEB_PUSH_ALLOWED_ENDPOINT_HOSTS must contain exact hostnames only');
  });

  it.each([
    '0x7f.0.0.1',
    '0177.0.0.1',
    '127.1',
    '127.00.0x1',
  ])(
    'rejects IPv4 aliases normalized by a URL parser: %s',
    host => {
      expect(() =>
        parseWebPushRuntimeConfig({
          WEB_PUSH_ENABLED: 'true',
          WEB_PUSH_ALLOWED_ENDPOINT_HOSTS: host,
        }),
      ).toThrow(
        'WEB_PUSH_ALLOWED_ENDPOINT_HOSTS must contain exact hostnames only',
      );
    },
  );
});

describe('WEB_PUSH_DELIVERY_POLICY', () => {
  it('defines bounded delivery and retry settings', () => {
    expect(WEB_PUSH_DELIVERY_POLICY).toEqual({
      maxSubscriptionsPerUser: 3,
      requestTimeoutMs: 10_000,
      leaseMs: 45_000,
      pollIntervalMs: 5_000,
      maxAttempts: 5,
      expiryMs: 15 * 60_000,
      retryDelaysMs: [30_000, 90_000, 180_000, 300_000],
      providerTtlSeconds: 300,
    });
  });
});
