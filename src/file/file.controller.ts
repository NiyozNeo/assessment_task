import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  UseInterceptors, 
  ClassSerializerInterceptor,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBadRequestResponse,
  ApiOkResponse 
} from '@nestjs/swagger';
import { FileService } from './file.service';
import { UploadFilesDto } from './dto/upload-files.dto';
import { File } from '@prisma/client';

@ApiTags('files')
@Controller('files')
@UseInterceptors(ClassSerializerInterceptor)
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload files from URLs to Google Drive' })
  @ApiResponse({
    status: 201,
    description: 'Files successfully uploaded',
    type: Array<File>,
  })
  @ApiBadRequestResponse({ 
    description: 'Invalid request or file upload failed' 
  })
  async uploadFiles(@Body() uploadFilesDto: UploadFilesDto): Promise<File[]> {
    try {
      return await this.fileService.uploadFiles(uploadFilesDto.fileUrls);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to process upload request',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get all uploaded files' })
  @ApiOkResponse({
    description: 'List of all uploaded files',
    type: Array<File>,
  })
  async getAllFiles(): Promise<File[]> {
    return this.fileService.getAllFiles();
  }
}