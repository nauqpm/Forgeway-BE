import {
  createPushDeliveryInitialState,
  PushDeliveryStatus,
} from './web-push-delivery.constants';

describe('createPushDeliveryInitialState', () => {
  const now = new Date('2026-08-10T00:00:00.000Z');

  it('schedules an immediate pending delivery when web push is enabled', () => {
    expect(createPushDeliveryInitialState(true, now)).toEqual({
      status: PushDeliveryStatus.PENDING,
      nextAttemptAt: now,
    });
  });

  it('does not schedule delivery when web push is disabled', () => {
    expect(createPushDeliveryInitialState(false, now)).toEqual({
      status: PushDeliveryStatus.NOT_REQUESTED,
      nextAttemptAt: null,
    });
  });
});
