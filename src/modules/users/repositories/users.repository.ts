import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

@Injectable()
export class UsersRepository {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) { }

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

  async update(
    userId: string,
    updateData: Partial<User> | { $unset: Record<string, unknown> },
  ): Promise<User | null> {
    return await this.userModel
      .findByIdAndUpdate(userId, updateData, { new: true })
      .exec();
  }

  // 📢 Thêm hàm `findAll` để trả về tất cả người dùng
  async findAll(): Promise<User[]> {
    return await this.userModel.find().exec();
  }

  async findAllPaginated(page: number, limit: number): Promise<PaginatedUsersResult> {
    const skip = (page - 1) * limit;
    const projection = '_id email role status fullName avatar createdAt updatedAt';

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

  // 📢 Thêm hàm `delete` để xóa người dùng
  async delete(userId: string): Promise<User | null> {
    return await this.userModel.findByIdAndDelete(userId).exec();
  }
}
