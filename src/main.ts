import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as morgan from 'morgan';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as compression from 'compression';
import helmet from 'helmet';

async function bootstrap() {
  try {
    // Create logs directory if it doesn't exist
    await fs.mkdir(path.join(process.cwd(), 'logs'), { recursive: true });

    // Create NestJS application with structured logging
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bufferLogs: true, // Buffer logs until logger is set up
    });

    // Use Winston for logging
    app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

    // Get Prisma service for shutdown hooks
    const prismaService = app.get(PrismaService);
    await prismaService.enableShutdownHooks(app);

    // Setup global validation pipes
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // Setup Swagger documentation
    setupSwagger(app);

    // Setup HTTP request logging with Morgan
    app.use(morgan('combined', {
      stream: {
        write: (message: string) => {
          app.get(WINSTON_MODULE_NEST_PROVIDER).log(message.trim(), 'HTTP');
        },
      },
    }));

    // Enable security headers with helmet
    app.use(helmet());

    // Enable compression
    app.use(compression());

    // Enable CORS
    app.enableCors();

    // Start the server
    const port = process.env.PORT || 3000;
    await app.listen(port);
    
    // Log application startup details
    const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
    logger.log(`Application is running on: http://localhost:${port}`, 'Bootstrap');
    logger.log(`Swagger documentation is available at: http://localhost:${port}/api`, 'Bootstrap');
    logger.log(`Health checks available at: http://localhost:${port}/health`, 'Bootstrap');
  } catch (error) {
    console.error(`Error starting server: ${error.message}`, error.stack);
    process.exit(1);
  }
}

function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('File Upload Service')
    .setDescription('API for uploading files to Google Drive with enhanced validation, performance, and monitoring')
    .setVersion('1.1')
    .addBearerAuth()
    .addTag('files', 'Endpoints for managing file uploads')
    .addTag('health', 'Endpoints for monitoring system health')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
}

bootstrap();