// auth/repositories/auth.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/users.schema';
import { RegisterDto } from '../dtos/auth.dto';
import { BaseRepository } from '../../../shared/repositories/base.repository';

@Injectable()
export class AuthRepository extends BaseRepository<UserDocument> {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super(userModel);
  }

  // 📢 Tạo người dùng mới khi đăng ký
  async createUser(registerDto: RegisterDto): Promise<UserDocument> {
    const newUser = new this.userModel(registerDto);
    return await newUser.save();
  }

  // 📢 Tìm người dùng bằng email để xác thực đăng nhập
  async findByEmail(email: string): Promise<UserDocument | null> {
    return await this.userModel.findOne({ email }).exec();
  }

  // 📢 Lấy thông tin người dùng bằng ID (Dùng trong xác thực JWT)
  async findById(id: string): Promise<UserDocument | null> {
    return await this.userModel.findById(id).exec();
  }

  // 📢 Cập nhật thông tin người dùng (ví dụ: đổi mật khẩu, cập nhật trạng thái)
  async updateUser(
    userId: string,
    updateData: Partial<User>,
  ): Promise<UserDocument | null> {
    return await this.userModel
      .findByIdAndUpdate(userId, updateData, { new: true })
      .exec();
  }

  // 📢 Lấy tất cả người dùng (Dành cho quản trị viên)
  async findAllUsers(): Promise<UserDocument[]> {
    return await this.userModel.find().exec();
  }

  // 📢 Xóa người dùng khỏi hệ thống (Nếu cần)
  async deleteUser(userId: string): Promise<UserDocument | null> {
    return await this.userModel.findByIdAndDelete(userId).exec();
  }
}
