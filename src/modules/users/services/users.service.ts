// users.service.ts
import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import type { SanitizedUserRecord } from '../repositories/users.repository';
import { User } from '../schemas/users.schema';
import { CreateUsersDto } from '../dtos/create-users.dto';
import { UpdateUsersDto } from '../dtos/update-users.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly usersRepository: UsersRepository) {}

  // 📢 Lấy thông tin người dùng theo ID
  async getUserById(id: string): Promise<User> {
    this.logger.debug(`Đang tìm người dùng với ID: ${id}`);
    const user = await this.usersRepository.findById(id);
    if (!user) {
      this.logger.warn(`Không tìm thấy người dùng với ID: ${id}`);
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // 📢 Tìm người dùng bằng email
  async findByEmail(email: string): Promise<User | null> {
    return await this.usersRepository.findByEmail(email);
  }

  // 📢 Tạo người dùng mới
  async createUser(userData: CreateUsersDto): Promise<User> {
    this.logger.log(`Đang tạo người dùng mới với email: ${userData.email}`);
    // Hash mật khẩu nếu có
    if (userData.password) {
      const salt = await bcrypt.genSalt();
      userData.password = await bcrypt.hash(userData.password, salt);
    }

    try {
      const user = await this.usersRepository.create(userData);
      this.logger.log(`Đã tạo người dùng thành công: ${user.email}`);
      return user;
    } catch (error) {
      this.logger.error(`Lỗi khi tạo người dùng (${userData.email}):`, error);
      throw error;
    }
  }

  // 📢 Cập nhật thông tin người dùng
  async updateUser(
    userId: string,
    updateData: UpdateUsersDto | { $unset: Record<string, unknown> },
    isPasswordHashed = false,
  ): Promise<User> {
    this.logger.log(`Cập nhật thông tin cho User ID: ${userId}`);

    if (this.isPasswordUpdate(updateData) && !isPasswordHashed) {
      await this.handlePasswordUpdate(userId, updateData);
    }

    const updatedUser = await this.usersRepository.update(userId, updateData);

    if (!updatedUser) {
      this.logger.warn(`Không tìm thấy User ID: ${userId}`);
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    return updatedUser;
  }

  private isPasswordUpdate(
    data: UpdateUsersDto | { $unset: Record<string, unknown> },
  ): data is UpdateUsersDto {
    return 'password' in data && !!data.password;
  }

  private async handlePasswordUpdate(
    userId: string,
    updateData: UpdateUsersDto,
  ): Promise<void> {
    this.logger.log(`Cập nhật mật khẩu cho User ID: ${userId}`);
    this.logger.log(updateData, 'Update data');

    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    if (!updateData.currentPassword) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    // THAY VÌ LÀM NHƯ SAU THÌ RESET PASSWORK
    // OAuth account chưa có password
    // if (!user.password) {
    //   return;
    // }

    const isMatch = await bcrypt.compare(
      updateData.currentPassword,
      user.password,
    );

    if (!isMatch) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    updateData.password = await bcrypt.hash(updateData.password!, 10);
  }

  // 📢 Lấy danh sách tất cả người dùng
  async getAllUsers(): Promise<User[]> {
    return await this.usersRepository.findAll();
  }

  async getUsersPage(
    page: number,
    limit: number,
  ): Promise<{
    data: SanitizedUserRecord[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safeLimit = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.floor(limit)))
      : 20;
    const { users, total } = await this.usersRepository.findAllPaginated(
      safePage,
      safeLimit,
    );

    return {
      data: users,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  // 📢 Xóa người dùng bằng ID
  async deleteUser(userId: string): Promise<{ message: string }> {
    const deletedUser = await this.usersRepository.delete(userId);
    if (!deletedUser) {
      throw new NotFoundException('User not found');
    }
    return { message: 'User deleted successfully' };
  }

  /**
   * 🔄 Cập nhật mật khẩu cho người dùng
   */
  async updatePassword(email: string, newPassword: string) {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    user.password = newPassword;
    await this.usersRepository.update(user._id.toString(), user);

    return {
      success: true,
      message: 'Cập nhật mật khẩu thành công',
    };
  }
}
