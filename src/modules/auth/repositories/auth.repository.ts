// auth/repositories/auth.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../users/schemas/users.schema';
import { RegisterDto, UpdateUserDto } from '../dtos/auth.dto';

@Injectable()
export class AuthRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  // 📢 Tạo người dùng mới khi đăng ký
  async createUser(registerDto: RegisterDto): Promise<User> {
    const newUser = new this.userModel(registerDto);
    return await newUser.save();
  }

  // 📢 Tìm người dùng bằng email để xác thực đăng nhập
  async findByEmail(email: string): Promise<User | null> {
    return await this.userModel.findOne({ email }).exec();
  }

  // 📢 Lấy thông tin người dùng bằng ID (Dùng trong xác thực JWT)
  async findById(id: string): Promise<User | null> {
    return await this.userModel.findById(id).exec();
  }

  // 📢 Cập nhật thông tin người dùng (ví dụ: đổi mật khẩu, cập nhật trạng thái)
  async updateUser(
    userId: string,
    updateData: Partial<User>,
  ): Promise<User | null> {
    return await this.userModel
      .findByIdAndUpdate(userId, updateData, { new: true })
      .exec();
  }

  // 📢 Lấy tất cả người dùng (Dành cho quản trị viên)
  async findAllUsers(): Promise<User[]> {
    return await this.userModel.find().exec();
  }

  // 📢 Xóa người dùng khỏi hệ thống (Nếu cần)
  async deleteUser(userId: string): Promise<User | null> {
    return await this.userModel.findByIdAndDelete(userId).exec();
  }
}
