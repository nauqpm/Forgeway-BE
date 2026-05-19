// users.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import type { SanitizedUserRecord } from '../repositories/users.repository';
import { User } from '../schemas/users.schema';
import { CreateUsersDto } from '../dtos/create-users.dto';
import { UpdateUsersDto } from '../dtos/update-users.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) { }

  // 📢 Lấy thông tin người dùng theo ID
  async getUserById(id: string): Promise<User> {
    console.log('🔍 ID được truyền vào:', id);
    const user = await this.usersRepository.findById(id);
    if (!user) {
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
    // Hash mật khẩu nếu có
    if (userData.password) {
      const salt = await bcrypt.genSalt();
      userData.password = await bcrypt.hash(userData.password, salt);
    }

    return await this.usersRepository.create(userData);
  }

  // 📢 Cập nhật thông tin người dùng
  async updateUser(userId: string, updateData: UpdateUsersDto | { $unset: Record<string, unknown> }, isPasswordHashed: boolean = false): Promise<User> {
    // Only hash password if updateData is UpdateUsersDto and has password field
    if ('password' in updateData && !isPasswordHashed) {
      const salt = await bcrypt.genSalt();
      (updateData as UpdateUsersDto).password = await bcrypt.hash((updateData as UpdateUsersDto).password!, salt);
    }

    const updatedUser = await this.usersRepository.update(userId, updateData);
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }
    return updatedUser;
  }

  // 📢 Lấy danh sách tất cả người dùng
  async getAllUsers(): Promise<User[]> {
    return await this.usersRepository.findAll();
  }

  async getUsersPage(page: number, limit: number): Promise<{
    data: SanitizedUserRecord[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.floor(limit))) : 20;
    const { users, total } = await this.usersRepository.findAllPaginated(safePage, safeLimit);

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
