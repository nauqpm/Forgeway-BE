import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser = require('cookie-parser');
import request = require('supertest');
import { App } from 'supertest/types';

import { AuthRegistrationController } from './auth-registration.controller';
import { AuthRegistrationService } from '../services/auth-registration.service';
import { RegistrationVerificationService } from '../services/registration-verification.service';
import { AuditLogService } from '../../audit/services/audit-log.service';

describe('AuthRegistrationController', () => {
  let app: INestApplication<App>;

  const authRegistrationServiceMock = {
    register: jest.fn(),
  };

  const registrationVerificationServiceMock = {
    verifyRegistrationEmail: jest.fn(),
    resendRegistrationVerification: jest.fn(),
  };

  const auditLogServiceMock = {
    logRequest: jest.fn(),
    log: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthRegistrationController],
      providers: [
        {
          provide: AuthRegistrationService,
          useValue: authRegistrationServiceMock,
        },
        {
          provide: RegistrationVerificationService,
          useValue: registrationVerificationServiceMock,
        },
        { provide: AuditLogService, useValue: auditLogServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /auth/check-email', () => {
    it('returns success when email is provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/check-email?email=test@example.com')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'You can proceed with registration.',
      });
    });

    it('rejects request without email with 400', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/check-email')
        .expect(400);

      expect(response.body.statusCode).toBe(400);
      expect(response.body.message).toBe('Email is required');
    });
  });

  describe('POST /auth/register', () => {
    const registerDto = {
      email: 'newuser@example.com',
      password: 'StrongPass1!',
    };

    it('returns 201 with registration success and audits success', async () => {
      const serviceResult = {
        success: true,
        message:
          'Registration successful. Please check your email to verify your account.',
        email: registerDto.email,
      };
      authRegistrationServiceMock.register.mockResolvedValue(serviceResult);

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201);

      expect(response.body).toEqual(serviceResult);
      expect(authRegistrationServiceMock.register).toHaveBeenCalledWith(
        registerDto,
      );
      expect(auditLogServiceMock.logRequest).toHaveBeenCalledWith(
        expect.anything(),
        {
          type: 'REGISTER_SUCCESS',
          severity: 'INFO',
          email: registerDto.email,
        },
      );
    });

    it('audits failure when registration throws and re-throws the error', async () => {
      const error = new Error('Email already in use');
      (error as any).status = 409;
      authRegistrationServiceMock.register.mockRejectedValue(error);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(500);

      expect(auditLogServiceMock.logRequest).toHaveBeenCalledWith(
        expect.anything(),
        {
          type: 'REGISTER_FAILED',
          severity: 'WARN',
          email: registerDto.email,
          metadata: { reason: 'Email already in use' },
        },
      );
    });
  });

  describe('POST /auth/verify-email', () => {
    const verifyDto = { email: 'user@example.com', code: '123456' };

    it('returns 200 with verification success and audits', async () => {
      const serviceResult = {
        success: true,
        message: 'Email verification successful.',
      };
      registrationVerificationServiceMock.verifyRegistrationEmail.mockResolvedValue(
        serviceResult,
      );

      const response = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send(verifyDto)
        .expect(200);

      expect(response.body).toEqual(serviceResult);
      expect(
        registrationVerificationServiceMock.verifyRegistrationEmail,
      ).toHaveBeenCalledWith(verifyDto.email, verifyDto.code);
      expect(auditLogServiceMock.logRequest).toHaveBeenCalledWith(
        expect.anything(),
        {
          type: 'EMAIL_VERIFICATION_SUCCESS',
          severity: 'INFO',
          email: verifyDto.email,
        },
      );
    });

    it('audits failure on verification error and re-throws', async () => {
      const error = new Error('Invalid code');
      (error as any).status = 400;
      registrationVerificationServiceMock.verifyRegistrationEmail.mockRejectedValue(
        error,
      );

      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send(verifyDto)
        .expect(500);

      expect(auditLogServiceMock.logRequest).toHaveBeenCalledWith(
        expect.anything(),
        {
          type: 'EMAIL_VERIFICATION_FAILED',
          severity: 'WARN',
          email: verifyDto.email,
          metadata: { reason: 'Invalid code' },
        },
      );
    });
  });

  describe('POST /auth/resend-verification', () => {
    const resendDto = { email: 'user@example.com' };

    it('returns 200 with resend success and audits', async () => {
      const serviceResult = {
        success: true,
        message:
          'If the email requires verification, new instructions have been sent.',
      };
      registrationVerificationServiceMock.resendRegistrationVerification.mockResolvedValue(
        serviceResult,
      );

      const response = await request(app.getHttpServer())
        .post('/auth/resend-verification')
        .send(resendDto)
        .expect(200);

      expect(response.body).toEqual(serviceResult);
      expect(
        registrationVerificationServiceMock.resendRegistrationVerification,
      ).toHaveBeenCalledWith(resendDto.email);
      expect(auditLogServiceMock.logRequest).toHaveBeenCalledWith(
        expect.anything(),
        {
          type: 'EMAIL_VERIFICATION_RESENT',
          severity: 'INFO',
          email: resendDto.email,
        },
      );
    });

    it('audits failure on resend error and re-throws', async () => {
      const error = new Error('Send failed');
      (error as any).status = 500;
      registrationVerificationServiceMock.resendRegistrationVerification.mockRejectedValue(
        error,
      );

      await request(app.getHttpServer())
        .post('/auth/resend-verification')
        .send(resendDto)
        .expect(500);

      expect(auditLogServiceMock.logRequest).toHaveBeenCalledWith(
        expect.anything(),
        {
          type: 'EMAIL_VERIFICATION_RESEND_FAILED',
          severity: 'WARN',
          email: resendDto.email,
          metadata: { reason: 'Send failed' },
        },
      );
    });
  });
});
