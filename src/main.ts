import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as compression from 'compression';
import { join } from 'path';
import mongoose from 'mongoose';
import { RedisService } from './infra/redis/redis.service';
import { RedisSocketIoAdapter } from './infra/websocket/redis-socket-io.adapter';

// 👇 thêm
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

function normalizeCorsOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

function parseCorsOrigins(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map(origin => normalizeCorsOrigin(origin))
    .filter(Boolean);
}

async function bootstrap() {
  console.log('🚀 Đang khởi tạo ứng dụng NestJS...');

  try {
    console.log('📦 Đang chờ kết nối MongoDB hoàn tất...');
    await mongoose.connection.asPromise();
    console.log('✅ Kết nối MongoDB đã sẵn sàng, khởi động ứng dụng...');

    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    const redisService = app.get(RedisService);
    const websocketAdapter = new RedisSocketIoAdapter(app, redisService);
    await websocketAdapter.connectToRedis();
    app.useWebSocketAdapter(websocketAdapter);

    // Trust reverse proxy (Nginx)
    app.set('trust proxy', 1);

    // Security headers
    app.use(helmet());

    // Compression
    app.use(compression());

    // Hỗ trợ dữ liệu lớn
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Cookie parser
    app.use(cookieParser());

    // CORS - cho phép nhiều frontend origins
    const PORT = process.env.PORT || 5512;
    const isProduction = process.env.NODE_ENV === 'production';
    const configuredOrigins = [
      ...parseCorsOrigins(process.env.FRONTEND_URL),
      ...parseCorsOrigins(process.env.CORS_ORIGINS),
    ];

    const developmentOrigins = !isProduction
      ? [
          `http://localhost:${PORT}`,
          'http://localhost:5173',
          'http://localhost:5174',
          'http://localhost:5175',
          'http://localhost:3000',
          'http://localhost:3001',
        ]
      : [];

    const allowedOrigins = Array.from(
      new Set([...configuredOrigins, ...developmentOrigins]),
    );

    if (isProduction && allowedOrigins.length === 0) {
      throw new Error(
        'Production CORS requires FRONTEND_URL or CORS_ORIGINS to be configured',
      );
    }

    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile, curl, etc.)
        const normalizedOrigin = origin ? normalizeCorsOrigin(origin) : undefined;
        if (!normalizedOrigin || allowedOrigins.includes(normalizedOrigin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS policy`));
        }
      },
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      credentials: true,
    });

    // Validation
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Static assets
    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/uploads',
    });

    const swaggerEnabled =
      !isProduction && process.env.SWAGGER_ENABLED !== 'false';

    // Swagger is disabled by default in production.
    if (swaggerEnabled) {
      const config = new DocumentBuilder()
        .setTitle('Your API')
        .setDescription('API Documentation')
        .setVersion('1.0')
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            name: 'Authorization',
            in: 'header',
          },
          'access-token',
        )
        .addCookieAuth('refreshToken')
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api-docs', app, document, {
        swaggerOptions: { persistAuthorization: true },
      });
    }

    // await app.listen(PORT, '0.0.0.0'); // for LAN network deploy
    await app.listen(PORT);

    console.log(`🚀 Backend đang chạy tại: http://localhost:${PORT}`);

    if (swaggerEnabled) {
      console.log(`📄 Swagger docs: http://localhost:${PORT}/api-docs`);
    }
  } catch (error) {
    console.error('❌ Lỗi khởi động ứng dụng:', error);
    process.exit(1);
  }
}

void bootstrap();
