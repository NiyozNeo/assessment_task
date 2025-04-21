import { Module } from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [GoogleDriveService],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}