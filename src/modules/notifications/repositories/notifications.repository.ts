import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateNotificationInput } from '../interfaces/create-notification-input.interface';
import {
  Notification,
  NotificationDocument,
} from '../schemas/notification.schema';
import { BaseRepository } from '../../../shared/repositories/base.repository';
import {
  PushDeliveryInitialState,
  PushDeliveryStatus,
} from '../constants/web-push-delivery.constants';

@Injectable()
export class NotificationsRepository extends BaseRepository<NotificationDocument> {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {
    super(notificationModel);
  }

  async create(
    input: CreateNotificationInput,
    pushDelivery: PushDeliveryInitialState,
  ): Promise<NotificationDocument> {
    return new this.notificationModel(
      this.toPersistence(input, pushDelivery),
    ).save();
  }

  async createMany(
    inputs: CreateNotificationInput[],
    pushDelivery: PushDeliveryInitialState,
  ): Promise<NotificationDocument[]> {
    if (!inputs.length) {
      return [];
    }

    const notifications = await this.notificationModel.insertMany(
      inputs.map(input => this.toPersistence(input, pushDelivery)),
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

  async claimDuePushDelivery(
    now: Date,
    leaseUntil: Date,
  ): Promise<NotificationDocument | null> {
    return this.notificationModel
      .findOneAndUpdate(
        {
          pushDeliveryStatus: {
            $in: [PushDeliveryStatus.PENDING, PushDeliveryStatus.RETRY],
          },
          pushNextAttemptAt: { $lte: now },
          $or: [
            { pushLeaseUntil: null },
            { pushLeaseUntil: { $exists: false } },
            { pushLeaseUntil: { $lte: now } },
          ],
        },
        {
          $set: {
            pushDeliveryStatus: PushDeliveryStatus.PROCESSING,
            pushLeaseUntil: leaseUntil,
          },
        },
        {
          new: true,
          sort: { pushNextAttemptAt: 1, createdAt: 1 },
        },
      )
      .exec();
  }

  async markPushDelivered(
    notificationId: string | Types.ObjectId,
    heldLeaseUntil: Date,
    deliveredAt: Date,
  ): Promise<NotificationDocument | null> {
    return this.transitionClaimedPushDelivery(
      notificationId,
      heldLeaseUntil,
      {
        pushDeliveryStatus: PushDeliveryStatus.DELIVERED,
        pushNextAttemptAt: null,
        pushLeaseUntil: null,
        pushDeliveredAt: deliveredAt,
        pushLastErrorCode: null,
      },
    );
  }

  async markPushSkipped(
    notificationId: string | Types.ObjectId,
    heldLeaseUntil: Date,
  ): Promise<NotificationDocument | null> {
    return this.transitionClaimedPushDelivery(notificationId, heldLeaseUntil, {
      pushDeliveryStatus: PushDeliveryStatus.SKIPPED,
      pushNextAttemptAt: null,
      pushLeaseUntil: null,
      pushLastErrorCode: null,
    });
  }

  async markPushFailed(
    notificationId: string | Types.ObjectId,
    heldLeaseUntil: Date,
    lastErrorCode: number | null,
  ): Promise<NotificationDocument | null> {
    return this.transitionClaimedPushDelivery(notificationId, heldLeaseUntil, {
      pushDeliveryStatus: PushDeliveryStatus.FAILED,
      pushNextAttemptAt: null,
      pushLeaseUntil: null,
      pushLastErrorCode: lastErrorCode,
    });
  }

  async markPushExpired(
    notificationId: string | Types.ObjectId,
    heldLeaseUntil: Date,
  ): Promise<NotificationDocument | null> {
    return this.transitionClaimedPushDelivery(notificationId, heldLeaseUntil, {
      pushDeliveryStatus: PushDeliveryStatus.EXPIRED,
      pushNextAttemptAt: null,
      pushLeaseUntil: null,
      pushLastErrorCode: null,
    });
  }

  async schedulePushRetry(
    notificationId: string | Types.ObjectId,
    heldLeaseUntil: Date,
    nextAttemptAt: Date,
    lastErrorCode: number | null,
  ): Promise<NotificationDocument | null> {
    return this.notificationModel
      .findOneAndUpdate(
        this.claimedPushDeliveryFilter(notificationId, heldLeaseUntil),
        {
          $set: {
            pushDeliveryStatus: PushDeliveryStatus.RETRY,
            pushNextAttemptAt: nextAttemptAt,
            pushLeaseUntil: null,
            pushLastErrorCode: lastErrorCode,
          },
          $inc: { pushAttempts: 1 },
        },
        { new: true },
      )
      .exec();
  }

  private async transitionClaimedPushDelivery(
    notificationId: string | Types.ObjectId,
    heldLeaseUntil: Date,
    update: Record<string, unknown>,
  ): Promise<NotificationDocument | null> {
    return this.notificationModel
      .findOneAndUpdate(
        this.claimedPushDeliveryFilter(notificationId, heldLeaseUntil),
        { $set: update },
        { new: true },
      )
      .exec();
  }

  private claimedPushDeliveryFilter(
    notificationId: string | Types.ObjectId,
    heldLeaseUntil: Date,
  ) {
    return {
      _id: notificationId,
      pushDeliveryStatus: PushDeliveryStatus.PROCESSING,
      pushLeaseUntil: heldLeaseUntil,
    };
  }

  private toPersistence(
    input: CreateNotificationInput,
    pushDelivery: PushDeliveryInitialState,
  ): Partial<Notification> {
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
      pushDeliveryStatus: pushDelivery.status,
      pushNextAttemptAt: pushDelivery.nextAttemptAt,
    };
  }
}
