import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Response } from 'express';
import { applyRetryAfterHeader } from './retry-after.utils';
import { LoginRetryLaterException } from '../security/login-retry-later.exception';

describe('applyRetryAfterHeader', () => {
  let mockResponse: jest.Mocked<Response>;

  beforeEach(() => {
    mockResponse = {
      setHeader: jest.fn(),
    } as unknown as jest.Mocked<Response>;
  });

  it('ignores non-HttpException errors without modifying headers', () => {
    applyRetryAfterHeader(new Error('random error'), mockResponse);
    expect(mockResponse.setHeader).not.toHaveBeenCalled();
  });

  it('ignores unrelated HttpExceptions without modifying headers', () => {
    const ex = new HttpException('Not Found', HttpStatus.NOT_FOUND);
    applyRetryAfterHeader(ex, mockResponse);
    expect(mockResponse.setHeader).not.toHaveBeenCalled();
  });

  it('sets Retry-After header from LoginRetryLaterException (429)', () => {
    const retryAfterSeconds = 8;
    const ex = new LoginRetryLaterException(retryAfterSeconds);
    applyRetryAfterHeader(ex, mockResponse);

    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      String(retryAfterSeconds),
    );
  });

  it('sets Retry-After header for 429 with structured retryAfterSeconds detail', () => {
    const ex = new HttpException(
      {
        statusCode: 429,
        message: 'Please wait before trying again.',
        code: 'LOGIN_RETRY_LATER',
        details: { retryAfterSeconds: 5 },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    applyRetryAfterHeader(ex, mockResponse);

    expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '5');
  });

  it('ignores 429 without retryAfterSeconds in details', () => {
    const ex = new HttpException(
      { statusCode: 429, message: 'Too Many Requests' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    applyRetryAfterHeader(ex, mockResponse);

    expect(mockResponse.setHeader).not.toHaveBeenCalled();
  });

  it('sets Retry-After: 30 for ServiceUnavailableException (503)', () => {
    const ex = new ServiceUnavailableException(
      'Database temporarily unavailable',
    );
    applyRetryAfterHeader(ex, mockResponse);

    expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '30');
  });

  it('handles error with non-object response body gracefully', () => {
    const ex = new HttpException(
      'Too Many Requests',
      HttpStatus.TOO_MANY_REQUESTS,
    );
    applyRetryAfterHeader(ex, mockResponse);

    // No details to parse, so no header should be set
    expect(mockResponse.setHeader).not.toHaveBeenCalled();
  });
});
