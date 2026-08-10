import { Injectable } from '@nestjs/common';
import { WEB_PUSH_DELIVERY_POLICY } from '../config/web-push.config';
import { PushSubscriptionInput } from '../dtos/web-push-subscription.dto';
import {
  WebPushSubscriptionsRepository,
} from '../repositories/web-push-subscriptions.repository';
import {
  WebPushSubscriptionDocument,
} from '../schemas/web-push-subscription.schema';
import { WebPushEndpointPolicy } from './web-push-endpoint-policy.service';

const TERMINAL_FAILURE_LIMIT = 3;

@Injectable()
export class WebPushSubscriptionsService {
  constructor(
    private readonly subscriptionsRepository: WebPushSubscriptionsRepository,
    private readonly endpointPolicy: WebPushEndpointPolicy,
  ) {}

  async upsertForUser(
    userId: string,
    input: PushSubscriptionInput,
  ): Promise<void> {
    this.endpointPolicy.assertAllowed(input.endpoint);
    await this.subscriptionsRepository.upsertForUser(userId, input);

    const subscriptions = await this.subscriptionsRepository.findAllForUser(
      userId,
    );
    const excess =
      subscriptions.length - WEB_PUSH_DELIVERY_POLICY.maxSubscriptionsPerUser;
    if (excess > 0) {
      await this.subscriptionsRepository.deleteLeastRecentlyUpdatedForUser(
        userId,
        excess,
      );
    }
  }

  removeForUser(
    userId: string,
    endpoint: string,
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    if (!expectedUpdatedAt) {
      return this.subscriptionsRepository.removeForUser(userId, endpoint);
    }

    return this.subscriptionsRepository.removeForUser(
      userId,
      endpoint,
      expectedUpdatedAt,
    );
  }

  findForUser(userId: string): Promise<WebPushSubscriptionDocument[]> {
    return this.subscriptionsRepository.findForUser(userId);
  }

  async recordFailureForUser(
    userId: string,
    endpoint: string,
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    const subscription =
      await this.subscriptionsRepository.recordFailureForUser(
        userId,
        endpoint,
        expectedUpdatedAt,
      );
    if (
      subscription &&
      subscription.failureCount >= TERMINAL_FAILURE_LIMIT
    ) {
      await this.removeForUser(userId, endpoint, subscription.updatedAt);
    }
  }

  resetFailureForUser(
    userId: string,
    endpoint: string,
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    return this.subscriptionsRepository.resetFailureForUser(
      userId,
      endpoint,
      expectedUpdatedAt,
    );
  }
}
