export const USER_STATUSES = {
  PENDING_VERIFICATION: 'pending_verification',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BANNED: 'banned',
} as const;

export type UserStatus = (typeof USER_STATUSES)[keyof typeof USER_STATUSES];
