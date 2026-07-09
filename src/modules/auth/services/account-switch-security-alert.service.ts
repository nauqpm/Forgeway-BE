import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class AccountSwitchSecurityAlertService {
  private readonly logger = new Logger(AccountSwitchSecurityAlertService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendTargetLockoutEmail(context: {
    targetEmail: string;
    ip?: string;
    deviceId?: string;
  }): Promise<boolean> {
    try {
      await this.mailerService.sendMail({
        to: context.targetEmail,
        subject: 'Security alert: account temporarily locked',
        template: './account-switch-lockout',
        context: {
          occurredAt: new Date().toISOString(),
          ip: context.ip ?? 'unknown',
          deviceId: context.deviceId ?? 'unknown',
        },
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Account switch lockout email failed: ${message}`);
      return false;
    }
  }
}
