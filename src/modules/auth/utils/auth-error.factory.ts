import { AUTH_ERROR_CODES } from '../constants/auth-error.constants';
import { PASSWORD_POLICY } from '../../../common/constants/password-policy.constants';

export interface AuthErrorPayload {
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

export class AuthErrorFactory {
  static publicLoginFailure(): AuthErrorPayload {
    return {
      message: 'Email or password is incorrect.',
      code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    };
  }

  static invalidCredentials(remainingAttempts?: number): AuthErrorPayload {
    return {
      message: 'Email or password is incorrect.',
      code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      details: {
        remainingAttempts: remainingAttempts ?? PASSWORD_POLICY.maxFailedAttempts - 1,
        maxAttempts: PASSWORD_POLICY.maxFailedAttempts,
      },
    };
  }

  static accountLocked(lockedUntil: string): AuthErrorPayload {
    return {
      message: 'Account has been temporarily locked due to too many failed password attempts.',
      code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
      details: {
        lockedUntil,
        remainingAttempts: 0,
        maxAttempts: PASSWORD_POLICY.maxFailedAttempts,
      },
    };
  }

  static emailNotVerified(): AuthErrorPayload {
    return {
      message: 'Please verify your email before signing in.',
      code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
    };
  }

  static accountSuspended(): AuthErrorPayload {
    return {
      message: 'Account has been locked or suspended.',
      code: AUTH_ERROR_CODES.USER_SUSPENDED,
    };
  }

  static accountDeactivated(): AuthErrorPayload {
    return {
      message: 'Account has been locked or suspended.',
      code: AUTH_ERROR_CODES.USER_DEACTIVATED,
    };
  }
}
