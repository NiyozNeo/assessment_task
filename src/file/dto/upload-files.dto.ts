import { IsArray, IsUrl, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

// List of allowed file extensions
const SUPPORTED_FILE_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv',
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp',
  'mp3', 'mp4', 'avi', 'mov', 'wmv', 'zip', 'rar', 'tar', 'gz'
];

// List of potentially dangerous extensions
const DANGEROUS_FILE_EXTENSIONS = [
  'exe', 'bat', 'cmd', 'sh', 'php', 'js', 'jar', 'dll', 'vbs', 'ps1'
];

export class UploadFilesDto {
  @ApiProperty({
    description: 'Array of file URLs to upload',
    type: [String],
    example: ['https://example.com/file1.pdf', 'https://example.com/file2.jpg'],
  })
  @IsArray({ message: 'File URLs must be provided as an array' })
  @ArrayMinSize(1, { message: 'At least one file URL must be provided' })
  @ArrayMaxSize(10, { message: 'Maximum 10 file URLs are allowed at once' })
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true
  }, { 
    each: true, 
    message: 'Each URL must be a valid HTTP or HTTPS URL' 
  })
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.map(url => {
        // Trim the URL
        url = url.trim();
        
        // Check for dangerous extensions
        const lowercaseUrl = url.toLowerCase();
        const extension = lowercaseUrl.split('.').pop();
        
        if (DANGEROUS_FILE_EXTENSIONS.includes(extension)) {
          throw new Error(`File extension "${extension}" is not allowed for security reasons`);
        }
        
        if (!SUPPORTED_FILE_EXTENSIONS.includes(extension)) {
          throw new Error(`File extension "${extension}" is not supported`);
        }
        
        return url;
      });
    }
    return value;
  })
  fileUrls: string[];
}