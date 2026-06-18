// Centralized non-token durations/constants. Auth token TTLs live in AuthTokenConfigService.

export const AUTH_CONSTANTS = {
  PASSWORD_RESET_EXPIRES_MS: 15 * 60 * 1000,
  OTP_EXPIRES_MS: 15 * 60 * 1000,
  OTP_LENGTH: 6,

  // SEC-8 grace period to avoid false-positive concurrent refresh
  CONCURRENT_REFRESH_GRACE_MS: 15_000,
} as const;
