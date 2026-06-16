import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateNotificationInput } from '../interfaces/create-notification-input.interface';
import {
  Notification,
  NotificationDocument,
} from '../schemas/notification.schema';
import { BaseRepository } from '../../../shared/repositories/base.repository';

@Injectable()
export class NotificationsRepository extends BaseRepository<NotificationDocument> {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {
    super(notificationModel);
  }

  async create(input: CreateNotificationInput): Promise<NotificationDocument> {
    return new this.notificationModel(this.toPersistence(input)).save();
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

    return notifications as unknown as NotificationDocument[];
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
