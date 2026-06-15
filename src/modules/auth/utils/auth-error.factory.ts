import { PASSWORD_POLICY } from '../../../common/constants/password-policy.constants';
import { ErrorFactory } from '../../../common/factories/error.factory';

/**
 * @deprecated Use {@link ErrorFactory} from 'common/factories/error.factory' instead.
 * This class is kept for backward compatibility and delegates to the shared ErrorFactory.
 */
export class AuthErrorFactory {
  static publicLoginFailure() {
    return ErrorFactory.publicLoginFailure();
  }

  static invalidCredentials(remainingAttempts?: number) {
    return ErrorFactory.invalidCredentials(
      remainingAttempts ?? PASSWORD_POLICY.maxFailedAttempts - 1,
    );
  }

  static accountLocked(lockedUntil: string) {
    return ErrorFactory.accountLocked(lockedUntil);
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
