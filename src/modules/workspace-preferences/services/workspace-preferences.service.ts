import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Workspace,
  WorkspaceDocument,
} from '../../workspaces/schemas/workspace.schema';
import {
  WorkspacePreference,
  WorkspacePreferenceDocument,
} from '../schemas/workspace-preference.schema';

@Injectable()
export class WorkspacePreferencesService {
  constructor(
    @InjectModel(WorkspacePreference.name)
    private readonly preferenceModel: Model<WorkspacePreferenceDocument>,
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
  ) {}

  async findByUserId(userId: string): Promise<WorkspacePreference[]> {
    if (!Types.ObjectId.isValid(userId)) return [];
    return this.preferenceModel
      .find({ userId })
      .sort({ position: 1 })
      .lean()
      .exec();
  }

  async setStar(
    userId: string,
    workspaceId: string,
    isStarred: boolean,
  ): Promise<WorkspacePreference> {
    await this.assertWorkspaceAccess(userId, workspaceId);
    const existing = await this.preferenceModel.findOne({
      userId,
      workspaceId,
    });
    const position = existing?.position ?? (await this.nextPosition(userId));

    return this.preferenceModel
      .findOneAndUpdate(
        { userId, workspaceId },
        { $set: { isStarred, position } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean()
      .exec();
  }

  async reorder(userId: string, workspaceIds: string[]): Promise<void> {
    if (workspaceIds.length === 0) return;

    const accessibleCount = await this.workspaceModel.countDocuments({
      _id: { $in: workspaceIds.map(id => new Types.ObjectId(id)) },
      deletedAt: null,
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        { 'members.userId': new Types.ObjectId(userId) },
      ],
    });
    if (accessibleCount !== workspaceIds.length) {
      throw new BadRequestException(
        'Workspace order contains an inaccessible or deleted workspace',
      );
    }

    await this.preferenceModel.bulkWrite(
      workspaceIds.map((workspaceId, position) => ({
        updateOne: {
          filter: { userId, workspaceId },
          update: { $set: { position }, $setOnInsert: { isStarred: false } },
          upsert: true,
        },
      })),
    );
  }

  async deleteForUserWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.preferenceModel.deleteOne({ userId, workspaceId }).exec();
  }

  async deleteByWorkspace(workspaceId: string): Promise<void> {
    await this.preferenceModel.deleteMany({ workspaceId }).exec();
  }

  private async assertWorkspaceAccess(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(workspaceId)
    ) {
      throw new NotFoundException('Workspace not found');
    }
    const workspace = await this.workspaceModel
      .findOne({
        _id: workspaceId,
        deletedAt: null,
        $or: [
          { ownerId: new Types.ObjectId(userId) },
          { 'members.userId': new Types.ObjectId(userId) },
        ],
      })
      .select('_id')
      .lean()
      .exec();
    if (!workspace) throw new ForbiddenException('Workspace access denied');
  }

  private async nextPosition(userId: string): Promise<number> {
    const last = await this.preferenceModel
      .findOne({ userId })
      .sort({ position: -1 })
      .select('position')
      .lean()
      .exec();
    return (last?.position ?? -1) + 1;
  }
}
