import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateRequirementDto } from './dtos/requirement.dto';
import {
  RawRequirement,
  RawRequirementDocument,
} from './schemas/raw-requirement.schema';

@Injectable()
export class RequirementsService {
  constructor(
    @InjectModel(RawRequirement.name)
    private readonly requirementModel: Model<RawRequirementDocument>,
  ) {}

  async create(
    workspaceId: string,
    dto: CreateRequirementDto,
    userId: string,
  ): Promise<RawRequirementDocument> {
    try {
      return await this.requirementModel.create({
        workspaceId,
        key: dto.key.trim(),
        title: dto.title.trim(),
        body: dto.body.trim(),
        sourceType: dto.sourceType.trim(),
        ...(dto.sourceRef ? { sourceRef: dto.sourceRef.trim() } : {}),
        ...(dto.sourceMetadata ? { sourceMetadata: dto.sourceMetadata } : {}),
        status: 'active',
        createdBy: userId,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException(
          'Requirement key already exists in this workspace',
        );
      }
      throw error;
    }
  }

  async findAll(workspaceId: string): Promise<RawRequirementDocument[]> {
    return this.requirementModel.find({ workspaceId }).sort({ createdAt: -1 });
  }

  async findById(
    workspaceId: string,
    requirementId: string,
  ): Promise<RawRequirementDocument> {
    const requirement = await this.requirementModel.findOne({
      _id: requirementId,
      workspaceId,
    });
    if (!requirement) {
      throw new NotFoundException('Requirement not found');
    }
    return requirement;
  }

  async archive(
    workspaceId: string,
    requirementId: string,
    userId: string,
  ): Promise<RawRequirementDocument> {
    const requirement = await this.requirementModel.findOneAndUpdate(
      { _id: requirementId, workspaceId, status: 'active' },
      {
        $set: {
          status: 'archived',
          archivedAt: new Date(),
          archivedBy: userId,
        },
      },
      { new: true },
    );
    if (!requirement) {
      throw new NotFoundException('Requirement not found');
    }
    return requirement;
  }
}
