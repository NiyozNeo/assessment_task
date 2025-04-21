import { Controller, Get } from '@nestjs/common';
import { 
  HealthCheck, 
  HealthCheckService, 
  HttpHealthIndicator, 
  DiskHealthIndicator,
  MemoryHealthIndicator,
  PrismaHealthIndicator
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as os from 'os';
import * as path from 'path';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private disk: DiskHealthIndicator,
    private memory: MemoryHealthIndicator,
    private readonly prismaService: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check overall system health' })
  check() {
    // Get system root directory in a platform-independent way
    const rootDrive = process.platform === 'win32' 
      ? process.cwd().split(path.sep)[0] + path.sep  // Something like "C:\"
      : '/';

    return this.health.check([
      // Check if API is responding
      () => this.http.pingCheck('api', 'http://localhost:3000/api'),
      
      // Check disk space
      () => this.disk.checkStorage('storage', { 
        path: rootDrive, 
        thresholdPercent: 0.9,  // Warn if disk is 90% full
      }),
      
      // Check memory usage
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024), // 300MB
      
      // Database connection check
      async () => {
        await this.prismaService.$queryRaw`SELECT 1`;
        return {
          database: {
            status: 'up',
          },
        };
      },
    ]);
  }

  @Get('db')
  @HealthCheck()
  @ApiOperation({ summary: 'Check database connection' })
  checkDb() {
    return this.health.check([
      async () => {
        await this.prismaService.$queryRaw`SELECT 1`;
        return {
          database: {
            status: 'up',
          },
        };
      },
    ]);
  }

  @Get('ping')
  @ApiOperation({ summary: 'Simple ping endpoint' })
  ping() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}