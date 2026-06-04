export const REALTIME_EVENT_TYPES = {
  // Chat events
  CHAT_MESSAGE_SENT: 'chat.message.sent',
  CHAT_MESSAGE_EDITED: 'chat.message.edited',
  CHAT_MESSAGE_DELETED: 'chat.message.deleted',
  CHAT_USER_TYPING: 'chat.user.typing',

  // Meeting events
  MEETING_USER_JOINED: 'meeting.user.joined',
  MEETING_USER_LEFT: 'meeting.user.left',
  MEETING_USER_AUDIO_CHANGED: 'meeting.user.audio_changed',
  MEETING_USER_VIDEO_CHANGED: 'meeting.user.video_changed',
  MEETING_ENDED: 'meeting.ended',

  // WebRTC signaling
  RTC_OFFER: 'rtc.offer',
  RTC_ANSWER: 'rtc.answer',
  RTC_ICE_CANDIDATE: 'rtc.ice',

  // Task events (assuming these from prompt's mention of task.*)
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_DELETED: 'task.deleted',
  TASK_MOVED: 'task.moved',

  // Notification events
  NOTIFICATION_CREATED: 'notification.created',
  
  // Workspace events
  WORKSPACE_UPDATED: 'workspace.updated',
} as const;

export type RealtimeEventType = typeof REALTIME_EVENT_TYPES[keyof typeof REALTIME_EVENT_TYPES];

export interface RealtimeEnvelope<TData> {
  event: RealtimeEventType;
  data: TData;
  timestamp: string;
}
