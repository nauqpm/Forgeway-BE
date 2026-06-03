import { Socket } from 'socket.io';

export interface SocketUser {
  userId: string;
  email?: string;
  role?: string;
}

export type AuthenticatedSocket = Socket & {
  data: {
    user?: SocketUser;
    disconnectTimer?: NodeJS.Timeout;
    rateLimit?: {
      windowStartedAt: number;
      count: number;
    };
  };
};
