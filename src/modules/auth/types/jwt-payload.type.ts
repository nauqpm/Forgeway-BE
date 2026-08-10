export interface JwtPayload {
  userId: string;
  rootUserId?: string;
  email?: string;
  role?: string;
  type?: string;
  mustChangePassword?: boolean;
  iat?: number;
  exp?: number;
}

export interface RefreshJwtPayload extends JwtPayload {
  userId: string;
  rootUserId?: string;
  type: 'refresh';
}
