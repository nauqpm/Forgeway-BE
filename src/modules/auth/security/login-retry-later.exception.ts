import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthErrorFactory } from '../utils/auth-error.factory';

export class LoginRetryLaterException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      AuthErrorFactory.loginRetryLater(retryAfterSeconds),
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
