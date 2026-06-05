export interface JwtPayload {
  userId: string;
  email?: string;
  role?: string;
  type?: string;
  iat?: number;
  exp?: number;
}

export interface RefreshJwtPayload extends JwtPayload {
  userId: string;
  type: 'refresh';
}
