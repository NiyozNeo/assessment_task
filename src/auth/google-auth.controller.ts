import { Controller, Get, Res, Query, Logger } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';
import { Response } from 'express';

@Controller()
export class GoogleAuthController {
  private readonly logger = new Logger(GoogleAuthController.name);

  constructor(private readonly googleAuthService: GoogleAuthService) {}

  @Get('auth/google')
  async googleAuth(@Res() res: Response) {
    const authUrl = await this.googleAuthService.getAuthUrl();
    this.logger.log(`Redirecting to Google Auth: ${authUrl}`);
    return res.redirect(authUrl);
  }

  // Add a specific handler for the callback path
  @Get('auth/google/callback')
  async googleAuthRedirectCallback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      this.logger.error('No authorization code provided');
      return res.status(400).send('No authorization code provided');
    }

    try {
      this.logger.log('Processing authorization code from Google callback');
      await this.googleAuthService.handleAuthCallback(code);
      return res.send(`
        <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding-top: 50px; }
              .success { color: #4CAF50; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1 class="success">Authentication Successful!</h1>
              <p>Your Google Drive access has been configured successfully.</p>
              <p>You can close this window and return to the application.</p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      this.logger.error(`Authentication failed: ${error.message}`, error.stack);
      return res.status(500).send(`
        <html>
          <head>
            <title>Authentication Failed</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding-top: 50px; }
              .error { color: #f44336; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1 class="error">Authentication Failed</h1>
              <p>Error: ${error.message}</p>
              <p>Please try again or contact support.</p>
            </div>
          </body>
        </html>
      `);
    }
  }

  // Keep the root path handler for the home page
  @Get()
  home(@Res() res: Response) {
    return res.send(`
      <html>
        <head>
          <title>Google Drive Authentication</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding-top: 50px; }
            .btn { background-color: #4285F4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>Google Drive Authentication</h1>
          <p>Click the button below to authenticate with Google Drive:</p>
          <a class="btn" href="/auth/google">Authenticate with Google</a>
        </body>
      </html>
    `);
  }
}