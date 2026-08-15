import { Test, TestingModule } from '@nestjs/testing';
import { PresenceStateService } from './presence-state.service';
import { RedisService } from '../../../infra/redis/redis.service';

describe('PresenceStateService (MemoryFallback)', () => {
  let service: PresenceStateService;

  beforeEach(async () => {
    const redisServiceMock = {
      createClient: jest.fn().mockResolvedValue(null), // Force fallback mode
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresenceStateService,
        { provide: RedisService, useValue: redisServiceMock },
      ],
    }).compile();

    service = module.get<PresenceStateService>(PresenceStateService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should be in fallback mode', () => {
    expect(service.isAvailable()).toBe(true);
  });

  it('should store and retrieve simple values (lastSeen, invisible)', async () => {
    await service.setLastSeenCache('u1', '2023-01-01T00:00:00.000Z');
    expect(await service.getLastSeenCache('u1')).toBe(
      '2023-01-01T00:00:00.000Z',
    );

    await service.setInvisibleCache('u1', true, 10000);
    expect(await service.getInvisibleCache('u1')).toBe(true);

    await service.invalidateInvisibleCache('u1');
    expect(await service.getInvisibleCache('u1')).toBeNull();
  });

  it('should handle batch fetch methods in memory fallback', async () => {
    await service.setLastSeenCache('u1', 'iso1');
    await service.setLastSeenCache('u2', 'iso2');

    const lastSeens = await service.getBatchLastSeenCache(['u1', 'u2', 'u3']);
    expect(lastSeens).toEqual(['iso1', 'iso2', null]);

    await service.setInvisibleCache('u1', true, 10000);
    await service.setInvisibleCache('u3', false, 10000);

    const invisibles = await service.getBatchInvisibleCache(['u1', 'u2', 'u3']);
    expect(invisibles).toEqual([true, null, false]);
  });

  it('should register connections and count them', async () => {
    await service.registerConn('u1', 'sock1', 10000);
    await service.registerConn('u1', 'sock2', 10000);
    await service.registerConn('u2', 'sock3', 10000);

    expect(await service.connCount('u1')).toBe(2);
    expect(await service.connCount('u2')).toBe(1);

    const batchCount = await service.getBatchConnCount(['u1', 'u2', 'u3']);
    expect(batchCount).toEqual([2, 1, 0]);

    await service.removeConn('u1', 'sock1');
    expect(await service.connCount('u1')).toBe(1);
  });

  it('should handle grace periods', async () => {
    await service.setGrace('u1', 10000);
    expect(await service.hasGrace('u1')).toBe(true);
    expect(await service.getBatchHasGrace(['u1', 'u2'])).toEqual([true, false]);

    await service.clearGrace('u1');
    expect(await service.hasGrace('u1')).toBe(false);
  });

  it('should handle locking (NX)', async () => {
    const lock1 = await service.claimSweepLock(10000);
    const lock2 = await service.claimSweepLock(10000);

    expect(lock1).toBe(true);
    expect(lock2).toBe(false);

    const offWrite1 = await service.claimOffWriteLock('u1', 10000);
    const offWrite2 = await service.claimOffWriteLock('u1', 10000);

    expect(offWrite1).toBe(true);
    expect(offWrite2).toBe(false);
  });
});
