import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Address, AddressDocument } from '../schemas/address.schema';
import { CreateAddressDto, UpdateAddressDto } from '../dtos/create-address.dto';

@Injectable()
export class AddressesService {
  constructor(@InjectModel(Address.name) private addressModel: Model<AddressDocument>) {}

  async create(
    createAddressDto: CreateAddressDto,
    userId: string,
  ): Promise<Address> {
    if (createAddressDto.isDefault) {
      await this.addressModel.updateMany({ userId: new Types.ObjectId(userId) }, { $set: { isDefault: false } });
    }

    const address = new this.addressModel({
      ...createAddressDto,
      userId: new Types.ObjectId(userId),
    });
    return address.save();
  }

  async findAll(userId: string): Promise<Address[]> {
    return this.addressModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ isDefault: -1, createdAt: -1 })
      .exec();
  }

  async findById(id: string, userId: string): Promise<Address> {
    const address = await this.addressModel
      .findOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!address) {
      throw new NotFoundException(`Address with ID ${id} not found`);
    }
    return address;
  }

  async update(id: string, updateAddressDto: UpdateAddressDto, userId: string): Promise<Address> {
    const address = await this.addressModel
      .findOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!address) {
      throw new NotFoundException(`Address with ID ${id} not found`);
    }

    if (updateAddressDto.isDefault) {
      await this.addressModel.updateMany(
        {
          userId: new Types.ObjectId(userId),
          _id: { $ne: new Types.ObjectId(id) },
        },
        { $set: { isDefault: false } },
      );
    }

    Object.assign(address, updateAddressDto);
    return address.save();
  }

  async delete(id: string, userId: string): Promise<void> {
    const result = await this.addressModel
      .deleteOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException(`Address with ID ${id} not found`);
    }
  }

  async setDefault(id: string, userId: string): Promise<Address> {
    const address = await this.addressModel
      .findOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!address) {
      throw new NotFoundException(`Address with ID ${id} not found`);
    }

    await this.addressModel.updateMany({ userId: new Types.ObjectId(userId) }, { $set: { isDefault: false } });

    address.isDefault = true;
    return address.save();
  }
}
