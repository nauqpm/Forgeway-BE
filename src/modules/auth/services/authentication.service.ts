import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { USER_STATUSES } from '../../../common/constants/user-status.constants';
import { UsersService } from '../../users/services/users.service';
import { VerifyType } from '../../verify/dtos/verify.dto';
import { VerifyService } from '../../verify/services/verify.service';
import { LoginDto, RegisterDto } from '../dtos/auth.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthenticationService {
  private readonly logger = new Logger(AuthenticationService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly verifyService: VerifyService,
  ) {}

  async register(registerDto: RegisterDto) {
    this.logger.log(`Bắt đầu quy trình đăng ký cho email: ${registerDto.email}`);
    try {
      const genericResponse = {
        success: true,
        message: 'Nếu thông tin hợp lệ, vui lòng kiểm tra email để hoàn tất đăng ký.',
        email: registerDto.email,
      };

      const existingUser = await this.usersService.findByEmail(registerDto.email);
      if (existingUser) {
        this.logger.warn(`Đăng ký thất bại: Email ${registerDto.email} đã tồn tại trong hệ thống.`);
        return genericResponse;
      }

      const newUser = await this.usersService.createUser({
        email: registerDto.email,
        password: registerDto.password,
        role: GLOBAL_ROLES.USER,
        status: USER_STATUSES.PENDING_VERIFICATION,
      });
      this.logger.log(`Tạo người dùng thành công: ${newUser.email} (ID: ${newUser._id})`);

      await this.verifyService.sendVerificationEmail(registerDto.email);
      this.logger.log(`Đã gửi email xác thực đến: ${registerDto.email}`);

      return genericResponse;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Lỗi nghiêm trọng trong quá trình đăng ký (${registerDto.email}): ${err.message}`, err.stack);
      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    this.logger.log(`Yêu cầu đăng nhập từ email: ${loginDto.email}`);
    try {
      const user = await this.usersService.findByEmail(loginDto.email);
      if (!user) {
        this.logger.warn(`Đăng nhập thất bại: Không tìm thấy email ${loginDto.email}`);
        throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
      }

      if (!user.password) {
        this.logger.warn(`Đăng nhập thất bại: Tài khoản ${loginDto.email} sử dụng Google OAuth`);
        throw new UnauthorizedException(
          'Tài khoản này được đăng ký qua Google. Vui lòng đăng nhập bằng Google.',
        );
      }

      const isPasswordValid = await this.passwordService.verifyPassword(
        loginDto.password,
        user.password,
      );
      if (!isPasswordValid) {
        this.logger.warn(`Đăng nhập thất bại: Sai mật khẩu cho email ${loginDto.email}`);
        throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
      }

      if (user.status !== USER_STATUSES.ACTIVE) {
        this.logger.warn(`Đăng nhập thất bại: Tài khoản ${loginDto.email} chưa được kích hoạt (Status: ${user.status})`);
        throw new UnauthorizedException('Vui lòng xác thực email trước khi đăng nhập');
      }

      const { accessToken, refreshToken } = await this.tokenService.createAndSaveTokens(
        user._id.toString(),
        user.email,
        user.role,
        user.fullName,
        user.avatar,
      );

      this.logger.log(`Đăng nhập thành công: ${user.email} (ID: ${user._id})`);

      return {
        success: true,
        message: 'Đăng nhập thành công',
        tokens: { accessToken, refreshToken },
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          fullName: user.fullName,
          avatar: user.avatar,
        },
      };
    } catch (error: unknown) {
      const err = error as Error;
      if (!(error instanceof UnauthorizedException)) {
        this.logger.error(`Lỗi hệ thống khi đăng nhập (${loginDto.email}): ${err.message}`, err.stack);
      }
      throw error;
    }
  }

  async verifyRegistrationEmail(email: string, code: string) {
    this.logger.log(`Bắt đầu xác thực email đăng ký cho: ${email}`);
    await this.verifyService.verifyCode(email, code, VerifyType.VERIFICATION);

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      this.logger.error(`Xác thực thành công nhưng không tìm thấy User với email: ${email}`);
      throw new UnauthorizedException('Mã xác thực không hợp lệ hoặc đã hết hạn');
    }

    if (user.status !== USER_STATUSES.ACTIVE) {
      await this.usersService.updateUser(user._id.toString(), { status: USER_STATUSES.ACTIVE });
      this.logger.log(`Tài khoản ${email} đã được kích hoạt thành công (Status -> ACTIVE)`);
    } else {
      this.logger.log(`Tài khoản ${email} đã ở trạng thái ACTIVE từ trước.`);
    }

    return {
      success: true,
      message: 'Xác thực email thành công',
    };
  }

  async resendRegistrationVerification(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (user && user.status === USER_STATUSES.PENDING_VERIFICATION) {
      await this.verifyService.sendVerificationEmail(email);
    }

    return {
      success: true,
      message: 'Nếu email cần xác thực, hướng dẫn mới đã được gửi.',
    };
  }
}
