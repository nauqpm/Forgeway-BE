import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import { join } from 'path';
import mongoose from 'mongoose';
import { RedisService } from './infra/redis/redis.service';
import { RedisSocketIoAdapter } from './infra/websocket/redis-socket-io.adapter';
import {
  assertProductionCorsOriginsConfigured,
  getAllowedCorsOrigins,
  isCorsOriginAllowed,
} from './config/cors-origins.config';
import { getUploadDir } from './config/upload-storage.config';

// Swagger documentation
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';


async function bootstrap() {
  console.log('Starting NestJS application...');

  try {
    console.log('Waiting for MongoDB connection...');
    await mongoose.connection.asPromise();
    console.log('MongoDB connection is ready. Bootstrapping application...');

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

    // Large payload support
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Cookie parser
    app.use(cookieParser());

    // CORS - allow configured frontend origins
    const PORT = process.env.PORT || 5512;
    const isProduction = process.env.NODE_ENV === 'production';
    const allowedOrigins = getAllowedCorsOrigins();
    assertProductionCorsOriginsConfigured(allowedOrigins);

    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile, curl, etc.)
        if (isCorsOriginAllowed(origin, allowedOrigins)) {
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
    app.useStaticAssets(getUploadDir(), {
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

    console.log(`Backend is running at: http://localhost:${PORT}`);

    if (swaggerEnabled) {
      console.log(`Swagger docs: http://localhost:${PORT}/api-docs`);
    }
  } catch (error) {
    console.error('Application startup failed:', error);
    process.exit(1);
  }
}

void bootstrap();
