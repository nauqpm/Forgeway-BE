import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from '../repositories/users.repository';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';

@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD');
    const adminFullName = this.configService.get<string>('ADMIN_FULL_NAME');

    if (!adminEmail || !adminPassword) {
      this.logger.warn(
        'ADMIN_EMAIL or ADMIN_PASSWORD not configured in .env. Skipping admin seed.',
      );
      return;
    }

    const existing = await this.usersRepository.findByEmail(adminEmail);
    if (existing) {
      if (existing.role === GLOBAL_ROLES.SUPER_ADMIN) {
        this.logger.log(`Admin account already exists: ${adminEmail}`);
      } else {
        this.logger.warn(
          `User ${adminEmail} exists but has role "${existing.role}". ` +
          `To promote to super_admin, update the role manually in the database.`,
        );
      }
      return;
    }

    try {
      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash(adminPassword, salt);

      const admin = await this.usersRepository.create({
        email: adminEmail,
        password: hashedPassword,
        fullName: adminFullName || 'System Admin',
        role: GLOBAL_ROLES.SUPER_ADMIN,
        status: 'active',
      });

      this.logger.log(
        `Admin account created successfully: ${adminEmail} (role: ${GLOBAL_ROLES.SUPER_ADMIN})`,
      );
    } catch (error) {
      this.logger.error(`Failed to create admin account: ${error}`);
    }
  }
}
