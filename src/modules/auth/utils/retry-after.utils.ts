import { HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

/**
 * Apply Retry-After HTTP header based on structured HttpException responses.
 *
 * - 429 (TOO_MANY_REQUESTS): reads retryAfterSeconds from the structured details.
 * - 503 (SERVICE_UNAVAILABLE): sets Retry-After: 30 for database-unavailable scenarios.
 * - All other exceptions are ignored and headers are left unmodified.
 */
export function applyRetryAfterHeader(
  error: unknown,
  response: Response,
): void {
  if (!(error instanceof HttpException)) return;

  const status = error.getStatus();

  if (status === HttpStatus.TOO_MANY_REQUESTS) {
    const responseBody = error.getResponse();
    const details =
      typeof responseBody === 'object' && responseBody !== null
        ? (responseBody as { details?: { retryAfterSeconds?: unknown } })
            .details
        : undefined;
    const retryAfterSeconds = details?.retryAfterSeconds;
    if (typeof retryAfterSeconds === 'number') {
      response.setHeader('Retry-After', String(retryAfterSeconds));
    }
    return;
  }

  if (status === HttpStatus.SERVICE_UNAVAILABLE) {
    response.setHeader('Retry-After', '30');
  }
}
