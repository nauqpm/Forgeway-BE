export const PushDeliveryStatus = {
  NOT_REQUESTED: 'not_requested',
  PENDING: 'pending',
  PROCESSING: 'processing',
  RETRY: 'retry',
  DELIVERED: 'delivered',
  SKIPPED: 'skipped',
  EXPIRED: 'expired',
  FAILED: 'failed',
} as const;

export type PushDeliveryStatusValue =
  (typeof PushDeliveryStatus)[keyof typeof PushDeliveryStatus];

export interface PushDeliveryInitialState {
  status:
    | typeof PushDeliveryStatus.PENDING
    | typeof PushDeliveryStatus.NOT_REQUESTED;
  nextAttemptAt: Date | null;
}

export function createPushDeliveryInitialState(
  enabled: boolean,
  now = new Date(),
): PushDeliveryInitialState {
  return enabled
    ? { status: PushDeliveryStatus.PENDING, nextAttemptAt: now }
    : { status: PushDeliveryStatus.NOT_REQUESTED, nextAttemptAt: null };
}
