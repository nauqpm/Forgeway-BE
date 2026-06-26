import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { COMMON_ERROR_CODES } from '../constants/error-codes.constants';

interface ThrottlerLimitDetail {
  timeToBlockExpire?: number;
}

@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(
    _context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfterSeconds = Math.max(
      1,
      Number(throttlerLimitDetail.timeToBlockExpire ?? 1),
    );

    throw new HttpException(
      {
        message: 'Too many requests. Please try again later.',
        code: COMMON_ERROR_CODES.RATE_LIMITED,
        details: {
          retryAfterSeconds,
          retryAt: new Date(
            Date.now() + retryAfterSeconds * 1000,
          ).toISOString(),
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
