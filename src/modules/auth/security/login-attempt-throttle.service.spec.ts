import { LoginAttemptThrottleService } from './login-attempt-throttle.service';

describe('LoginAttemptThrottleService', () => {
  const context = { email: ' User@Example.com ', ip: ' 127.0.0.1 ' };
  const client = {
    pTTL: jest.fn(),
    eval: jest.fn(),
    del: jest.fn(),
  };
  const redisService = {
    createClient: jest.fn(),
  };
  let service: LoginAttemptThrottleService;

  beforeEach(async () => {
    jest.clearAllMocks();
    redisService.createClient.mockResolvedValue(client);
    service = new LoginAttemptThrottleService(redisService as never);
    await service.onModuleInit();
  });

  it('uses the maximum remaining cooldown from email and IP', async () => {
    client.pTTL.mockResolvedValueOnce(1_100).mockResolvedValueOnce(2_001);

    await expect(service.getRetryAfterSeconds(context)).resolves.toBe(3);
    expect(client.pTTL).toHaveBeenCalledTimes(2);
  });

  it('registers email and IP failures with independent atomic scripts', async () => {
    client.eval.mockResolvedValueOnce([5, 1]).mockResolvedValueOnce([6, 2]);

    await expect(service.registerFailure(context)).resolves.toEqual({
      emailAttempts: 5,
      ipAttempts: 6,
      retryAfterSeconds: 2,
    });
    expect(client.eval).toHaveBeenCalledTimes(2);

    const serializedCalls = JSON.stringify(client.eval.mock.calls);
    expect(serializedCalls).not.toContain('User@Example.com');
    expect(serializedCalls).not.toContain('127.0.0.1');
    expect(serializedCalls).toContain('auth:login-delay:email:');
    expect(serializedCalls).toContain('auth:login-delay:ip:');
  });

  it('clears both attempt and cooldown keys after success', async () => {
    client.del.mockResolvedValue(4);

    await service.clear(context);

    expect(client.del).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining('auth:login-delay:email:'),
        expect.stringContaining('auth:login-delay:ip:'),
      ]),
    );
  });

  it('degrades without blocking login when Redis is unavailable', async () => {
    redisService.createClient.mockResolvedValue(null);
    const degradedService = new LoginAttemptThrottleService(
      redisService as never,
    );
    await degradedService.onModuleInit();

    await expect(degradedService.getRetryAfterSeconds(context)).resolves.toBe(
      0,
    );
    await expect(degradedService.registerFailure(context)).resolves.toEqual({
      emailAttempts: 0,
      ipAttempts: 0,
      retryAfterSeconds: 0,
    });
  });

  it('degrades without blocking login when Redis fails at runtime', async () => {
    client.pTTL.mockRejectedValue(new Error('Redis disconnected'));
    client.eval.mockRejectedValue(new Error('Redis disconnected'));

    await expect(service.getRetryAfterSeconds(context)).resolves.toBe(0);
    await expect(service.registerFailure(context)).resolves.toEqual({
      emailAttempts: 0,
      ipAttempts: 0,
      retryAfterSeconds: 0,
    });
  });
});
