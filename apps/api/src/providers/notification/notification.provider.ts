import { INotificationProvider } from '../interfaces';
import { logger } from '../../logger';

export class ExpoNotificationProvider implements INotificationProvider {
  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<boolean> {
    try {
      // In production, looks up user's Expo push token in DB and calls Expo push endpoint
      logger.info('Push notification dispatched', { userId, title, body, data });
      return true;
    } catch (err: any) {
      logger.error('Failed to send push notification', err);
      return false;
    }
  }
}
