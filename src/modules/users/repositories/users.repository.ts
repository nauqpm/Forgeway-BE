import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/users.schema';

export interface SanitizedUserRecord {
  _id: unknown;
  email: string;
  role: string;
  status: string;
  fullName?: string;
  avatar?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PaginatedUsersResult {
  users: SanitizedUserRecord[];
  total: number;
}

type UserUpdatePayload =
  | Partial<User>
  | { $unset: Record<string, unknown> }
  | { $set: Record<string, unknown>; $unset?: Record<string, unknown> };

@Injectable()
export class UsersRepository {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async create(userData: Partial<User>): Promise<User> {
    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  async update(userId: string, updateData: UserUpdatePayload): Promise<User | null> {
    return await this.userModel.findByIdAndUpdate(userId, updateData, { new: true }).exec();
  }

  async incrementFailedLoginAttempts(userId: string): Promise<User | null> {
    return this.userModel
      .findByIdAndUpdate(
        userId,
        { $inc: { failedLoginAttempts: 1 } },
        { new: true },
      )
      .exec();
  }

  async setLockout(userId: string, lockoutUntil: Date): Promise<User | null> {
    return this.userModel
      .findByIdAndUpdate(userId, { $set: { lockoutUntil } }, { new: true })
      .exec();
  }

  /**
   * Partial update using $set to avoid overwriting unrelated fields.
   */
  async updatePassword(
    userId: string,
    hashedPassword: string,
  ): Promise<User | null> {
    return this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { password: hashedPassword } },
        { new: true },
      )
      .exec();
  }

  // 📢 Thêm hàm `findAll` để trả về tất cả người dùng
  async findAll(): Promise<User[]> {
    return await this.userModel.find().exec();
  }

  async findAllPaginated(
    page: number,
    limit: number,
  ): Promise<PaginatedUsersResult> {
    const skip = (page - 1) * limit;
    const projection =
      '_id email role status fullName avatar createdAt updatedAt';

    const [users, total] = await Promise.all([
      this.userModel
        .find()
        .select(projection)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<SanitizedUserRecord[]>()
        .exec(),
      this.userModel.countDocuments().exec(),
    ]);

    return { users, total };
  }

  async search(query: string, excludeUserId: string): Promise<User[]> {
    const regex = new RegExp(query, 'i');
    return this.userModel
      .find({
        $and: [
          { _id: { $ne: new Types.ObjectId(excludeUserId) } },
          {
            $or: [{ fullName: regex }, { email: regex }, { phone: regex }],
          },
        ],
      })
      .select('_id email fullName avatar status')
      .limit(10)
      .exec();
  }

  async findByIds(ids: string[]): Promise<User[]> {
    return this.userModel
      .find({ _id: { $in: ids.map(id => new Types.ObjectId(id)) } })
      .select('_id email fullName avatar role status createdAt updatedAt phone')
      .lean()
      .exec();
  }

  // 📢 Thêm hàm `delete` để xóa người dùng
  async delete(userId: string): Promise<User | null> {
    return await this.userModel.findByIdAndDelete(userId).exec();
  }
}
