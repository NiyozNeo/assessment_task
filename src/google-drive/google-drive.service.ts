import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, drive_v3 } from 'googleapis';
import { Stream } from 'stream';
import { GoogleAuthService } from '../auth/google-auth.service';

export interface UploadFileResult {
  id: string;
  url: string;
}

export interface FileMetadata {
  name: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class GoogleDriveService implements OnModuleInit {
  private readonly logger = new Logger(GoogleDriveService.name);
  private drive: drive_v3.Drive;

  constructor(
    private readonly configService: ConfigService,
    private readonly googleAuthService: GoogleAuthService
  ) {}

  async onModuleInit() {
    try {
      this.logger.log('Initializing Google Drive Service');
      await this.initializeDriveClient();
    } catch (error) {
      // Log the error but don't throw - we might authenticate later
      this.logger.error('Failed to initialize Google Drive API', error.stack);
    }
  }

  private async initializeDriveClient(): Promise<void> {
    try {
      const authClient = await this.googleAuthService.getAuthClient();
      this.drive = google.drive({ version: 'v3', auth: authClient });
      this.logger.log('Google Drive API initialized successfully');
    } catch (error) {
      this.logger.warn('Drive client initialization deferred - authentication required');
      throw error;
    }
  }

  private async getDriveClient(): Promise<drive_v3.Drive> {
    if (!this.drive) {
      await this.initializeDriveClient();
    }
    return this.drive;
  }

  async uploadFile(
    fileStream: Stream,
    metadata: FileMetadata,
  ): Promise<UploadFileResult> {
    try {
      // Ensure we have a valid drive client
      const drive = await this.getDriveClient();
      
      this.logger.log(`Uploading file to Google Drive: ${metadata.name}`);
      
      const driveResponse = await drive.files.create({
        requestBody: {
          name: metadata.name,
          mimeType: metadata.mimeType,
        },
        media: {
          mimeType: metadata.mimeType,
          body: fileStream,
        },
      });

      if (!driveResponse.data.id) {
        throw new Error('File ID was not returned from Google Drive');
      }

      this.logger.log(`Successfully uploaded file to Google Drive: ${metadata.name}, ID: ${driveResponse.data.id}`);
      
      return {
        id: driveResponse.data.id,
        url: `https://drive.google.com/file/d/${driveResponse.data.id}/view`,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file to Google Drive: ${metadata.name}`, error.stack);
      
      // Check for auth-related errors to attempt token refresh
      if (
        error.code === 401 || 
        error.message?.includes('auth') || 
        error.message?.includes('token') ||
        error.message?.includes('Authentication required')
      ) {
        try {
          this.logger.log('Attempting to refresh authentication');
          await this.googleAuthService.refreshAccessToken();
          
          // Re-initialize drive client with new token
          await this.initializeDriveClient();
          
          // Retry the upload with the refreshed token
          this.logger.log('Retrying upload with refreshed token');
          return this.uploadFile(fileStream, metadata);
        } catch (refreshError) {
          // If refresh fails, we need to re-authenticate
          this.logger.error('Token refresh failed, re-authentication required', refreshError.stack);
          throw new Error(
            'Authentication expired. Please visit /auth/google to re-authenticate with Google Drive.'
          );
        }
      }
      
      throw error;
    }
  }
}