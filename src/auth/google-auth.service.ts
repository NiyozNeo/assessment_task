import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class GoogleAuthService implements OnModuleInit {
  private readonly logger = new Logger(GoogleAuthService.name);
  private oauth2Client: OAuth2Client;
  private readonly SCOPES = ['https://www.googleapis.com/auth/drive.file'];
  private readonly TOKEN_PATH = path.join(process.cwd(), 'token.json');
  private readonly CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    try {
      this.logger.log('Initializing Google Auth Service');
      await this.loadCredentials();
    } catch (error) {
      this.logger.error('Failed to initialize Google Auth Service', error.stack);
      throw error;
    }
  }

  /**
   * Load credentials from credentials.json or environment variables
   */
  private async loadCredentials(): Promise<void> {
    try {
      // Try to load credentials from file first
      const redirectUri = 'http://localhost:3000/auth/google/callback';
      try {
        const content = await fs.readFile(this.CREDENTIALS_PATH);
        const credentials = JSON.parse(content.toString());
        
        this.oauth2Client = new google.auth.OAuth2(
          credentials.web.client_id,
          credentials.web.client_secret,
          redirectUri
        );
        
        this.logger.log('Loaded credentials from credentials.json');
      } catch (error) {
        // Fall back to environment variables
        const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
        const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
        
        if (!clientId || !clientSecret) {
          throw new Error('Google OAuth credentials not found in environment variables');
        }
        
        this.oauth2Client = new google.auth.OAuth2(
          clientId,
          clientSecret,
          redirectUri
        );
        
        this.logger.log('Loaded credentials from environment variables');
      }
      
      // Try to load existing tokens
      await this.loadSavedTokens();
      
    } catch (error) {
      this.logger.error('Failed to load credentials:', error.stack);
      throw error;
    }
  }
  
  /**
   * Load saved tokens if they exist
   */
  private async loadSavedTokens(): Promise<void> {
    try {
      const content = await fs.readFile(this.TOKEN_PATH);
      const tokens = JSON.parse(content.toString());
      
      this.oauth2Client.setCredentials(tokens);
      this.logger.log('Loaded saved tokens from token.json');
    } catch (error) {
      this.logger.warn('No saved tokens found (this is normal for first run)');
    }
  }

  /**
   * Get the authorization URL for Google OAuth
   */
  async getAuthUrl(): Promise<string> {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.SCOPES,
      prompt: 'consent'
    });
  }

  /**
   * Handle the OAuth callback and save tokens
   */
  async handleAuthCallback(code: string): Promise<void> {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    
    await this.saveTokens(tokens);
    this.logger.log('Successfully authenticated with Google');
  }

  /**
   * Save tokens to file
   */
  private async saveTokens(tokens: any): Promise<void> {
    try {
      await fs.writeFile(this.TOKEN_PATH, JSON.stringify(tokens, null, 2));
      this.logger.log(`Tokens saved to ${this.TOKEN_PATH}`);
    } catch (error) {
      this.logger.error('Failed to save tokens', error.stack);
      throw error;
    }
  }

  /**
   * Get an authenticated OAuth2 client
   */
  async getAuthClient(): Promise<OAuth2Client> {
    const credentials = this.oauth2Client.credentials;
    if (!credentials.access_token) {
      this.logger.log('No access token available, authentication required');
      throw new Error('Authentication required. Please visit /auth/google to authenticate.');
    }
    
    return this.oauth2Client;
  }
  
  /**
   * Get new access token using refresh token
   */
  async refreshAccessToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.oauth2Client.credentials.refresh_token) {
        return reject(new Error('No refresh token available, re-authentication required'));
      }
      
      this.oauth2Client.refreshAccessToken((err, tokens) => {
        if (err) {
          this.logger.error('Error refreshing access token', err);
          return reject(err);
        }
        
        if (!tokens || !tokens.access_token) {
          return reject(new Error('No access token returned'));
        }
        
        this.oauth2Client.setCredentials(tokens as Credentials);
        
        this.saveTokens(tokens)
          .then(() => resolve(tokens.access_token as string))
          .catch((saveErr) => {
            this.logger.warn('Failed to save refreshed tokens', saveErr);
            resolve(tokens.access_token as string);
          });
      });
    });
  }
}