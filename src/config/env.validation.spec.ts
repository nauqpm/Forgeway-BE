import { validateEnv } from './env.validation';

const validEnv = {
  DB_CONNECTION_STRING: 'mongodb://localhost:27017/sdlc-platform',
  JWT_SECRET: 'a'.repeat(32),
  REFRESH_TOKEN_SECRET: 'b'.repeat(32),
};

describe('validateEnv web push configuration', () => {
  it('defaults web push to disabled when it is not configured', () => {
    expect(validateEnv(validEnv).WEB_PUSH_ENABLED).toBe('false');
  });

  it('normalizes a blank web push setting to disabled', () => {
    expect(
      validateEnv({ ...validEnv, WEB_PUSH_ENABLED: '   ' }).WEB_PUSH_ENABLED,
    ).toBe('false');
  });

  it('rejects enabled web push without allowed provider hosts', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        WEB_PUSH_ENABLED: 'true',
        VAPID_SUBJECT: 'mailto:security@example.com',
        VAPID_PUBLIC_KEY: 'public-key',
        VAPID_PRIVATE_KEY: 'private-key',
      }),
    ).toThrow(
      'Missing required environment variable: WEB_PUSH_ALLOWED_ENDPOINT_HOSTS',
    );
  });

  it('accepts enabled web push with exact provider hosts', () => {
    expect(
      validateEnv({
        ...validEnv,
        WEB_PUSH_ENABLED: 'true',
        VAPID_SUBJECT: 'mailto:security@example.com',
        VAPID_PUBLIC_KEY: 'public-key',
        VAPID_PRIVATE_KEY: 'private-key',
        WEB_PUSH_ALLOWED_ENDPOINT_HOSTS:
          'fcm.googleapis.com,updates.push.services.mozilla.com,web.push.apple.com',
      }).WEB_PUSH_ENABLED,
    ).toBe('true');
  });
});
