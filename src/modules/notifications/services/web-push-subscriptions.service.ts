import { Injectable } from '@nestjs/common';
import { PushSubscriptionInput } from '../dtos/web-push-subscription.dto';
import { WebPushSubscriptionsRepository } from '../repositories/web-push-subscriptions.repository';
import { WebPushSubscriptionDocument } from '../schemas/web-push-subscription.schema';

@Injectable()
export class WebPushSubscriptionsService {
  constructor(
    private readonly subscriptionsRepository: WebPushSubscriptionsRepository,
  ) {}

  upsertForUser(userId: string, input: PushSubscriptionInput): Promise<void> {
    return this.subscriptionsRepository.upsertForUser(userId, input);
  }

  removeForUser(userId: string, endpoint: string): Promise<void> {
    return this.subscriptionsRepository.removeForUser(userId, endpoint);
  }

  findForUser(userId: string): Promise<WebPushSubscriptionDocument[]> {
    return this.subscriptionsRepository.findForUser(userId);
  }
}
