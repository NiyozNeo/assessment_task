import { Test, TestingModule } from '@nestjs/testing';
import { FileService } from '../src/file/file.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { Readable } from 'stream';
import axios from 'axios';

// Mock the external dependencies
jest.mock('axios');
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ size: 1024 }),
  },
  createReadStream: jest.fn().mockReturnValue(new Readable({
    read() {
      this.push(Buffer.from('test'));
      this.push(null);
    }
  })),
  createWriteStream: jest.fn().mockReturnValue({
    on: jest.fn().mockImplementation(function(event, handler) {
      if (event === 'finish') {
        setTimeout(handler, 10);
      }
      return this;
    }),
    destroy: jest.fn(),
  }),
}));

describe('FileService', () => {
  let service: FileService;
  let prismaService: PrismaService;
  let googleDriveService: GoogleDriveService;

  const mockPrismaService = {
    file: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const mockGoogleDriveService = {
    uploadFile: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key, defaultValue) => {
      if (key === 'MAX_FILE_SIZE') return '104857600';
      if (key === 'MAX_CONCURRENT_UPLOADS') return '3';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: GoogleDriveService, useValue: mockGoogleDriveService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<FileService>(FileService);
    prismaService = module.get<PrismaService>(PrismaService);
    googleDriveService = module.get<GoogleDriveService>(GoogleDriveService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadFiles', () => {
    it('should upload multiple files successfully', async () => {
      // Mock the axios response for HEAD request
      (axios.head as jest.Mock).mockResolvedValue({
        headers: {
          'content-length': '1024',
          'content-type': 'application/pdf',
        },
      });

      // Mock the axios response for GET request
      (axios as any).mockResolvedValue({
        data: {
          on: jest.fn().mockImplementation(function(event, handler) {
            // Simulate some data streaming
            if (event === 'data') {
              handler(Buffer.from('test'));
            }
            return this;
          }),
          pipe: jest.fn().mockReturnThis(),
          destroy: jest.fn(),
        },
        headers: {
          'content-type': 'application/pdf',
          'content-length': '1024',
        },
      });

      // Mock Google Drive upload response
      mockGoogleDriveService.uploadFile.mockResolvedValue({
        id: 'test-drive-id',
        url: 'https://drive.google.com/file/d/test-drive-id/view',
      });

      // Mock database create response
      mockPrismaService.file.create.mockResolvedValue({
        id: 1,
        name: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        driveFileId: 'test-drive-id',
        driveUrl: 'https://drive.google.com/file/d/test-drive-id/view',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.uploadFiles(['https://example.com/test.pdf']);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test.pdf');
      expect(mockGoogleDriveService.uploadFile).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.file.create).toHaveBeenCalledTimes(1);
    });

    it('should handle file size exceeding limits', async () => {
      // Mock the axios response with a file size larger than the limit
      (axios.head as jest.Mock).mockResolvedValue({
        headers: {
          'content-length': '104857601', // 100MB + 1 byte (exceeds default limit)
          'content-type': 'application/pdf',
        },
      });

      await expect(service.uploadFiles(['https://example.com/large-file.pdf']))
        .rejects
        .toThrow(HttpException);
    });
  });

  describe('getAllFiles', () => {
    it('should return all files from the database', async () => {
      const mockFiles = [
        {
          id: 1,
          name: 'test1.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          driveFileId: 'drive-id-1',
          driveUrl: 'https://drive.google.com/file/d/drive-id-1/view',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          name: 'test2.jpg',
          mimeType: 'image/jpeg',
          size: 2048,
          driveFileId: 'drive-id-2',
          driveUrl: 'https://drive.google.com/file/d/drive-id-2/view',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.file.findMany.mockResolvedValue(mockFiles);

      const result = await service.getAllFiles();

      expect(result).toEqual(mockFiles);
      expect(mockPrismaService.file.findMany).toHaveBeenCalledWith({
        orderBy: {
          createdAt: 'desc',
        },
      });
    });
  });
});