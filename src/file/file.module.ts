import { Module } from '@nestjs/common';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { GoogleDriveModule } from '../google-drive/google-drive.module';

@Module({
  imports: [GoogleDriveModule],
  controllers: [FileController],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}