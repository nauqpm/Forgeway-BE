import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, mixin, Type } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Workspace, WorkspaceDocument } from '@/modules/workspaces/schemas/workspace.schema';

export const WorkspaceTypeGuard = (requiredType: 'scrum' | 'kanban'): Type<CanActivate> => {
  @Injectable()
  class WorkspaceTypeGuardMixin implements CanActivate {
    constructor(
      @InjectModel(Workspace.name) private readonly workspaceModel: Model<WorkspaceDocument>,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest();
      const key = request.params?.key;

      if (!key) {
        throw new BadRequestException('Workspace key not found in request');
      }

      const workspace = await this.workspaceModel
        .findOne({ key })
        .select('type')
        .lean()
        .exec();

      if (!workspace) {
        throw new NotFoundException(`Workspace with key "${key}" not found`);
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
