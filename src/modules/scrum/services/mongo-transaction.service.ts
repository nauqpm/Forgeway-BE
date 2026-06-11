// Bọc logic transaction MongoDB: withTransaction() và withSession().
// Dùng cho các thao tác cần transaction như start/complete sprint.
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';

@Injectable()
export class MongoTransactionService {
  private readonly logger = new Logger(MongoTransactionService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async withTransaction<T>(fn: (session: ClientSession | null) => Promise<T>): Promise<T> {
    let session: ClientSession | null = null;
    const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'local' || !process.env.NODE_ENV;

    try {
      try {
        session = await this.connection.startSession();
      } catch (sessionError: any) {
        const message = String(sessionError?.message ?? '').toLowerCase();
        const isUnsupported =
          message.includes('replica set') ||
          message.includes('transaction') ||
          sessionError.codeName === 'CommandNotSupportedOnStandalone' ||
          sessionError.code === 20;

        if (isUnsupported && isDev) {
          this.logger.warn(
            'Giao dịch MongoDB không khả dụng trong môi trường phát triển, chuyển sang thực hiện tuần tự mà không dùng session.',
          );
          return fn(null);
        }
        throw sessionError;
      }

      session.startTransaction();
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (error: any) {
      if (session?.inTransaction()) {
        try {
          await session.abortTransaction();
        } catch (abortError) {
          this.logger.error('Giao dịch MongoDB không thể hủy', abortError);
        }
      }

      const message = String(error?.message ?? '').toLowerCase();
      const isUnsupported =
        message.includes('replica set') ||
        message.includes('transaction') ||
        error.codeName === 'CommandNotSupportedOnStandalone' ||
        error.code === 20;

      if (isUnsupported && isDev) {
        this.logger.warn(
          'Giao dịch MongoDB không khả dụng trong môi trường phát triển, chuyển sang thực hiện tuần tự mà không dùng session.',
        );
        return fn(null);
      }

      if (isUnsupported) {
        throw new InternalServerErrorException(
          'Giao dịch MongoDB không khả dụng. Vui lòng chạy MongoDB dưới dạng replica set hoặc cấu hình lại cơ sở dữ liệu.',
        );
      }

      throw error;
    } finally {
      if (session) {
        await session.endSession();
      }
    }
  }

  withSession<T extends { session: (s: ClientSession) => T }>(query: T, session: ClientSession | null): T {
    return session ? query.session(session) : query;
  }
}
