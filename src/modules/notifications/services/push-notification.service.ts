import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { UsersService } from '../../users/services/users.service';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private expo: Expo;

  constructor(private readonly usersService: UsersService) {
    this.expo = new Expo({
      // You can provide an access token if you have one configured in Expo
      // accessToken: process.env.EXPO_ACCESS_TOKEN,
      useFcmV1: true,
    });
  }

  /**
   * Send push notifications to a list of users.
   */
  async sendPushNotification(
    userIds: string[],
    title: string,
    body: string,
    data?: any,
  ): Promise<void> {
    if (!userIds || userIds.length === 0) {
      return;
    }

    try {
      const messages: ExpoPushMessage[] = [];
      const users = await this.usersService.getUsersByIds(userIds);

      for (const user of users) {
        if (!user.deviceTokens || user.deviceTokens.length === 0) {
          continue;
        }

        for (const pushToken of user.deviceTokens) {
          if (!Expo.isExpoPushToken(pushToken)) {
            this.logger.warn(
              `Push token ${pushToken} is not a valid Expo push token`,
            );
            continue;
          }

          messages.push({
            to: pushToken,
            sound: 'default',
            title,
            body,
            data: data || {},
          });
        }
      }

      if (messages.length === 0) {
        return;
      }

      const chunks = this.expo.chunkPushNotifications(messages);
      const tickets: ExpoPushTicket[] = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          this.logger.error(`Error sending push notification chunk`, error);
        }
      }

      // Handle tickets to clean up invalid tokens
      await this.handleTickets(messages, tickets);
    } catch (error) {
      this.logger.error(`Failed to send push notifications: ${error}`);
    }
  }

  private async handleTickets(
    messages: ExpoPushMessage[],
    tickets: ExpoPushTicket[],
  ) {
    // Collect DeviceNotRegistered errors to remove invalid tokens
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
      ) {
        const invalidToken = messages[i].to;
        this.logger.log(`Cleaning up invalid push token: ${invalidToken}`);
        // To remove the token, we would need the userId.
        // For a more robust cleanup, you could map the token back to the user and call usersService.removeDeviceToken.
        // Alternatively, the usersService can have a method to pull a token globally.
        // For now, we log it. A background job could clean these up using Expo receipts.
      }
    }
  }
}
