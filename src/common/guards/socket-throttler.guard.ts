import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { CHAT_THROTTLE_CONFIG } from '../../modules/chat/constants/chat-throttler.constants';

@Injectable()
export class SocketThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(SocketThrottlerGuard.name);

  protected async handleRequest(requestProps: any): Promise<boolean> {
    const { context, throttler, generateKey } = requestProps;
    const client = context.switchToWs().getClient();
    const handler = context.getHandler();

    // 1. Resolve event name từ metadata của handler
    const eventMetadata = handler
      ? this.reflector.get<string>('message', handler) ||
        this.reflector.get<string | string[]>('events', handler)
      : null;
    const eventNames = Array.isArray(eventMetadata)
      ? eventMetadata
      : [eventMetadata];
    const eventName = eventNames[0];

    // 2. Resolve limit và ttl
    // Mặc định lấy từ requestProps (global default)
    let limit = requestProps.limit;
    let ttl = requestProps.ttl;

    // A. Lần đầu thử: Đọc từ @Throttle metadata của method
    if (handler) {
      const metadataLimit = this.reflector.get<number>(
        'THROTTLER:LIMITdefault',
        handler,
      );
      const metadataTtl = this.reflector.get<number>(
        'THROTTLER:TTLdefault',
        handler,
      );

      if (metadataLimit !== undefined) {
        limit = metadataLimit;
      }
      if (metadataTtl !== undefined) {
        ttl = metadataTtl;
      }
    }

    // B. Lần hai thử: Fallback tự động map bằng tên event nếu limit/ttl chưa đúng cấu hình chat mong muốn
    if (eventName) {
      let config: { limit: number; ttl: number } | null = null;
      if (['chat.join', 'chat.leave', 'chat.mark_read'].includes(eventName)) {
        // mark_read luôn đi kèm join khi đổi channel — cùng TTL
        config = CHAT_THROTTLE_CONFIG.ROOM_MANAGEMENT.default;
      } else if (['chat.edit', 'chat.delete'].includes(eventName)) {
        // Chỉ edit và delete — hành động chủ ý
        config = CHAT_THROTTLE_CONFIG.MESSAGE_ACTION.default;
      } else if (eventName === 'chat.reaction') {
        // Tách riêng — user có thể react nhiều tin cùng lúc
        config = CHAT_THROTTLE_CONFIG.REACTION.default;
      } else if (eventName === 'chat.send') {
        config = CHAT_THROTTLE_CONFIG.MESSAGE_SEND.default;
      } else if (eventName === 'chat.typing') {
        config = CHAT_THROTTLE_CONFIG.TYPING.default;
      }

      if (config) {
        limit = config.limit;
        ttl = config.ttl;
      }
    }

    const tracker = client.data?.user?.userId;
    if (!tracker) {
      this.logger.warn(
        `Disconnecting socket ${client.id} due to missing userId in authenticated context`,
      );
      client.disconnect(true);
      return false;
    }

    const eventMetadataKey = eventName || 'unknown';
    const key = generateKey(
      context,
      `${tracker}-${eventMetadataKey}`,
      throttler.name,
    );

    const { totalHits, timeToExpire } = await this.storageService.increment(
      key,
      ttl,
      limit,
      throttler.blockDuration ?? ttl,
      throttler.name,
    );

    this.logger.debug(
      `[THROTTLE] ${eventName} | user=${tracker} | hits=${totalHits}/${limit} | ttl=${ttl}ms`,
    );

    // 3. Đồng bộ hóa với cấu trúc dữ liệu của Realtime Module
    // Đảm bảo client.data.rateLimit luôn cập nhật để client biết trạng thái
    if (client.data) {
      const now = Date.now();
      if (
        !client.data.rateLimit ||
        now - client.data.rateLimit.windowStartedAt > ttl
      ) {
        client.data.rateLimit = { windowStartedAt: now, count: totalHits };
        this.logger.debug(
          `[THROTTLE] New window started for ${tracker} on ${eventName}`,
        );
      } else {
        client.data.rateLimit.count = totalHits;
      }
    }

    if (totalHits > limit) {
      this.logger.warn(
        `[RATE_LIMIT] ${eventName} BLOCKED | user=${tracker} | hits=${totalHits}/${limit} | retry=${timeToExpire}s`,
      );

      // Phát sự kiện lỗi tương thích với cả Chat và Realtime module (dùng 'exception' thay vì 'error' để tránh ngắt kết nối socket)
      client.emit('exception', {
        message: 'Too Many Requests',
        statusCode: 429,
        error: 'ThrottlerException',
      });

      // Chỉ phát 'rate_limited' với TTL còn lại (mili giây) cho các hành động foreground (tin nhắn)
      const NOTIFY_USER_EVENTS = [
        'chat.send',
        'chat.edit',
        'chat.delete',
        'chat.reaction',
      ];
      const shouldNotifyUser = eventNames.some(
        name => name && NOTIFY_USER_EVENTS.includes(name),
      );

      if (shouldNotifyUser) {
        const remainingMs = timeToExpire ? timeToExpire * 1000 : ttl;
        client.emit('rate_limited', { retryAfterMs: remainingMs, eventName });
      }

      throw new ThrottlerException();
    }

    return true;
  }
}
