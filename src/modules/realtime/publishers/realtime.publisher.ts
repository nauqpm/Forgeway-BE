import { Injectable, Logger } from '@nestjs/common';

import { RealtimeEnvelope, RealtimeRoom } from '../contracts';
import { RealtimeService } from '../realtime.service';

@Injectable()
export class RealtimePublisher {
  private readonly logger = new Logger(RealtimePublisher.name);

  constructor(private readonly realtimeService: RealtimeService) {}

  emit<TData>(
    room: RealtimeRoom,
    envelope: RealtimeEnvelope<TData>,
    namespace?: string,
  ): void {
    const server = this.realtimeService.getServer();
    if (!server) {
      this.logger.warn('Socket server not ready, skipping realtime emit.');
      return;
    }

    try {
      if (namespace) {
        server.of(namespace).to(room).emit(envelope.type, envelope);
      } else {
        server.to(room).emit(envelope.type, envelope);
      }
    } catch (error) {
      this.logger.warn(
        `Realtime emit failed. room=${room}, type=${envelope.type}, reason=${(error as Error).message}`,
      );
    }
  }
}
