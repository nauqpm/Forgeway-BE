export interface JwtPayload {
  userId: string;
  email?: string;
  role?: string;
  type?: string;
  iat?: number;
  exp?: number;
}

export interface PasswordResetJwtPayload extends JwtPayload {
  email: string;
  type: 'password-reset';
}

export interface RefreshJwtPayload extends JwtPayload {
  userId: string;
  type: 'refresh';
}
