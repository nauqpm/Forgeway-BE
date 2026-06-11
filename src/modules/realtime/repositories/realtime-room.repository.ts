import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Task, TaskDocument } from '../../tasks/schemas/task.schema';
import {
  Workspace,
  WorkspaceDocument,
} from '../../workspaces/schemas/workspace.schema';

@Injectable()
export class RealtimeRoomRepository {
  constructor(
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
  ) {}

  async workspaceMembershipExists(
    workspaceId: string,
    userId: string,
  ): Promise<boolean> {
    if (
      !Types.ObjectId.isValid(workspaceId) ||
      !Types.ObjectId.isValid(userId)
    ) {
      return false;
    }

    const workspace = await this.workspaceModel
      .exists({
        _id: new Types.ObjectId(workspaceId),
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
        'members.userId': new Types.ObjectId(userId),
      })
      .exec();

    return Boolean(workspace);
  }

  async taskExistsInWorkspace(
    taskId: string,
    workspaceId: string,
  ): Promise<boolean> {
    if (
      !Types.ObjectId.isValid(taskId) ||
      !Types.ObjectId.isValid(workspaceId)
    ) {
      return false;
    }

    const task = await this.taskModel
      .exists({
        _id: new Types.ObjectId(taskId),
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .exec();

    return Boolean(task);
  }
}
