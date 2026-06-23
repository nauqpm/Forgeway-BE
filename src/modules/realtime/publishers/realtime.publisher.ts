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
      // If server is a Namespace (e.g. from NestJS gateway), get root Server from server.server
      const rootServer = (server as any).server || server;

      if (namespace) {
        // Ensure namespace starts with '/'
        const ns = namespace.startsWith('/') ? namespace : `/${namespace}`;
        rootServer.of(ns).to(room).emit(envelope.type, envelope);
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
