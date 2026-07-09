import { AccountSwitchSecurityAlertService } from './account-switch-security-alert.service';

describe('AccountSwitchSecurityAlertService', () => {
  const mailerService = {
    sendMail: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends lockout email without actor identity in the body context', async () => {
    mailerService.sendMail.mockResolvedValueOnce(undefined);
    const service = new AccountSwitchSecurityAlertService(
      mailerService as any,
    );

    const sent = await service.sendTargetLockoutEmail({
      targetEmail: 'target@example.com',
      ip: '203.0.113.10',
      deviceId: 'device-123',
    });

    expect(sent).toBe(true);
    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'target@example.com',
        template: './account-switch-lockout',
        context: expect.objectContaining({
          ip: '203.0.113.10',
          deviceId: 'device-123',
        }),
      }),
    );
    const bodyContext = mailerService.sendMail.mock.calls[0][0].context;
    expect(bodyContext).not.toHaveProperty('actorUserId');
    expect(bodyContext).not.toHaveProperty('fromUserId');
    expect(bodyContext).not.toHaveProperty('fromEmail');
  });

  it('returns false when the lockout email fails', async () => {
    mailerService.sendMail.mockRejectedValueOnce(new Error('smtp down'));
    const service = new AccountSwitchSecurityAlertService(
      mailerService as any,
    );

    await expect(
      service.sendTargetLockoutEmail({
        targetEmail: 'target@example.com',
      }),
    ).resolves.toBe(false);
  });
});
