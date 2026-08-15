import { Test, TestingModule } from '@nestjs/testing';
import { PresenceQueryService } from './presence-query.service';
import { PresenceStateService } from './presence-state.service';
import { UsersRepository } from '../../users/repositories/users.repository';

describe('PresenceQueryService', () => {
  let service: PresenceQueryService;
  let stateService: jest.Mocked<Partial<PresenceStateService>>;
  let usersRepo: jest.Mocked<Partial<UsersRepository>>;

  beforeEach(async () => {
    stateService = {
      getInvisibleCache: jest.fn().mockResolvedValue(null),
      getLastSeenCache: jest.fn().mockResolvedValue(null),
      setInvisibleCache: jest.fn().mockResolvedValue(undefined),
      setLastSeenCache: jest.fn().mockResolvedValue(undefined),
      connCount: jest.fn().mockResolvedValue(0),
      hasGrace: jest.fn().mockResolvedValue(false),
    };

    usersRepo = {
      findById: jest.fn().mockResolvedValue({
        _id: 'user1',
        presenceInvisible: false,
        lastSeenAt: new Date('2025-01-01T00:00:00Z'),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresenceQueryService,
        { provide: PresenceStateService, useValue: stateService },
        { provide: UsersRepository, useValue: usersRepo },
      ],
    }).compile();

    service = module.get<PresenceQueryService>(PresenceQueryService);
  });

  describe('getPresence', () => {
    it('returns true online status if connections > 0', async () => {
      stateService.connCount = jest.fn().mockResolvedValue(2);
      const res = await service.getPresence('user1', 'viewer1');
      expect(res.status).toBe('online');
    });

    it('returns offline and null lastSeenAt if user is invisible and viewer is not self', async () => {
      stateService.connCount = jest.fn().mockResolvedValue(2);
      stateService.getInvisibleCache = jest.fn().mockResolvedValue(true);
      const res = await service.getPresence('user1', 'viewer1');
      expect(res.status).toBe('offline');
      expect(res.lastSeenAt).toBeNull();
    });

    it('returns actual status if user is invisible but viewer is self', async () => {
      stateService.connCount = jest.fn().mockResolvedValue(2);
      stateService.getInvisibleCache = jest.fn().mockResolvedValue(true);
      const res = await service.getPresence('user1', 'user1');
      expect(res.status).toBe('online');
    });

    it('hits DB and caches if Redis cache is miss', async () => {
      const res = await service.getPresence('user1', 'viewer1');
      expect(usersRepo.findById).toHaveBeenCalledWith('user1');
      expect(stateService.setInvisibleCache).toHaveBeenCalledWith(
        'user1',
        false,
        expect.any(Number),
      );
      expect(stateService.setLastSeenCache).toHaveBeenCalledWith(
        'user1',
        '2025-01-01T00:00:00.000Z',
      );
      expect(res.lastSeenAt).toBe('2025-01-01T00:00:00.000Z');
    });

    it('uses cached values directly', async () => {
      stateService.getInvisibleCache = jest.fn().mockResolvedValue(false);
      stateService.getLastSeenCache = jest
        .fn()
        .mockResolvedValue('2025-01-02T00:00:00.000Z');
      const res = await service.getPresence('user1', 'viewer1');
      expect(usersRepo.findById).not.toHaveBeenCalled();
      expect(res.lastSeenAt).toBe('2025-01-02T00:00:00.000Z');
    });
  });
});
