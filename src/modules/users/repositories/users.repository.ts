import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/users.schema';
import { BaseRepository } from '../../../shared/repositories/base.repository';

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

export interface UserSearchRecord {
  _id: unknown;
  fullName?: string;
  email?: string;
  phone?: string;
  avatar?: string;
}

type UserUpdatePayload =
  | Partial<User>
  | { $unset: Record<string, unknown> }
  | { $set: Record<string, unknown>; $unset?: Record<string, unknown> };

@Injectable()
export class UsersRepository extends BaseRepository<UserDocument> {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super(userModel);
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async create(userData: Partial<User>): Promise<UserDocument> {
    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  async update(
    userId: string,
    updateData: UserUpdatePayload,
  ): Promise<UserDocument | null> {
    return await this.userModel
      .findByIdAndUpdate(userId, updateData, { new: true })
      .exec();
  }

  /**
   * Partial update using $set to avoid overwriting unrelated fields.
   */
  async updatePassword(
    userId: string,
    hashedPassword: string,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { password: hashedPassword } },
        { new: true },
      )
      .exec();
  }

  // 📢 Thêm hàm `findAll` để trả về tất cả người dùng
  async findAll(): Promise<UserDocument[]> {
    return await this.userModel.find().exec();
  }

  async findAllPaginated(
    page: number,
    limit: number,
  ): Promise<PaginatedUsersResult> {
    const projection =
      '_id email role status fullName avatar createdAt updatedAt';

    const result = await this.paginate(
      {},
      {
        page,
        limit,
        projection,
        sort: { createdAt: -1 },
        lean: true,
      },
    );

    return {
      users: result.items as unknown as SanitizedUserRecord[],
      total: result.total,
    };
  }

  async search(
    query: string,
    excludeUserId: string,
    limit: number,
  ): Promise<UserSearchRecord[]> {
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'i');

    return this.userModel
      .find({
        _id: { $ne: new Types.ObjectId(excludeUserId) },
        $or: [{ fullName: regex }, { email: regex }, { phone: regex }],
      })
      .select('_id fullName email phone avatar')
      .limit(limit)
      .lean<UserSearchRecord[]>()
      .exec();
  }

  async findByIds(ids: string[]): Promise<UserDocument[]> {
    return this.userModel
      .find({ _id: { $in: ids.map(id => new Types.ObjectId(id)) } })
      .select('_id email fullName avatar role status createdAt updatedAt phone')
      .exec();
  }

  async findAllIds(): Promise<string[]> {
    const docs = await this.userModel.find({}, '_id').lean().exec();
    return docs.map(d => d._id.toString());
  }

  // 📢 Thêm hàm `delete` để xóa người dùng
  async delete(userId: string): Promise<UserDocument | null> {
    return await this.userModel.findByIdAndDelete(userId).exec();
  }
}
