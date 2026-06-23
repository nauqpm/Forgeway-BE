export const REALTIME_EVENT_TYPES = {
  // Chat events
  CHAT_MESSAGE_SENT: 'chat.message.sent',
  CHAT_MESSAGE_EDITED: 'chat.message.edited',
  CHAT_MESSAGE_DELETED: 'chat.message.deleted',
  CHAT_USER_TYPING: 'chat.user.typing',
  CHAT_REACTION_UPDATED: 'chat.reaction.updated',
  CHAT_UNREAD_UPDATE: 'chat.unread_update',
  CHAT_CHANNEL_CREATED: 'chat.channel.created',
  CHAT_CHANNEL_UPDATED: 'chat.channel.updated',
  CHAT_CHANNEL_DELETED: 'chat.channel.deleted',
  CHAT_CHANNEL_MEMBER_ADDED: 'chat.channel.member.added',
  CHAT_CHANNEL_MEMBER_REMOVED: 'chat.channel.member.removed',
  CHAT_KICKED_FROM_CHANNEL: 'chat.kicked.from.channel',
  CHAT_CHANNEL_VISIBILITY_CHANGED: 'chat.channel.visibility.changed',
  CHAT_THREAD_REPLY_CREATED: 'chat.thread.reply.created',

  // Meeting events
  MEETING_USER_JOINED: 'meeting.user.joined',
  MEETING_USER_LEFT: 'meeting.user.left',
  MEETING_USER_AUDIO_CHANGED: 'meeting.user.audio_changed',
  MEETING_USER_VIDEO_CHANGED: 'meeting.user.video_changed',
  MEETING_ENDED: 'meeting.ended',
  MEETING_STARTED: 'meeting.started',

  // Task events
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_MOVED: 'task.moved',
  TASK_REORDERED: 'task.reordered',
  TASK_ARCHIVED: 'task.archived',
  TASK_RESTORED: 'task.restored',
  TASK_DELETED: 'task.deleted',

  SPRINT_CREATED: 'sprint.created',
  SPRINT_UPDATED: 'sprint.updated',
  SPRINT_DELETED: 'sprint.deleted',
  SPRINT_STARTED: 'sprint.started',
  SPRINT_COMPLETED: 'sprint.completed',

  NOTIFICATION_CREATED: 'notification.created',
  NOTIFICATION_READ: 'notification.read',
  NOTIFICATION_READ_ALL: 'notification.read_all',

  WORKSPACE_CREATED: 'workspace.created',
  WORKSPACE_INVITE_CREATED: 'workspace.invite.created',
  WORKSPACE_UPDATED: 'workspace.updated',
  WORKSPACE_ARCHIVED: 'workspace.archived',
  WORKSPACE_RESTORED: 'workspace.restored',
  WORKSPACE_DELETED: 'workspace.deleted',
  WORKSPACE_MEMBER_JOINED: 'workspace.member.joined',
  WORKSPACE_MEMBER_REMOVED: 'workspace.member.removed',
  WORKSPACE_MEMBER_ROLE_UPDATED: 'workspace.member.role_updated',

  TASK_COMMENT_CREATED: 'task.comment.created',
  TASK_COMMENT_UPDATED: 'task.comment.updated',
  TASK_COMMENT_DELETED: 'task.comment.deleted',
  TASK_ATTACHMENT_ADDED: 'task.attachment.added',
  TASK_ATTACHMENT_DELETED: 'task.attachment.deleted',
  TASK_LABELS_UPDATED: 'task.labels.updated',
  TASK_COVER_UPDATED: 'task.cover.updated',
  TASK_ACTIVITY_CREATED: 'task.activity.created',

  PAGE_UPDATED: 'page.updated',
  PAGE_YJS_UPDATE: 'page.yjs-update',
} as const;

export type RealtimeEventType =
  (typeof REALTIME_EVENT_TYPES)[keyof typeof REALTIME_EVENT_TYPES];
