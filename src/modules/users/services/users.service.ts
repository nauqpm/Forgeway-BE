// users.service.ts
import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import type { SanitizedUserRecord } from '../repositories/users.repository';
import { User } from '../schemas/users.schema';
import { CreateUsersDto } from '../dtos/create-users.dto';
import { UpdateUsersDto } from '../dtos/update-users.dto';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { PASSWORD_POLICY } from '../../../common/constants/password-policy.constants';

export interface LoginFailureState {
  failedAttempts: number;
  isLocked: boolean;
  lockedUntil?: string;
  remainingAttempts: number;
  maxAttempts: number;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly usersRepository: UsersRepository) {}

  async getUserById(id: string): Promise<User> {
    this.logger.debug(`Fetching user by ID: ${id}`);
    const user = await this.usersRepository.findById(id);
    if (!user) {
      this.logger.warn(`User not found with ID: ${id}`);
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // 📢 Tìm người dùng bằng email
  async findByEmail(email: string): Promise<User | null> {
    return await this.usersRepository.findByEmail(email);
  }

  async resetLoginFailures(userId: string): Promise<void> {
    await this.usersRepository.update(userId, {
      $set: { failedLoginAttempts: 0 },
      $unset: { lockoutUntil: 1 },
    });
  }

  async registerFailedLoginAttempt(userId: string): Promise<LoginFailureState> {
    const maxAttempts = PASSWORD_POLICY.maxFailedAttempts;

    // Use atomic $inc to prevent race conditions from concurrent requests
    const updatedUser = await this.usersRepository.incrementFailedLoginAttempts(userId);
    const currentAttempts = updatedUser?.failedLoginAttempts ?? 0;
    const isLocked = currentAttempts >= maxAttempts;

    if (isLocked) {
      const lockedUntil = new Date(Date.now() + PASSWORD_POLICY.lockoutDurationMs);
      await this.usersRepository.setLockout(userId, lockedUntil);

      return {
        failedAttempts: currentAttempts,
        isLocked: true,
        lockedUntil: lockedUntil.toISOString(),
        remainingAttempts: 0,
        maxAttempts,
      };
    }

    return {
      failedAttempts: currentAttempts,
      isLocked: false,
      remainingAttempts: maxAttempts - currentAttempts,
      maxAttempts,
    };
  }

  async createUser(userData: CreateUsersDto): Promise<User> {
    this.logger.log(`Creating new user with email: ${userData.email}`);
    if (userData.password) {
      const salt = await bcrypt.genSalt();
      userData.password = await bcrypt.hash(userData.password, salt);
    }

    try {
      const user = await this.usersRepository.create(userData);
      this.logger.log(`User created successfully: ${user.email}`);
      return user;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create user (${userData.email}): ${message}`);
      throw error;
    }
  }

  async updateUser(
    userId: string,
    updateData: UpdateUsersDto | { $unset: Record<string, unknown> },
    isPasswordHashed = false,
  ): Promise<User> {
    this.logger.log(`Updating user info for User ID: ${userId}`);

    if (this.isPasswordUpdate(updateData) && !isPasswordHashed) {
      await this.handlePasswordUpdate(userId, updateData);
    }

    const updatedUser = await this.usersRepository.update(userId, updateData);

    if (!updatedUser) {
      this.logger.warn(`User not found: ${userId}`);
      throw new NotFoundException('User not found');
    }

    return updatedUser;
  }

  private isPasswordUpdate(data: UpdateUsersDto | { $unset: Record<string, unknown> }): data is UpdateUsersDto {
    return 'password' in data && !!data.password;
  }

  private async handlePasswordUpdate(userId: string, updateData: UpdateUsersDto): Promise<void> {
    this.logger.log(`Updating password for User ID: ${userId}`);

    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!updateData.currentPassword) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (!PASSWORD_POLICY.noWhitespacePattern.test(updateData.password!)) {
      throw new BadRequestException(PASSWORD_POLICY.noWhitespaceMessage);
    }

    const isMatch = await bcrypt.compare(updateData.currentPassword, user.password);

    if (!isMatch) {
      throw new BadRequestException('Current password is incorrect');
    }

    updateData.password = await bcrypt.hash(updateData.password!, 10);
  }

  async getAllUsers(): Promise<User[]> {
    return await this.usersRepository.findAll();
  }

  async searchUsers(query: string, excludeUserId: string): Promise<User[]> {
    const users = await this.usersRepository.search(query, excludeUserId);
    return users;
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

  async updateUserRole(userId: string, role: string): Promise<User> {
    this.logger.log(`Updating role for User ID: ${userId} to ${role}`);
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const updated = await this.usersRepository.update(userId, { role });
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    this.logger.log(`Role updated for user ${userId} to ${role}`);
    return updated;
  }

  async updateUserStatus(userId: string, status: string): Promise<User> {
    this.logger.log(`Updating status for User ID: ${userId} to ${status}`);
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const updated = await this.usersRepository.update(userId, { status });
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    this.logger.log(`Status updated for user ${userId} to ${status}`);
    return updated;
  }

  async updatePassword(email: string, newPassword: string) {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Use partial update with $set to avoid overwriting unrelated fields
    await this.usersRepository.updatePassword(user._id.toString(), newPassword);

    return {
      success: true,
      message: 'Password updated successfully',
    };
  }
}
