import { createHash } from 'crypto';

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
