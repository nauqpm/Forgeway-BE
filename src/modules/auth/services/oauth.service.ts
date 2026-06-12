import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

import { UsersService } from '../../users/services/users.service';
import { User } from '../../users/schemas/users.schema';
import { TokenService } from './token.service';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
  ) {}

  // Phase 3: return type aligned với standard login (access + refresh token)
  async validateGoogleUser(profile: {
    emails?: { value: string }[];
    email?: string;
    id?: string;
    fullName?: string;
    photos?: { value: string }[];
  }): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    if (!profile || typeof profile !== 'object') {
      throw new BadRequestException('Lỗi xác thực Google: Dữ liệu không hợp lệ');
    }

    try {
      const email: string | undefined = profile.emails?.[0]?.value || profile.email;
      if (!email) {
        throw new BadRequestException('Không tìm thấy email từ Google');
      }

      const googleId: string = profile.id ?? '';
      if (!googleId) {
        throw new BadRequestException('Không tìm thấy Google ID');
      }

      const fullName: string = profile.fullName ?? '';
      const avatar: string = profile.photos?.[0]?.value ?? '';

      let currentUser = await this.usersService.findByEmail(email);

      if (currentUser) {
        if (!currentUser.googleId || currentUser.googleId !== googleId) {
          const updatedUser = await this.usersService.updateUser(currentUser._id.toString(), {
            googleId,
            avatar: avatar || currentUser.avatar,
            fullName: fullName || currentUser.fullName,
          });

          if (!updatedUser) {
            throw new BadRequestException('Không thể cập nhật thông tin người dùng');
          }

          currentUser = updatedUser;
        }
      } else {
        this.logger.log('🆕 Tạo user mới:', email);
        const newUser = await this.usersService.createUser({
          googleId,
          password: '',
          email,
          fullName,
          avatar,
          role: GLOBAL_ROLES.USER,
          status: 'active',
        });

        if (!newUser) {
          throw new BadRequestException('Không thể tạo user mới');
        }

        currentUser = newUser;
      }

      if (!currentUser) {
        throw new BadRequestException('Lỗi xử lý thông tin người dùng');
      }

      // Issue access+refresh pair — identical behavior (delegated)
      const { accessToken, refreshToken } = await this.tokenService.createAndSaveTokens(
        currentUser._id.toString(),
        currentUser.email,
        currentUser.role,
        currentUser.fullName,
        currentUser.avatar,
      );

      return { user: currentUser, accessToken, refreshToken };
    } catch (error) {
      this.logger.error('❌ Lỗi trong quá trình xác thực Google:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Lỗi trong quá trình xác thực Google');
    }
  }
}
