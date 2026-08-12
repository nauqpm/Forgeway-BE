import { BadRequestException } from '@nestjs/common';
import { WebPushRuntimeConfig } from '../config/web-push.config';
import { WebPushEndpointPolicy } from './web-push-endpoint-policy.service';

describe('WebPushEndpointPolicy', () => {
  const runtimeConfig: WebPushRuntimeConfig = {
    enabled: true,
    allowedEndpointHosts: new Set([
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
    ]),
  };
  const policy = new WebPushEndpointPolicy(runtimeConfig);

  it('reports an IP-literal endpoint as disallowed for worker reuse', () => {
    expect(policy.isAllowed('https://127.0.0.1/push')).toBe(false);
  });

  it.each([
    'https://attacker.example/push',
    'https://127.0.0.1/push',
    'https://fcm.googleapis.com:8443/push',
    'https://0x7f.0.0.1/push',
  ])(
    'rejects an endpoint outside the approved provider boundary: %s',
    endpoint => {
      expect(() => policy.assertAllowed(endpoint)).toThrow(BadRequestException);
    },
  );

  it('accepts an HTTPS endpoint whose normalized hostname matches the allowlist', () => {
    expect(() =>
      policy.assertAllowed('https://FCM.GOOGLEAPIS.COM/push/subscription'),
    ).not.toThrow();
  });
});
