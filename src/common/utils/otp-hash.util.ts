import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_DEV_OTP_HASH_SECRET = 'development-only-otp-hash-secret';
const HASH_ALGORITHM = 'sha256';

export function hashOtpCode(code: string): string {
  return createHmac(HASH_ALGORITHM, getOtpHashSecret())
    .update(code)
    .digest('hex');
}

export function verifyOtpCode(inputCode: string, storedHash: string): boolean {
  const inputHash = hashOtpCode(inputCode);
  const inputBuffer = Buffer.from(inputHash, 'utf8');
  const storedBuffer = Buffer.from(storedHash, 'utf8');

  if (inputBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(inputBuffer, storedBuffer);
}

function getOtpHashSecret(): string {
  const secret = process.env.OTP_HASH_SECRET || process.env.JWT_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('OTP_HASH_SECRET is required in production');
  }

  return DEFAULT_DEV_OTP_HASH_SECRET;
}
