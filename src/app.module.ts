import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FileModule } from './file/file.module';
import { PrismaModule } from './prisma/prisma.module';
import { GoogleDriveModule } from './google-drive/google-drive.module';
import { AuthModule } from './auth/auth.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { HealthModule } from './health/health.module';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Rate limiting configuration
    ThrottlerModule.forRoot([{
      ttl: 60, // Time-to-live in seconds
      limit: 20, // Maximum number of requests within TTL
    }]),
    // Structured logging with Winston
    WinstonModule.forRoot({
      transports: [
        // Console transport with custom formatting
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.ms(),
            nestWinstonModuleUtilities.format.nestLike('FileUploadService', {
              colors: true,
              prettyPrint: true,
            }),
          ),
        }),
        // File transport for persistent logging
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      ],
    }),
    PrismaModule,
    AuthModule,
    GoogleDriveModule,
    FileModule,
    HealthModule,
  ],
  providers: [
    // Apply rate limiting globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}