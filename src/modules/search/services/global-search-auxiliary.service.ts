import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Sprint } from '../../scrum/schemas/sprint.schema';
import { User } from '../../users/schemas/users.schema';
import { Workspace } from '../../workspaces/schemas/workspace.schema';
import { GlobalSearchItem, GlobalSearchType } from '../dtos/global-search.dto';

export type SearchCursor = { updatedAt: Date; id: string };

type SearchWorkspace = Pick<
  Workspace,
  | '_id'
  | 'name'
  | 'description'
  | 'key'
  | 'searchText'
  | 'ownerId'
  | 'createdAt'
  | 'updatedAt'
> & {
  members: { userId: Types.ObjectId; role: string }[];
};

@Injectable()
export class GlobalSearchAuxiliaryService {
  constructor(
    @InjectModel(Sprint.name) private readonly sprintModel: Model<Sprint>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async search(
    types: GlobalSearchType[],
    normalizedRegex: RegExp,
    rawRegex: RegExp,
    workspaces: SearchWorkspace[],
    limit: number,
    cursor?: SearchCursor,
  ): Promise<GlobalSearchItem[]> {
    const items: GlobalSearchItem[] = [];
    const workspaceIds = workspaces.map(workspace => workspace._id);

    if (types.includes('workspace') || types.includes('board')) {
      const matchingWorkspaces = workspaces
        .filter(
          workspace =>
            normalizedRegex.test(workspace.searchText ?? '') ||
            rawRegex.test(workspace.name) ||
            rawRegex.test(workspace.key) ||
            rawRegex.test(workspace.description ?? ''),
        )
        .filter(workspace =>
          this.afterCursor(workspace.updatedAt, String(workspace._id), cursor),
        )
        .sort(
          (a, b) =>
            b.updatedAt.getTime() - a.updatedAt.getTime() ||
            String(b._id).localeCompare(String(a._id)),
        );
      if (types.includes('workspace')) {
        items.push(
          ...matchingWorkspaces
            .slice(0, limit)
            .map(workspace => this.workspaceItem(workspace)),
        );
      }
      if (types.includes('board')) {
        items.push(
          ...matchingWorkspaces
            .slice(0, limit)
            .map(workspace => this.boardItem(workspace)),
        );
      }
    }

    if (types.includes('sprint')) {
      const sprints = await this.sprintModel
        .find({
          workspaceId: { $in: workspaceIds },
          deletedAt: null,
          $or: [{ name: rawRegex }, { goal: rawRegex }],
          ...(cursor ? { $and: [this.cursorQuery(cursor)] } : {}),
        })
        .select('_id workspaceId name goal status createdAt updatedAt')
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean()
        .exec();
      const workspaceById = new Map(
        workspaces.map(workspace => [String(workspace._id), workspace]),
      );
      items.push(
        ...sprints.flatMap(sprint => {
          const workspace = workspaceById.get(String(sprint.workspaceId));
          if (!workspace) return [];
          return [
            {
              id: String(sprint._id),
              type: 'sprint' as const,
              title: sprint.name,
              description: sprint.goal,
              url: `/workspaces/${workspace.key}/backlog`,
              workspaceId: String(workspace._id),
              workspaceName: workspace.name,
              metadata: { status: sprint.status },
              createdAt: sprint.createdAt,
              updatedAt: sprint.updatedAt,
            },
          ];
        }),
      );
    }

    if (types.includes('user')) {
      const userIds = [
        ...new Set(
          workspaces.flatMap(workspace => [
            String(workspace.ownerId),
            ...(workspace.members ?? []).map(member => String(member.userId)),
          ]),
        ),
      ]
        .filter(Types.ObjectId.isValid)
        .map(id => new Types.ObjectId(id));
      const users = await this.userModel
        .find({
          _id: { $in: userIds },
          $or: [{ fullName: rawRegex }, { email: rawRegex }],
          ...(cursor ? { $and: [this.cursorQuery(cursor)] } : {}),
        })
        .select('_id fullName email avatar createdAt updatedAt')
        .sort({ updatedAt: -1, _id: -1 })
        .limit(limit)
        .lean()
        .exec();
      items.push(
        ...users.map(user => ({
          id: String(user._id),
          type: 'user' as const,
          title: user.fullName || user.email,
          description: user.email,
          url: '/profile',
          metadata: { avatar: user.avatar, userId: String(user._id) },
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })),
      );
    }

    return items;
  }

  private workspaceItem(workspace: SearchWorkspace): GlobalSearchItem {
    return {
      id: String(workspace._id),
      type: 'workspace',
      title: workspace.name,
      description: workspace.description,
      key: workspace.key,
      url: `/workspaces/${workspace.key}/board`,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }

  private boardItem(workspace: SearchWorkspace): GlobalSearchItem {
    return {
      id: String(workspace._id),
      type: 'board',
      title: `${workspace.name} board`,
      key: workspace.key,
      url: `/workspaces/${workspace.key}/board`,
      workspaceId: String(workspace._id),
      workspaceName: workspace.name,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }

  private cursorQuery(cursor: SearchCursor) {
    return {
      $or: [
        { updatedAt: { $lt: cursor.updatedAt } },
        {
          updatedAt: cursor.updatedAt,
          _id: { $lt: new Types.ObjectId(cursor.id) },
        },
      ],
    };
  }

  private afterCursor(updatedAt: Date, id: string, cursor?: SearchCursor) {
    if (!cursor) return true;
    return (
      updatedAt < cursor.updatedAt ||
      (updatedAt.getTime() === cursor.updatedAt.getTime() && id < cursor.id)
    );
  }
}
