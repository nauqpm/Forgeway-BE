import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Workspace, WorkspaceDocument } from '../schemas/workspace.schema';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from '../dtos/create-workspace.dto';

@Injectable()
export class WorkspacesRepository {
  private readonly logger = new Logger(WorkspacesRepository.name);

  constructor(
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
  ) {}

  async create(data: Partial<Workspace>): Promise<WorkspaceDocument> {
    const workspace = new this.workspaceModel(data);
    return workspace.save();
  }

  async findById(id: string): Promise<WorkspaceDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.workspaceModel.findById(id).exec();
  }

  async findBySlug(slug: string): Promise<WorkspaceDocument | null> {
    return this.workspaceModel.findOne({ slug }).exec();
  }

  async findByKey(key: string): Promise<WorkspaceDocument | null> {
    return this.workspaceModel.findOne({ key }).exec();
  }

  async findByUserId(userId: string): Promise<WorkspaceDocument[]> {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }
    const objectUserId = new Types.ObjectId(userId);
    return this.workspaceModel
      .find({
        $or: [
          { ownerId: objectUserId },
          { 'members.userId': objectUserId },
        ],
      })
      .exec();
  }

  async findActiveForUserOverview(userId: string): Promise<WorkspaceDocument[]> {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }
    const objectUserId = new Types.ObjectId(userId);
    return this.workspaceModel
      .find({
        status: 'active',
        $or: [
          { ownerId: objectUserId },
          { 'members.userId': objectUserId },
        ],
      })
      .select('_id name description slug key type ownerId members status createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .exec();
  }

  async findAll(): Promise<WorkspaceDocument[]> {
    return this.workspaceModel.find().exec();
  }

  async update(
    id: string,
    data: Partial<Workspace>,
  ): Promise<WorkspaceDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.workspaceModel
      .findByIdAndUpdate(id, data, { new: true })
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      return false;
    }
    const result = await this.workspaceModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  async addMember(
    workspaceId: string,
    userId: string,
    role: string,
  ): Promise<WorkspaceDocument | null> {
    if (!Types.ObjectId.isValid(workspaceId) || !Types.ObjectId.isValid(userId)) {
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
    if (!Types.ObjectId.isValid(workspaceId) || !Types.ObjectId.isValid(userId)) {
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
    if (!Types.ObjectId.isValid(workspaceId) || !Types.ObjectId.isValid(userId)) {
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
