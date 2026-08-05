import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateNotificationInput } from '../interfaces/create-notification-input.interface';
import {
  Notification,
  NotificationDocument,
} from '../schemas/notification.schema';
import {
  DIRECT_NOTIFICATION_TYPES,
  NOTIFICATION_TYPES,
} from '../constants/notification.constants';
import { BaseRepository } from '../../../shared/repositories/base.repository';
import { InviteStatusValue } from '../../workspaces/schemas/invite.schema';

@Injectable()
export class NotificationsRepository extends BaseRepository<NotificationDocument> {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {
    super(notificationModel);
  }

  async create(input: CreateNotificationInput): Promise<NotificationDocument> {
    const doc = await new this.notificationModel(
      this.toPersistence(input),
    ).save();
    return doc.populate('actorId', 'email fullName avatar');
  }

  async createMany(
    inputs: CreateNotificationInput[],
  ): Promise<NotificationDocument[]> {
    if (!inputs.length) {
      return [];
    }

    const notifications = await this.notificationModel.insertMany(
      inputs.map(input => this.toPersistence(input)),
    );

    return this.notificationModel.populate(notifications, {
      path: 'actorId',
      select: 'email fullName avatar',
    });
  }

  async findByRecipient(
    recipientId: string,
    page: number,
    limit: number,
  ): Promise<{
    notifications: NotificationDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const filter = { recipientId: new Types.ObjectId(recipientId) };
    const result = await this.paginate(filter, {
      page,
      limit,
      populate: { path: 'actorId', select: 'email fullName avatar' },
      sort: { readAt: 1, createdAt: -1 },
    });

    return {
      notifications: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async findByRecipientCursor(
    recipientId: string,
    cursor?: string,
    unreadOnly?: boolean,
    category?: string,
    limit = 20,
  ): Promise<{
    notifications: NotificationDocument[];
    total: number;
    page: number;
    limit: number;
    nextCursor?: string;
  }> {
    if (limit <= 0) {
      return {
        notifications: [],
        total: 0,
        page: 1,
        limit,
        nextCursor: undefined,
      };
    }

    const filter: any = { recipientId: new Types.ObjectId(recipientId) };

    if (unreadOnly) {
      filter.readAt = null;
    }

    if (category === 'DIRECT') {
      filter.type = { $in: DIRECT_NOTIFICATION_TYPES };
    } else if (category === 'WATCHING') {
      filter.type = { $nin: DIRECT_NOTIFICATION_TYPES };
    }

    if (cursor && Types.ObjectId.isValid(cursor)) {
      filter._id = { $lt: new Types.ObjectId(cursor) };
    }

    const items = await this.notificationModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate('actorId', 'email fullName avatar')
      .exec();

    let nextCursor: string | undefined;
    if (items.length > limit) {
      items.pop();
      nextCursor = items[items.length - 1]._id.toString();
    }

    return {
      notifications: items,
      total: 0,
      page: 1,
      limit,
      nextCursor,
    };
  }

  async countUnread(recipientId: string): Promise<number> {
    return this.notificationModel
      .countDocuments({
        recipientId: new Types.ObjectId(recipientId),
        readAt: null,
      })
      .exec();
  }

  async findByIdForRecipient(
    notificationId: string,
    recipientId: string,
  ): Promise<NotificationDocument | null> {
    if (!Types.ObjectId.isValid(notificationId)) {
      return null;
    }

    return this.notificationModel
      .findOne({
        _id: new Types.ObjectId(notificationId),
        recipientId: new Types.ObjectId(recipientId),
      })
      .populate('actorId', 'email fullName avatar')
      .exec();
  }

  async markAsReadForRecipient(
    notificationId: string,
    recipientId: string,
  ): Promise<NotificationDocument | null> {
    if (!Types.ObjectId.isValid(notificationId)) {
      return null;
    }

    return this.notificationModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(notificationId),
          recipientId: new Types.ObjectId(recipientId),
        },
        { $set: { readAt: new Date() } },
        { new: true },
      )
      .populate('actorId', 'email fullName avatar')
      .exec();
  }

  async updateInviteStatus(
    inviteId: string,
    recipientId: string | undefined,
    status: InviteStatusValue,
  ): Promise<{ modifiedCount: number }> {
    if (
      !Types.ObjectId.isValid(inviteId) ||
      (recipientId && !Types.ObjectId.isValid(recipientId))
    ) {
      return { modifiedCount: 0 };
    }

    const filter: any = {
      entityId: new Types.ObjectId(inviteId),
      type: NOTIFICATION_TYPES.WORKSPACE_INVITED,
    };
    if (recipientId) {
      filter.recipientId = new Types.ObjectId(recipientId);
    }

    const result = await this.notificationModel
      .updateMany(filter, { $set: { 'metadata.status': status } })
      .exec();

    return { modifiedCount: result.modifiedCount };
  }

  async markAllAsReadForRecipient(
    recipientId: string,
    readAt = new Date(),
  ): Promise<{ modifiedCount: number }> {
    const result = await this.notificationModel
      .updateMany(
        {
          recipientId: new Types.ObjectId(recipientId),
          readAt: null,
        },
        { $set: { readAt } },
      )
      .exec();

    return { modifiedCount: result.modifiedCount };
  }

  private toPersistence(input: CreateNotificationInput): Partial<Notification> {
    return {
      recipientId: new Types.ObjectId(input.recipientId),
      actorId: input.actorId ? new Types.ObjectId(input.actorId) : undefined,
      workspaceId: input.workspaceId
        ? new Types.ObjectId(input.workspaceId)
        : undefined,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId ? new Types.ObjectId(input.entityId) : undefined,
      metadata: input.metadata,
    };
  }
}
