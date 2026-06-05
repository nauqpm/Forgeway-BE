export const TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh',
  PASSWORD_RESET_GRANT: 'password-reset-grant',
} as const;

export type TokenTypeLiteral = (typeof TOKEN_TYPES)[keyof typeof TOKEN_TYPES];

export const TOKEN_STATUS = {
  ACTIVE: true,
  REVOKED: false,
} as const;
