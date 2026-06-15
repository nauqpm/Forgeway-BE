import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  NotificationActorDto,
  NotificationDto,
  NotificationListDto,
} from '../dtos/notification.dto';
import { NotificationDocument } from '../schemas/notification.schema';

@Injectable()
export class NotificationMapper {
  mapToDto(notification: NotificationDocument): NotificationDto {
    const actor = this.mapActor((notification as any).actorId);

    return {
      id: notification._id.toString(),
      recipientId: this.toId(notification.recipientId),
      actorId: actor?.id ?? this.toOptionalId(notification.actorId),
      actor,
      workspaceId: this.toOptionalId(notification.workspaceId),
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityId: this.toOptionalId(notification.entityId),
      metadata: notification.metadata,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }

  mapToListDto(result: {
    notifications: NotificationDocument[];
    total: number;
    page: number;
    limit: number;
  }): NotificationListDto {
    return {
      notifications: result.notifications.map(notification =>
        this.mapToDto(notification),
      ),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  private mapActor(actor: any): NotificationActorDto | undefined {
    if (!actor || actor instanceof Types.ObjectId) {
      return undefined;
    }

    return {
      id: this.toId(actor._id ?? actor.id),
      email: actor.email,
      fullName: actor.fullName,
      avatar: actor.avatar,
    };
  }

  private toOptionalId(value?: unknown): string | undefined {
    const id = this.toId(value);
    return id || undefined;
  }

  private toId(value: any): string {
    return value?._id?.toString?.() ?? value?.toString?.() ?? '';
  }
}
