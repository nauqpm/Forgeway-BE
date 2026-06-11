import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  mixin,
  Type,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Workspace,
  WorkspaceDocument,
} from '@/modules/workspaces/schemas/workspace.schema';

export const WorkspaceTypeGuard = (
  requiredType: 'scrum' | 'kanban',
): Type<CanActivate> => {
  @Injectable()
  class WorkspaceTypeGuardMixin implements CanActivate {
    constructor(
      @InjectModel(Workspace.name)
      private readonly workspaceModel: Model<WorkspaceDocument>,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest();
      const workspaceId = request.params?.workspaceId;

      if (!workspaceId) {
        throw new BadRequestException('workspaceId not found in request');
      }

      if (!Types.ObjectId.isValid(workspaceId)) {
        throw new BadRequestException(
          'workspaceId must be a valid MongoDB ObjectId',
        );
      }

      const workspace = await this.workspaceModel
        .findOne({ _id: new Types.ObjectId(workspaceId) })
        .select('type')
        .lean()
        .exec();

      if (!workspace) {
        throw new NotFoundException('Workspace not found');
      }

      if (!workspace.type || workspace.type !== requiredType) {
        throw new ForbiddenException(
          `This operation requires a ${requiredType} workspace`,
        );
      }

      return true;
    }
  }

  return mixin(WorkspaceTypeGuardMixin);
};
