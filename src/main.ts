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
    const configuredOrigins = [
      process.env.FRONTEND_URL,
      ...(process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean),
    ];

    const allowedOrigins = [
      ...configuredOrigins,
      `http://localhost:${PORT}`,
      'http://localhost:5173', // Vite dev server (Admin FE)
      'http://localhost:5174', // Vite alternative
      'http://localhost:5175',
      'http://localhost:3000', // Next.js/React default
      'http://localhost:3001',
    ].filter(Boolean);

    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile, curl, etc.)
        if (!origin || allowedOrigins.includes(origin)) {
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

    // ======================
    // Swagger Config
    // ======================
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
      // Nếu dùng HttpOnly Cookie refresh token
      .addCookieAuth('refreshToken')
      .build();

    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('api-docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true, // giữ token khi refresh page
      },
    });

    // await app.listen(PORT, '0.0.0.0'); // for LAN network deploy
    await app.listen(PORT);

    console.log(`🚀 Backend đang chạy tại: http://localhost:${PORT}`);

    console.log(`📄 Swagger docs: http://localhost:${PORT}/api-docs`);
  } catch (error) {
    console.error('❌ Lỗi khởi động ứng dụng:', error);
    process.exit(1);
  }
}

void bootstrap();
