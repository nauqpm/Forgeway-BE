import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Amenity, AmenityDocument } from '../schemas/amenity.schema';
import { CreateAmenityDto, UpdateAmenityDto } from '../dtos/create-amenity.dto';

@Injectable()
export class UtilitiesService {
  constructor(
    @InjectModel(Amenity.name) private amenityModel: Model<AmenityDocument>,
  ) {}

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async create(createAmenityDto: CreateAmenityDto): Promise<Amenity> {
    const slug = this.slugify(createAmenityDto.name);
    const amenity = new this.amenityModel({
      ...createAmenityDto,
      slug,
    });
    return amenity.save();
  }

  async findAll(): Promise<Amenity[]> {
    return this.amenityModel.find().sort({ order: 1, createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<Amenity> {
    const amenity = await this.amenityModel.findById(id).exec();
    if (!amenity) {
      throw new NotFoundException(`Amenity with ID ${id} not found`);
    }
    return amenity;
  }

  async findByCategory(category: string): Promise<Amenity[]> {
    return this.amenityModel
      .find({ category, isActive: true })
      .sort({ order: 1 })
      .exec();
  }

  async update(
    id: string,
    updateAmenityDto: UpdateAmenityDto,
  ): Promise<Amenity> {
    const amenity = await this.amenityModel
      .findByIdAndUpdate(id, updateAmenityDto, { new: true })
      .exec();
    if (!amenity) {
      throw new NotFoundException(`Amenity with ID ${id} not found`);
    }
    return amenity;
  }

  async delete(id: string): Promise<void> {
    const result = await this.amenityModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Amenity with ID ${id} not found`);
    }
  }
}
