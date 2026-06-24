import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery } from 'mongoose';
import { Workspace, WorkspaceDocument } from '../schemas/workspace.schema';
import { BaseRepository } from '../../../shared/repositories/base.repository';
import { normalizeForSearch } from '../../../common/utils/normalizeForSearch';

@Injectable()
export class WorkspacesRepository extends BaseRepository<WorkspaceDocument> {
  private readonly logger = new Logger(WorkspacesRepository.name);

  constructor(
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
  ) {
    super(workspaceModel);
  }

  override buildSoftDeleteFilter(
    includeDeleted = false,
  ): FilterQuery<WorkspaceDocument> {
    return includeDeleted ? {} : { deletedAt: null };
  }

  async create(data: Partial<Workspace>): Promise<WorkspaceDocument> {
    const workspace = new this.workspaceModel({
      ...data,
      searchText: normalizeForSearch(
        [data.name, data.key, data.description].join(' '),
      ),
    });
    return workspace.save();
  }

  async findById(id: string): Promise<WorkspaceDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.workspaceModel
      .findOne({ _id: id, ...this.buildSoftDeleteFilter() })
      .exec();
  }

  async findByIdWithMembers(id: string): Promise<any | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.workspaceModel
      .findOne({ _id: id, ...this.buildSoftDeleteFilter() })
      .populate('members.userId', 'fullName email avatar')
      .lean()
      .exec();
  }

  async findBySlug(slug: string): Promise<WorkspaceDocument | null> {
    return this.workspaceModel
      .findOne({ slug, ...this.buildSoftDeleteFilter() })
      .exec();
  }

  async findAnyBySlug(slug: string): Promise<WorkspaceDocument | null> {
    return this.workspaceModel.findOne({ slug }).exec();
  }

  async findAnyByKey(key: string): Promise<WorkspaceDocument | null> {
    return this.workspaceModel.findOne({ key }).exec();
  }

  async findByUserId(userId: string): Promise<WorkspaceDocument[]> {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }
    const objectUserId = new Types.ObjectId(userId);
    return this.workspaceModel
      .find({
        ...this.buildSoftDeleteFilter(),
        $or: [{ ownerId: objectUserId }, { 'members.userId': objectUserId }],
      })
      .exec();
  }

  async findActiveForUserOverview(
    userId: string,
  ): Promise<WorkspaceDocument[]> {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }
    const objectUserId = new Types.ObjectId(userId);
    return this.workspaceModel
      .find({
        status: 'active',
        ...this.buildSoftDeleteFilter(),
        $or: [{ ownerId: objectUserId }, { 'members.userId': objectUserId }],
      })
      .select(
        '_id name description slug key type ownerId members status createdAt updatedAt',
      )
      .sort({ updatedAt: -1 })
      .exec();
  }

  async findAll(): Promise<WorkspaceDocument[]> {
    return this.workspaceModel.find({ ...this.buildSoftDeleteFilter() }).exec();
  }

  async findAllWithDeleted(): Promise<WorkspaceDocument[]> {
    return this.workspaceModel
      .find({})
      .populate('ownerId', 'fullName email avatar')
      .populate('members.userId', 'fullName email avatar')
      .exec();
  }

  async update(
    id: string,
    data: Partial<Workspace>,
  ): Promise<WorkspaceDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const searchText = normalizeForSearch(
      [data.name, data.key, data.description].join(' '),
    );
    return this.workspaceModel
      .findByIdAndUpdate(id, { ...data, searchText }, { new: true })
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      return false;
    }
    const result = await this.workspaceModel
      .findByIdAndUpdate(id, { deletedAt: new Date() }, { new: true })
      .exec();
    return !!result;
  }

  async restore(id: string): Promise<WorkspaceDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.workspaceModel
      .findByIdAndUpdate(id, { deletedAt: null }, { new: true })
      .exec();
  }

  async addMember(
    workspaceId: string,
    userId: string,
    role: string,
  ): Promise<WorkspaceDocument | null> {
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(userId)
    ) {
      return null;
    }
    return this.workspaceModel
      .findByIdAndUpdate(
        workspaceId,
        {
          $push: { members: { userId: new Types.ObjectId(userId), role } },
        },
        { new: true },
      )
      .exec();
  }

  async removeMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceDocument | null> {
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(userId)
    ) {
      return null;
    }
    return this.workspaceModel
      .findByIdAndUpdate(
        workspaceId,
        { $pull: { members: { userId: new Types.ObjectId(userId) } } },
        { new: true },
      )
      .exec();
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: string,
  ): Promise<WorkspaceDocument | null> {
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(userId)
    ) {
      return null;
    }
    return this.workspaceModel
      .findOneAndUpdate(
        { _id: workspaceId, 'members.userId': new Types.ObjectId(userId) },
        { $set: { 'members.$.role': role } },
        { new: true },
      )
      .exec();
  }

  async countBySlugPrefix(prefix: string): Promise<number> {
    const regex = new RegExp(`^${prefix}`, 'i');
    return this.workspaceModel.countDocuments({ slug: regex }).exec();
  }
}
