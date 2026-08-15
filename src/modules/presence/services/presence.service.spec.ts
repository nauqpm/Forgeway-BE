import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PresenceService } from './presence.service';
import { PresenceStateService } from './presence-state.service';
import { PresenceConfig } from '../presence.config';
import { User } from '../../users/schemas/users.schema';

const makeStateService = (): jest.Mocked<PresenceStateService> =>
  ({
    isAvailable: jest.fn().mockReturnValue(true),
    registerConn: jest.fn().mockResolvedValue(undefined),
    removeConn: jest.fn().mockResolvedValue(undefined),
    pruneExpiredUserConns: jest.fn().mockResolvedValue(undefined),
    connCount: jest.fn().mockResolvedValue(0),
    setGrace: jest.fn().mockResolvedValue(undefined),
    hasGrace: jest.fn().mockResolvedValue(false),
    clearGrace: jest.fn().mockResolvedValue(undefined),
    claimOffWriteLock: jest.fn().mockResolvedValue(true),
    claimSweepLock: jest.fn().mockResolvedValue(true),
    getExpiredConns: jest.fn().mockResolvedValue([]),
    removeExpiredConns: jest.fn().mockResolvedValue(undefined),
    setLastSeenCache: jest.fn().mockResolvedValue(undefined),
    getLastSeenCache: jest.fn().mockResolvedValue(null),
    setInvisibleCache: jest.fn().mockResolvedValue(undefined),
    getInvisibleCache: jest.fn().mockResolvedValue(false),
    invalidateInvisibleCache: jest.fn().mockResolvedValue(undefined),
    getConnScore: jest.fn().mockResolvedValue(null),
  }) as unknown as jest.Mocked<PresenceStateService>;

const makeConfig = (): PresenceConfig =>
  ({
    heartbeatIntervalMs: 25_000,
    connTtlMs: 90_000,
    offlineGraceMs: 100,
    sweepIntervalMs: 10_000,
    maxSubscriptions: 500,
    batchMaxIds: 100,
  }) as PresenceConfig;

const makeUserModel = () => ({
  findByIdAndUpdate: jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
});

describe('PresenceService', () => {
  let service: PresenceService;
  let stateService: jest.Mocked<PresenceStateService>;
  let userModel: ReturnType<typeof makeUserModel>;
  let mockServer: { to: jest.Mock };

  const bindMockServer = () => {
    mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
    service.bindServer(mockServer as any);
  };

  beforeEach(async () => {
    stateService = makeStateService();
    userModel = makeUserModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresenceService,
        { provide: PresenceStateService, useValue: stateService },
        { provide: PresenceConfig, useValue: makeConfig() },
        { provide: getModelToken(User.name), useValue: userModel },
      ],
    }).compile();

    service = module.get<PresenceService>(PresenceService);
    bindMockServer();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('registerConnection', () => {
    it('broadcasts online when first connection and no grace', async () => {
      stateService.hasGrace.mockResolvedValue(false);
      stateService.connCount.mockResolvedValue(1);

      await service.registerConnection('user1', 'socket1');

      expect(stateService.registerConn).toHaveBeenCalledWith(
        'user1',
        'socket1',
        90_000,
      );
      expect(mockServer.to).toHaveBeenCalledWith(
        expect.stringContaining('user1'),
      );
    });

    it('does NOT broadcast online when second socket connects (count > 1)', async () => {
      stateService.hasGrace.mockResolvedValue(false);
      stateService.connCount.mockResolvedValue(2);

      await service.registerConnection('user1', 'socket2');

      expect(mockServer.to).not.toHaveBeenCalled();
    });

    it('clears grace and suppresses online broadcast when reconnecting within grace', async () => {
      stateService.hasGrace.mockResolvedValue(true);

      await service.registerConnection('user1', 'socket1');

      expect(stateService.clearGrace).toHaveBeenCalledWith('user1');
      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });

  describe('registerDisconnection', () => {
    it('sets grace and does NOT broadcast offline immediately when conn drops to 0', async () => {
      stateService.connCount.mockResolvedValue(0);

      await service.registerDisconnection('user1', 'socket1');

      expect(stateService.setGrace).toHaveBeenCalledWith('user1', 100);
      expect(mockServer.to).not.toHaveBeenCalled();
    });

    it('does NOT set grace when other connections remain', async () => {
      stateService.connCount.mockResolvedValue(1);

      await service.registerDisconnection('user1', 'socket1');

      expect(stateService.setGrace).not.toHaveBeenCalled();
      expect(mockServer.to).not.toHaveBeenCalled();
    });

    it('broadcasts offline after grace expires when no reconnection', async () => {
      jest.useFakeTimers();
      stateService.connCount.mockResolvedValue(0);
      stateService.claimOffWriteLock.mockResolvedValue(true);

      await service.registerDisconnection('user1', 'socket1');

      await jest.runAllTimersAsync();

      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith('user1', {
        $set: { lastSeenAt: expect.any(Date) },
      });
      expect(mockServer.to).toHaveBeenCalledWith(
        expect.stringContaining('user1'),
      );
    });

    it('does NOT broadcast offline after grace if conn count > 0 (reconnect happened)', async () => {
      jest.useFakeTimers();
      stateService.connCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

      await service.registerDisconnection('user1', 'socket1');

      await jest.runAllTimersAsync();

      expect(mockServer.to).not.toHaveBeenCalled();
      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('does NOT write Mongo or broadcast if offwrite lock is not claimed', async () => {
      jest.useFakeTimers();
      stateService.connCount.mockResolvedValue(0);
      stateService.claimOffWriteLock.mockResolvedValue(false);

      await service.registerDisconnection('user1', 'socket1');

      await jest.runAllTimersAsync();

      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });

  describe('heartbeat', () => {
    it('refreshes connection TTL in Redis', async () => {
      await service.heartbeat('user1', 'socket1');

      expect(stateService.registerConn).toHaveBeenCalledWith(
        'user1',
        'socket1',
        90_000,
      );
    });

    it('no-ops when Redis is unavailable', async () => {
      stateService.isAvailable.mockReturnValue(false);

      await service.heartbeat('user1', 'socket1');

      expect(stateService.registerConn).not.toHaveBeenCalled();
    });
  });

  describe('handleExpiredConn (sweeper integration)', () => {
    it('processes expired connection when score is expired (null)', async () => {
      stateService.getConnScore.mockResolvedValue(null);
      stateService.connCount.mockResolvedValue(0);

      await service.handleExpiredConn('user1', 'socket1', Date.now());

      expect(stateService.removeConn).toHaveBeenCalledWith('user1', 'socket1');
      expect(stateService.setGrace).toHaveBeenCalled();
    });

    it('skips removal when heartbeat refreshed score (score > sweepTime)', async () => {
      const sweepTime = Date.now();
      stateService.getConnScore.mockResolvedValue(sweepTime + 30_000);

      await service.handleExpiredConn('user1', 'socket1', sweepTime);

      expect(stateService.removeConn).not.toHaveBeenCalled();
      expect(stateService.setGrace).not.toHaveBeenCalled();
    });
  });
});
