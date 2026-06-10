/**
 * Rate limiting configurations for Chat module.
 * We define these as direct configuration objects to be used with @Throttle decorator.
 */

export const CHAT_THROTTLE_CONFIG = {
  // Join/Leave channel (lower frequency)
  ROOM_MANAGEMENT: {
    default: {
      limit: 10,
      ttl: 60000,
    },
  },

  // Sending messages (medium frequency)
  MESSAGE_SEND: {
    default: {
      limit: 5,
      ttl: 10000,
    },
  },

  // Editing/Deleting/Reacting (medium frequency)
  MESSAGE_ACTION: {
    default: {
      limit: 5,
      ttl: 30000,
    },
  },

  // Typing indicators (very high frequency, strictly limited)
  TYPING: {
    default: {
      limit: 1,
      ttl: 2000,
    },
  },

  // General API lookups
  API_QUERY: {
    default: {
      limit: 30,
      ttl: 60000,
    },
  },
};
