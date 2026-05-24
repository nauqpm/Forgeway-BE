import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import { join } from 'path';
import mongoose from 'mongoose';

// 👇 thêm
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  console.log('🚀 Đang khởi tạo ứng dụng NestJS...');

  try {
    console.log('📦 Đang chờ kết nối MongoDB hoàn tất...');
    await mongoose.connection.asPromise();
    console.log('✅ Kết nối MongoDB đã sẵn sàng, khởi động ứng dụng...');

    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    // Trust reverse proxy (Nginx)
    app.set('trust proxy', 1);

    // Hỗ trợ dữ liệu lớn
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Cookie parser
    app.use(cookieParser());

    // CORS
    app.enableCors({
      origin: process.env.FRONTEND_URL,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      allowedHeaders: 'Content-Type, Authorization',
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
    app.useStaticAssets(join(__dirname, '..', 'uploads'), {
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

    const PORT = process.env.PORT || 5512;

    await app.listen(PORT);

    console.log(`🚀 Backend đang chạy tại: http://localhost:${PORT}`);

    console.log(`📄 Swagger docs: http://localhost:${PORT}/api-docs`);
  } catch (error) {
    console.error('❌ Lỗi khởi động ứng dụng:', error);
    process.exit(1);
  }
}

bootstrap();
