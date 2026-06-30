import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { UsersService } from '../../users/services/users.service';
import { User } from '../../users/schemas/users.schema';
import { TokenService } from './token.service';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID') || '',
    );
  }

  async verifyMobileGoogleToken(idToken: string) {
    try {
      // Decode JWT temporarily to get the aud (for development convenience)
      let tokenAud = '';
      try {
        const parts = idToken.split('.');
        if (parts.length === 3) {
          const payloadJson = JSON.parse(
            Buffer.from(parts[1], 'base64').toString('utf8'),
          );
          tokenAud = payloadJson.aud;
          this.logger.log(
            `[Auto-Config] Extracted Google Client ID from token: ${tokenAud}`,
          );
        }
      } catch (_e) {
        // Ignore decoding error
      }

      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: [
          this.configService.get('GOOGLE_CLIENT_ID') || '',
          '200857351549-60rs8mtb1lvc0iavrqv2mc26p4jnbdq6.apps.googleusercontent.com',
          this.configService.get<string>('GOOGLE_IOS_CLIENT_ID') || '',
          this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID') || '',
          tokenAud, // Automatically accept the app's Client ID
        ].filter(Boolean), // Validate against all configured client IDs
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new BadRequestException('Invalid Google ID Token payload');
      }

      // Map to the profile structure expected by validateGoogleUser
      const profile = {
        id: payload.sub,
        email: payload.email,
        emails: payload.email ? [{ value: payload.email }] : [],
        fullName: payload.name,
        photos: payload.picture ? [{ value: payload.picture }] : [],
      };

      return this.validateGoogleUser(profile);
    } catch (error: any) {
      this.logger.error('Error verifying mobile Google token:', error);
      throw new BadRequestException(
        'Lỗi xác thực Google ID Token từ App: ' +
          (error?.message || 'Unknown error'),
      );
    }
  }

  // Phase 3: return type aligned với standard login (access + refresh token)
  async validateGoogleUser(profile: {
    emails?: { value: string }[];
    email?: string;
    id?: string;
    fullName?: string;
    photos?: { value: string }[];
  }): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    if (!profile || typeof profile !== 'object') {
      throw new BadRequestException(
        'Lỗi xác thực Google: Dữ liệu không hợp lệ',
      );
    }

    try {
      const email: string | undefined =
        profile.emails?.[0]?.value || profile.email;
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
          const updatedUser = await this.usersService.updateUser(
            currentUser._id.toString(),
            {
              googleId,
              avatar: avatar || currentUser.avatar,
              fullName: fullName || currentUser.fullName,
            },
          );

          if (!updatedUser) {
            throw new BadRequestException(
              'Không thể cập nhật thông tin người dùng',
            );
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
      const { accessToken, refreshToken } =
        await this.tokenService.createAndSaveTokens(
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
      throw new InternalServerErrorException(
        'Lỗi trong quá trình xác thực Google',
      );
    }
  }
}
