// users.service.ts
import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersRepository } from '../repositories/users.repository';
import type {
  SanitizedUserRecord,
  UserSearchRecord,
} from '../repositories/users.repository';
import { User } from '../schemas/users.schema';
import { CreateUsersDto } from '../dtos/create-users.dto';
import { UpdateUsersDto } from '../dtos/update-users.dto';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { PASSWORD_POLICY } from '../../../common/constants/password-policy.constants';
import { ErrorFactory } from '../../../common/factories/error.factory';

export interface UserSearchResult {
  id: string;
  fullName?: string;
  email?: string;
  phone?: string;
  avatar?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private cachedUserIds: string[] | null = null;
  private cacheTimestamp = 0;
  private readonly CACHE_TTL = 30_000; // 30 seconds cache TTL

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getUserById(id: string): Promise<User> {
    this.logger.debug(`Fetching user by ID: ${id}`);

    if (!Types.ObjectId.isValid(id)) {
      this.logger.warn(`Invalid user ID: ${id}`);
      throw new BadRequestException(ErrorFactory.invalidUserId());
    }

    const user = await this.usersRepository.findById(id);
    if (!user) {
      this.logger.warn(`User not found with ID: ${id}`);
      throw new NotFoundException(ErrorFactory.userNotFound(id));
    }
    return user;
  }

  // 📢 Tìm người dùng bằng email
  async findByEmail(email: string): Promise<User | null> {
    return await this.usersRepository.findByEmail(email);
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
      this.logger.error(
        `Failed to create user (${userData.email}): ${message}`,
      );
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
      throw new NotFoundException(ErrorFactory.userNotFound(userId));
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
    this.logger.log(`Updating password for User ID: ${userId}`);

    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new NotFoundException(ErrorFactory.userNotFound(userId));
    }

    if (!updateData.currentPassword) {
      throw new BadRequestException(ErrorFactory.currentPasswordIncorrect());
    }

    if (!PASSWORD_POLICY.noWhitespacePattern.test(updateData.password!)) {
      throw new BadRequestException(ErrorFactory.passwordHasWhitespace());
    }

    const isMatch = await bcrypt.compare(
      updateData.currentPassword,
      user.password,
    );

    if (!isMatch) {
      throw new BadRequestException(ErrorFactory.currentPasswordIncorrect());
    }

    updateData.password = await bcrypt.hash(updateData.password!, 10);
  }

  async getAllUsers(): Promise<User[]> {
    return await this.usersRepository.findAll();
  }

  async getAllUserIds(): Promise<string[]> {
    const now = Date.now();
    if (this.cachedUserIds && now - this.cacheTimestamp < this.CACHE_TTL) {
      return this.cachedUserIds;
    }
    const ids = await this.usersRepository.findAllIds();
    this.cachedUserIds = ids;
    this.cacheTimestamp = now;
    return ids;
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
      throw new NotFoundException(ErrorFactory.userNotFound(userId));
    }
    this.eventEmitter.emit('user.deleted', { userId });
    return { message: 'User deleted successfully' };
  }

  async updateUserRole(userId: string, role: string): Promise<User> {
    this.logger.log(`Updating role for User ID: ${userId} to ${role}`);
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(ErrorFactory.userNotFound(userId));
    }
    const updated = await this.usersRepository.update(userId, { role });
    if (!updated) {
      throw new NotFoundException(ErrorFactory.userNotFound(userId));
    }
    this.logger.log(`Role updated for user ${userId} to ${role}`);
    return updated;
  }

  async updateUserStatus(userId: string, status: string): Promise<User> {
    this.logger.log(`Updating status for User ID: ${userId} to ${status}`);
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(ErrorFactory.userNotFound(userId));
    }
    const updated = await this.usersRepository.update(userId, { status });
    if (!updated) {
      throw new NotFoundException(ErrorFactory.userNotFound(userId));
    }
    this.logger.log(`Status updated for user ${userId} to ${status}`);
    return updated;
  }

  async searchUsers(
    query: string,
    excludeUserId: string,
    limit = 20,
  ): Promise<UserSearchResult[]> {
    const users = await this.usersRepository.search(
      query,
      excludeUserId,
      limit,
    );
    return users.map(user => this.toUserSearchResult(user));
  }

  private toUserSearchResult(user: UserSearchRecord): UserSearchResult {
    const id =
      typeof user._id === 'object' &&
      user._id !== null &&
      'toString' in user._id
        ? user._id.toString()
        : String(user._id);

    return {
      id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
    };
  }

  async getUsersByIds(ids: string[]): Promise<User[]> {
    return this.usersRepository.findByIds(ids);
  }

  /**
   * 🔄 Cập nhật mật khẩu cho người dùng
   */
  async updatePassword(email: string, newPassword: string) {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundException(ErrorFactory.userNotFound(email));
    }

    // Use partial update with $set to avoid overwriting unrelated fields
    await this.usersRepository.updatePassword(user._id.toString(), newPassword);

    return {
      success: true,
      message: 'Password updated successfully',
    };
  }
}
