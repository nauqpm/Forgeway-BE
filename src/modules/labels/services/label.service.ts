import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { CreateLabelDto } from '../dtos/create-label.dto';
import { LabelDto } from '../dtos/label.dto';
import { UpdateLabelDto } from '../dtos/update-label.dto';
import { LabelMapper } from '../mappers/label.mapper';
import { Label, LabelDocument } from '../schemas/label.schema';

@Injectable()
export class LabelService {
  constructor(
    @InjectModel(Label.name)
    private readonly labelModel: Model<LabelDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    private readonly workspacesService: WorkspacesService,
    private readonly workspaceMemberService: WorkspaceMemberService,
    private readonly labelMapper: LabelMapper,
  ) {}

  async create(
    workspaceId: string,
    dto: CreateLabelDto,
    userId: string,
  ): Promise<LabelDto> {
    await this.assertWorkspaceMember(workspaceId, userId);
    const normalizedName = this.normalizeName(dto.name);
    await this.ensureNameAvailable(workspaceId, normalizedName);

    const label = await new this.labelModel({
      workspaceId: new Types.ObjectId(workspaceId),
      name: dto.name.trim(),
      normalizedName,
      createdBy: new Types.ObjectId(userId),
      isDeleted: false,
    }).save();

    return this.labelMapper.mapToDto(label);
  }

  async findByWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<LabelDto[]> {
    await this.assertWorkspaceMember(workspaceId, userId);

    const labels = await this.labelModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .sort({ name: 1 })
      .exec();

    return this.labelMapper.mapToDtos(labels);
  }

  async update(
    workspaceId: string,
    labelId: string,
    dto: UpdateLabelDto,
    userId: string,
  ): Promise<LabelDto> {
    await this.assertWorkspaceMember(workspaceId, userId);
    const label = await this.findLabelDocument(workspaceId, labelId);

    if (!label) {
      throw new NotFoundException(`Label with ID ${labelId} not found`);
    }

    if (dto.name !== undefined) {
      const normalizedName = this.normalizeName(dto.name);
      if (normalizedName !== label.normalizedName) {
        await this.ensureNameAvailable(workspaceId, normalizedName, labelId);
      }
      label.name = dto.name.trim();
      label.normalizedName = normalizedName;
    }

    await label.save();
    return this.labelMapper.mapToDto(label);
  }

  async delete(
    workspaceId: string,
    labelId: string,
    userId: string,
  ): Promise<void> {
    await this.assertWorkspaceMember(workspaceId, userId);
    const label = await this.findLabelDocument(workspaceId, labelId);

    if (!label) {
      throw new NotFoundException(`Label with ID ${labelId} not found`);
    }

    label.isDeleted = true;
    label.deletedAt = new Date();
    label.deletedBy = new Types.ObjectId(userId);
    await label.save();

    await this.taskModel
      .updateMany(
        { workspaceId: new Types.ObjectId(workspaceId) },
        { $pull: { labelIds: label._id } },
      )
      .exec();
  }

  async findActiveLabelsByIds(
    workspaceId: string,
    labelIds: string[],
  ): Promise<LabelDocument[]> {
    this.validateObjectId(workspaceId, 'Workspace');
    const uniqueLabelIds = [...new Set(labelIds)];

    if (uniqueLabelIds.some(labelId => !Types.ObjectId.isValid(labelId))) {
      throw new BadRequestException(
        'Label IDs must be valid MongoDB ObjectIds',
      );
    }

    return this.labelModel
      .find({
        _id: {
          $in: uniqueLabelIds.map(labelId => new Types.ObjectId(labelId)),
        },
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .exec();
  }

  private async findLabelDocument(
    workspaceId: string,
    labelId: string,
  ): Promise<LabelDocument | null> {
    this.validateObjectId(workspaceId, 'Workspace');
    if (!Types.ObjectId.isValid(labelId)) {
      return null;
    }

    return this.labelModel
      .findOne({
        _id: new Types.ObjectId(labelId),
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .exec();
  }

  private async ensureNameAvailable(
    workspaceId: string,
    normalizedName: string,
    currentLabelId?: string,
  ): Promise<void> {
    const existing = await this.labelModel
      .findOne({
        workspaceId: new Types.ObjectId(workspaceId),
        normalizedName,
        isDeleted: { $ne: true },
      })
      .exec();

    if (existing && existing._id.toString() !== currentLabelId) {
      throw new ConflictException(
        'Label name already exists in this workspace',
      );
    }
  }

  private async assertWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    this.validateObjectId(workspaceId, 'Workspace');
    await this.workspacesService.findById(workspaceId);

    const isMember = await this.workspaceMemberService.isMember(
      workspaceId,
      userId,
    );
    if (!isMember) {
      throw new ForbiddenException('Workspace access denied');
    }
  }

  private normalizeName(name: string): string {
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName) {
      throw new BadRequestException('Label name is required');
    }
    return normalizedName;
  }

  private validateObjectId(value: string, label: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(
        `${label} must be a valid MongoDB ObjectId`,
      );
    }
  }
}
