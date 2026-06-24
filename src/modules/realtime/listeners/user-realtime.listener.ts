import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RealtimeService } from '../realtime.service';

@Injectable()
export class UserRealtimeListener {
  private readonly logger = new Logger(UserRealtimeListener.name);

  constructor(private readonly realtimeService: RealtimeService) {}

  @OnEvent('user.deleted', { async: true })
  async handleUserDeleted(event: { userId: string }): Promise<void> {
    const { userId } = event;
    if (!userId) return;

    this.logger.log(
      `Received user.deleted event for user: ${userId}. Invoking WebSocket disconnect.`,
    );
    await this.realtimeService.disconnectUser(userId);
  }
}
