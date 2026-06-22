/**
 * Rate limiting configurations for Chat module.
 * We define these as direct configuration objects to be used with @Throttle decorator.
 */

export const CHAT_THROTTLE_CONFIG = {
  // Join/Leave/MarkRead — luôn đi kèm nhau khi đổi channel
  // Mỗi lần đổi channel = 1 join + 1 markRead = 2 events
  // Limit 30/60s = cho phép đổi 15 channel/phút — đủ dùng
  ROOM_MANAGEMENT: {
    default: { limit: 30, ttl: 60000 },
  },

  // Sending messages — giữ nguyên
  MESSAGE_SEND: {
    default: { limit: 5, ttl: 10000 },
  },

  // Edit/Delete — hành động chủ ý, giữ nguyên
  MESSAGE_ACTION: {
    default: { limit: 10, ttl: 30000 }, // tăng nhẹ từ 5 lên 10
  },

  // Typing — giữ nguyên
  TYPING: {
    default: { limit: 1, ttl: 2000 },
  },

  // Reaction — tách riêng khỏi MESSAGE_ACTION vì dùng nhiều hơn
  REACTION: {
    default: { limit: 20, ttl: 10000 },
  },

  API_QUERY: {
    default: { limit: 30, ttl: 60000 },
  },
};
