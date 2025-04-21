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
      // Re-throw HttpExceptions as they already have status and message
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Handle file extension errors specifically
      if (error.message && error.message.includes('extension')) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: error.message || 'Unsupported file extension',
          },
          HttpStatus.BAD_REQUEST
        );
      }
      
      // Handle URL format errors
      if (error.message && (error.message.includes('URL') || error.message.includes('url'))) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: error.message || 'Invalid URL format',
          },
          HttpStatus.BAD_REQUEST
        );
      }
      
      // Generic error handling with more descriptive message
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: error.message || 'Failed to process upload request',
        },
        HttpStatus.BAD_REQUEST
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