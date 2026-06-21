// import { Injectable, Logger } from '@nestjs/common';
// import { Cron, CronExpression } from '@nestjs/schedule';
// import { LiveKitWebhookRepository } from '../livekit-webhook.repository';
// import { LivekitWebhookService } from '../services/livekit-webhook.service';

// @Injectable()
// export class WebhookCronJob {
//   private readonly logger = new Logger(WebhookCronJob.name);

//   constructor(
//     private readonly webhookRepository: LiveKitWebhookRepository,
//     private readonly livekitWebhookService: LivekitWebhookService,
//   ) {}

//   @Cron(CronExpression.EVERY_5_MINUTES)
//   async processPendingWebhooks() {
//     this.logger.debug(
//       'Running cron job to process pending LiveKit webhooks...',
//     );
//     try {
//       // Find unprocessed webhooks, limit 20 items to process each time
//       const pendingWebhooks = await this.webhookRepository.model
//         .find({
//           processed: false,
//         })
//         .limit(20);

//       for (const webhook of pendingWebhooks) {
//         try {
//           await this.livekitWebhookService.processWebhookRecord(webhook);
//           this.logger.debug(
//             `Successfully processed pending webhook ${webhook.eventId}`,
//           );
//         } catch (error) {
//           this.logger.error(
//             `Failed to process webhook ${webhook.eventId}: ${(error as Error).message}`,
//           );
//         }
//       }
//     } catch (error) {
//       this.logger.error(
//         `Error in processPendingWebhooks cron job: ${(error as Error).message}`,
//       );
//     }
//   }

//   @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
//   async cleanupOldWebhooks() {
//     this.logger.debug('Running cron job to clean up old processed webhooks...');
//     try {
//       const oneDayAgo = new Date();
//       oneDayAgo.setDate(oneDayAgo.getDate() - 1);

//       const result = await this.webhookRepository.model.deleteMany({
//         processed: true,
//         processedAt: { $lt: oneDayAgo },
//       });

//       this.logger.debug(
//         `Cleaned up ${result.deletedCount} old processed webhooks.`,
//       );
//     } catch (error) {
//       this.logger.error(
//         `Error in cleanupOldWebhooks cron job: ${(error as Error).message}`,
//       );
//     }
//   }
// }
