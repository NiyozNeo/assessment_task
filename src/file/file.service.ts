import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { File } from '@prisma/client';
import { GoogleDriveService, FileMetadata } from '../google-drive/google-drive.service';
import { Stream, Readable } from 'stream';
import { createReadStream, createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

// Constants for retry mechanism
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_TIME = 1000; // 1 second
const MAX_BACKOFF_TIME = 60000; // 1 minute

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly MAX_CONCURRENT_UPLOADS: number; // Will be set from env
  private readonly CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for large files

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly googleDriveService: GoogleDriveService,
  ) {
    // Get configuration values with defaults
    this.MAX_CONCURRENT_UPLOADS = parseInt(this.configService.get('MAX_CONCURRENT_UPLOADS', '3')); // 3 concurrent uploads default
  }

  async uploadFiles(fileUrls: string[]): Promise<File[]> {
    const uploadedFiles: File[] = [];
    const failedUploads: { url: string; reason: string }[] = [];
    
    // Instead of using p-limit for concurrency control, use Promise.all with slicing
    const batchSize = this.MAX_CONCURRENT_UPLOADS;
    const batches = [];
    
    // Start performance tracking
    const startTime = Date.now();
    this.logger.log(`Starting batch upload of ${fileUrls.length} files`);
    
    // Split URLs into batches of size MAX_CONCURRENT_UPLOADS
    for (let i = 0; i < fileUrls.length; i += batchSize) {
      const batch = fileUrls.slice(i, i + batchSize);
      
      // Process each batch
      const batchPromise = Promise.all(
        batch.map(url => 
          this.uploadSingleFileWithRetry(url)
            .then(file => {
              uploadedFiles.push(file);
              return file;
            })
            .catch(error => {
              this.logger.error(`Failed to upload file from URL: ${url}`, error.stack);
              failedUploads.push({ url, reason: error.message });
              return null;
            })
        )
      );
      
      batches.push(batchPromise);
    }
    
    // Process batches sequentially
    for (const batchPromise of batches) {
      await batchPromise;
    }
    
    // End performance tracking
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTimePerFile = uploadedFiles.length > 0 ? totalTime / uploadedFiles.length : 0;
    
    this.logger.log(`Batch upload completed. Success: ${uploadedFiles.length}, Failed: ${failedUploads.length}, Total time: ${totalTime}ms, Avg time per file: ${avgTimePerFile}ms`);
    
    if (failedUploads.length > 0 && uploadedFiles.length === 0) {
      throw new HttpException(
        {
          message: 'All file uploads failed',
          failedUploads,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (failedUploads.length > 0) {
      this.logger.warn(`Some files failed to upload: ${JSON.stringify(failedUploads)}`);
    }

    return uploadedFiles;
  }

  private async uploadSingleFileWithRetry(url: string): Promise<File> {
    // Implement exponential backoff retry logic manually instead of using the library
    let attempt = 0;
    let delay = INITIAL_BACKOFF_TIME;
    let lastError: any = null;

    while (attempt < MAX_RETRIES) {
      try {
        return await this.uploadSingleFile(url);
      } catch (error) {
        lastError = error;
        
        // Only retry on specific errors (network issues, temporary server errors)
        const isRetryable = 
          error.code === 'ECONNRESET' || 
          error.code === 'ETIMEDOUT' || 
          (error.response && [429, 500, 502, 503, 504].includes(error.response.status));
        
        if (!isRetryable) {
          break;
        }
        
        attempt++;
        
        if (attempt < MAX_RETRIES) {
          this.logger.warn(`Retrying upload (attempt ${attempt}/${MAX_RETRIES}) for URL: ${url}`);
          
          // Wait for the backoff delay
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Exponential backoff: double the delay for next attempt, but cap it
          delay = Math.min(delay * 2, MAX_BACKOFF_TIME);
        }
      }
    }
    
    // If we get here, all retries failed or the error wasn't retryable
    throw lastError;
  }

  private async uploadSingleFile(url: string): Promise<File> {
    try {
      // Generate a unique temp file name
      const tempFilePath = await this.createTempFilePath();
      
      try {
        // Download file with streaming
        const { fileStream, fileMetadata } = await this.downloadFile(url, tempFilePath);
        
        // Extract file name
        const fileName = this.extractFileNameFromUrl(url);
        
        // Determine if we need to use chunked upload (for files larger than 5MB)
        let uploadResult;
        
        if (fileMetadata.size > this.CHUNK_SIZE) {
          // For large files, use chunked upload
          this.logger.log(`Using chunked upload for large file: ${fileName} (${fileMetadata.size} bytes)`);
          uploadResult = await this.uploadLargeFile(tempFilePath, fileMetadata);
        } else {
          // For smaller files, use regular upload
          uploadResult = await this.googleDriveService.uploadFile(
            fileStream,
            fileMetadata
          );
        }
        
        // Save to database
        const file = await this.saveToDB(fileName, fileMetadata, uploadResult);
        
        this.logger.log(`Successfully uploaded file: ${fileName}`);
        
        // Clean up temp file
        await fs.unlink(tempFilePath).catch(err => 
          this.logger.warn(`Failed to delete temp file ${tempFilePath}: ${err.message}`)
        );
        
        return file;
      } catch (error) {
        // Clean up temp file if it exists
        try {
          await fs.access(tempFilePath);
          await fs.unlink(tempFilePath);
        } catch {}
        
        throw error;
      }
    } catch (error) {
      this.logger.error(`Error processing file from URL: ${url}`, error.stack);
      
      // Add more specific error handling
      if (this.isAxiosError(error)) {
        if (error.response) {
          // Server responded with a non-2xx status
          throw new HttpException(
            `Failed to download file: Server responded with status ${error.response.status}`,
            HttpStatus.BAD_REQUEST
          );
        } else if (error.request) {
          // Request was made but no response was received
          throw new HttpException(
            'Failed to download file: No response received from server',
            HttpStatus.BAD_REQUEST
          );
        }
      }
      
      throw new HttpException(
        `Failed to upload file: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // Helper method to check if an error is an Axios error
  private isAxiosError(error: any): boolean {
    return error && error.isAxiosError === true;
  }
  
  private async createTempFilePath(): Promise<string> {
    const tempDir = os.tmpdir();
    const randomId = crypto.randomBytes(16).toString('hex');
    return path.join(tempDir, `upload-${randomId}`);
  }
  
  private async downloadFile(url: string, tempFilePath: string): Promise<{ fileStream: Stream; fileMetadata: FileMetadata }> {
    // Create write stream to temp file
    const fileWriteStream = createWriteStream(tempFilePath);
    
    // Download with axios with streaming
    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
      timeout: 30000, // 30 seconds timeout
      validateStatus: status => status >= 200 && status < 300,
    });
    
    // Get content-type and size
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    const contentLength = parseInt(response.headers['content-length'] || '0');
    const fileName = this.extractFileNameFromUrl(url);
    
    // Set up file metadata
    const fileMetadata: FileMetadata = {
      name: fileName,
      mimeType: contentType,
      size: contentLength,
    };
    
    return new Promise((resolve, reject) => {
      // Cast response.data to Readable stream
      const stream = response.data as Readable;
      
      stream.on('error', (error: Error) => {
        fileWriteStream.destroy();
        reject(error);
      });
      
      fileWriteStream.on('error', (error: Error) => {
        stream.destroy();
        reject(error);
      });
      
      fileWriteStream.on('finish', async () => {
        // Update the actual file size which might differ from content-length header
        try {
          const stats = await fs.stat(tempFilePath);
          fileMetadata.size = stats.size;
          
          // Create a read stream from the temp file
          const fileStream = createReadStream(tempFilePath);
          
          resolve({ fileStream, fileMetadata });
        } catch (error) {
          reject(error);
        }
      });
      
      // Pipe the download to the file
      stream.pipe(fileWriteStream);
    });
  }
  
  private async uploadLargeFile(filePath: string, metadata: FileMetadata): Promise<{ id: string; url: string }> {
    // Implementation of chunked upload would go here
    // For now, we'll use the regular upload method with a file stream
    const fileStream = createReadStream(filePath);
    return this.googleDriveService.uploadFile(fileStream, metadata);
  }

  private extractFileNameFromUrl(url: string): string {
    try {
      const urlPath = new URL(url).pathname;
      const fileName = urlPath.split('/').pop();
      return fileName || 'unknown-file';
    } catch (error) {
      this.logger.warn(`Failed to parse URL ${url}: ${error.message}`);
      return 'unknown-file';
    }
  }

  private async saveToDB(
    fileName: string, 
    metadata: FileMetadata, 
    uploadResult: { id: string; url: string }
  ): Promise<File> {
    return this.prisma.file.create({
      data: {
        name: fileName,
        mimeType: metadata.mimeType,
        size: metadata.size,
        driveFileId: uploadResult.id,
        driveUrl: uploadResult.url,
      },
    });
  }

  async getAllFiles(): Promise<File[]> {
    return this.prisma.file.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}