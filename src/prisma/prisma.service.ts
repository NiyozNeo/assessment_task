import { Injectable, OnModuleInit, OnModuleDestroy, Logger, INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
      errorFormat: 'pretty',
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      this.logger.log('Connecting to the database...');
      await this.$connect();
      this.logger.log('Successfully connected to the database');
    } catch (error) {
      this.logger.error('Failed to connect to the database', error.stack);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      this.logger.log('Disconnecting from the database...');
      await this.$disconnect();
      this.logger.log('Successfully disconnected from the database');
    } catch (error) {
      this.logger.error('Error disconnecting from the database', error.stack);
      // Don't throw here to avoid crashing the app during shutdown
    }
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    this.logger.log('Registering Prisma shutdown hooks');
    
    process.on('beforeExit', async () => {
      this.logger.log('App is about to exit, closing Prisma connections');
      await app.close();
    });
  }
}