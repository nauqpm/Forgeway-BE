export class Expo {
  constructor() {}
  chunkPushNotifications() { return []; }
  sendPushNotificationsAsync() { return Promise.resolve([]); }
  static isExpoPushToken() { return true; }
}
