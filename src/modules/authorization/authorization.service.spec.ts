import { PERMISSIONS } from './authorization.constants';
import { AuthorizationService } from './authorization.service';
import type {
  AuthorizationRequest,
  AuthorizationResult,
} from './authorization.types';

const request: AuthorizationRequest = {
  userId: 'user-1',
  permission: PERMISSIONS.TASK_VIEW,
  resource: { type: 'task', id: 'task-1', workspaceId: 'workspace-1' },
};

const result = (
  source: AuthorizationResult['source'],
  decision: AuthorizationResult['decision'],
): AuthorizationResult => ({
  decision,
  allowed: decision === 'allow',
  reasonCode:
    decision === 'allow'
      ? 'ALLOW_PERMISSION_GRANTED'
      : 'DENY_PERMISSION_MISSING',
  matchedPermissions: [],
  matchedRoles: [],
  restrictions: [],
  source,
});

describe('AuthorizationService', () => {
  const legacyAdapter = { authorize: jest.fn() };
  const resolver = { authorize: jest.fn() };
  const divergenceLogger = {
    divergence: jest.fn(),
    shadowError: jest.fn(),
  };
  const metrics = {
    decision: jest.fn(),
    divergence: jest.fn(),
    resolverLatency: jest.fn(),
    shadowError: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('keeps the legacy decision in shadow mode and records a redacted divergence', async () => {
    legacyAdapter.authorize.mockResolvedValue(result('legacy', 'allow'));
    resolver.authorize.mockResolvedValue(result('resolver', 'deny'));

    const service = new AuthorizationService(
      legacyAdapter,
      resolver,
      divergenceLogger,
      metrics,
      'shadow',
    );

    await expect(service.authorize(request)).resolves.toMatchObject({
      source: 'legacy',
      allowed: true,
    });
    expect(divergenceLogger.divergence).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          userId: 'user-1',
          permission: PERMISSIONS.TASK_VIEW,
        }),
      }),
    );
    expect(
      divergenceLogger.divergence.mock.calls[0][0].request,
    ).not.toHaveProperty('body');
    expect(metrics.divergence).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'shadow',
        permission: PERMISSIONS.TASK_VIEW,
      }),
    );
  });

  it('keeps a valid legacy result when the shadow resolver fails', async () => {
    legacyAdapter.authorize.mockResolvedValue(result('legacy', 'allow'));
    resolver.authorize.mockRejectedValue(new Error('database unavailable'));

    const service = new AuthorizationService(
      legacyAdapter,
      resolver,
      divergenceLogger,
      metrics,
      'shadow',
    );

    await expect(service.authorize(request)).resolves.toMatchObject({
      source: 'legacy',
      allowed: true,
    });
    expect(divergenceLogger.shadowError).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ permission: PERMISSIONS.TASK_VIEW }),
      }),
    );
  });

  it.each([
    ['legacy', 'legacy'],
    ['enforce', 'resolver'],
    ['invalid', 'legacy'],
  ])('uses %s mode safely', async (mode, expectedSource) => {
    legacyAdapter.authorize.mockResolvedValue(result('legacy', 'allow'));
    resolver.authorize.mockResolvedValue(result('resolver', 'deny'));

    const service = new AuthorizationService(
      legacyAdapter,
      resolver,
      divergenceLogger,
      metrics,
      mode,
    );

    await expect(service.authorize(request)).resolves.toMatchObject({
      source: expectedSource,
    });
    if (mode === 'enforce') {
      expect(legacyAdapter.authorize).not.toHaveBeenCalled();
    }
  });
});
