import { ErrorFactory } from '../../../common/factories/error.factory';

/**
 * @deprecated Use {@link ErrorFactory} from 'common/factories/error.factory' instead.
 * This class is kept for backward compatibility and delegates to the shared ErrorFactory.
 */
export class AuthErrorFactory {
  static publicLoginFailure(retryAfterSeconds = 0) {
    return ErrorFactory.publicLoginFailure(retryAfterSeconds);
  }

  static loginRetryLater(retryAfterSeconds: number) {
    return ErrorFactory.loginRetryLater(retryAfterSeconds);
  }

  static emailNotVerified() {
    return ErrorFactory.emailNotVerified();
  }

  static accountSuspended() {
    return ErrorFactory.accountSuspended();
  }

  static accountDeactivated() {
    return ErrorFactory.accountDeactivated();
  }
}

// Re-export the type for backward compatibility
export type { ErrorPayload as AuthErrorPayload } from '../../../common/factories/error.factory';
