# File Upload Service

A robust NestJS service that downloads files from URLs and uploads them to Google Drive, with metadata stored in PostgreSQL.

## Features

- Download files from provided URLs
- Upload files to Google Drive
- Store file metadata in PostgreSQL database
- Containerized application using Docker
- Swagger API documentation

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Docker](https://www.docker.com/) and Docker Compose
- [Google Cloud Platform](https://cloud.google.com/) Account with Google Drive API enabled
- Google OAuth 2.0 credentials for Drive API access

## Setup Instructions

### Google Cloud Platform Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Google Drive API
3. Set up OAuth 2.0 credentials:
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" and select "OAuth client ID"
   - Set the application type as "Web application"
   - Add authorized redirect URIs: `http://localhost:3000/auth/google/callback`
   - Download the client credentials JSON file and save as `credentials.json` in the project root

> **Important**: The `credentials.json` file contains your OAuth client ID and client secret and should look like this:
> ```json
> {
>   "web": {
>     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
>     "project_id": "your-project-id",
>     "auth_uri": "https://accounts.google.com/o/oauth2/auth",
>     "token_uri": "https://oauth2.googleapis.com/token",
>     "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
>     "client_secret": "YOUR_CLIENT_SECRET",
>     "redirect_uris": ["http://localhost:3000/auth/google/callback"]
>   }
> }
> ```
> Make sure to keep this file secure and add it to your `.gitignore` to prevent it from being committed to version control.

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fileupload?schema=public"
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/auth/google/callback"
```

Note: You won't need to manually obtain a refresh token as the application now handles the OAuth flow through the browser.

### Google Drive Authentication

This application implements a browser-based OAuth 2.0 flow for Google Drive authentication:

1. Start the application
2. Visit `http://localhost:3000/auth/google` in your browser
3. You'll be redirected to Google's authentication page
4. After granting permissions, you'll be redirected back to the application
5. The application will automatically save your authentication tokens for future use

The tokens will be stored in a `token.json` file in the project root and will be automatically refreshed when needed.

> **Note about token.json**: After successful authentication, the application automatically creates a `token.json` file that contains your OAuth access and refresh tokens. It looks like this:
> ```json
> {
>   "access_token": "ya29.a0...",
>   "refresh_token": "1//0c...",
>   "scope": "https://www.googleapis.com/auth/drive.file",
>   "token_type": "Bearer",
>   "expiry_date": 1745202497865
> }
> ```
> The `token.json` file is automatically managed by the application and should also be added to your `.gitignore` to keep your tokens secure. Never share this file as it grants access to your Google Drive.

### Using Docker (Recommended)

1. Make sure Docker and Docker Compose are installed on your system
2. Clone the repository
3. Navigate to the project directory
4. Create the `.env` file as described above
5. Run the application:

```bash
docker-compose up -d
```

The API will be available at http://localhost:3000 with Swagger documentation at http://localhost:3000/api.

### Manual Setup

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Generate Prisma client:

```bash
npx prisma generate
```

4. Set up the database:

```bash
npx prisma migrate dev
```

5. Start the application:

```bash
npm run start:dev
```

6. Authenticate with Google Drive:

Visit `http://localhost:3000/auth/google` in your browser and follow the authentication flow.

## API Documentation

The API is documented using Swagger. Once the application is running, you can access the documentation at:

```
http://localhost:3000/api
```

### Endpoints

#### `POST /files/upload`

Upload files from URLs to Google Drive.

**Request Body:**
```json
{
  "fileUrls": [
    "https://example.com/file1.pdf",
    "https://example.com/file2.jpg"
  ]
}
```

**Response:**
```json
[
  {
    "id": "1",
    "name": "file1.pdf",
    "mimeType": "application/pdf",
    "size": 12345,
    "driveFileId": "google_drive_file_id",
    "driveUrl": "https://drive.google.com/file/d/google_drive_file_id/view",
    "createdAt": "2025-04-20T12:00:00.000Z",
    "updatedAt": "2025-04-20T12:00:00.000Z"
  }
]
```

#### `GET /files`

Get all uploaded files.

**Response:**
```json
[
  {
    "id": "1",
    "name": "file1.pdf",
    "mimeType": "application/pdf",
    "size": 12345,
    "driveFileId": "google_drive_file_id",
    "driveUrl": "https://drive.google.com/file/d/google_drive_file_id/view",
    "createdAt": "2025-04-20T12:00:00.000Z",
    "updatedAt": "2025-04-20T12:00:00.000Z"
  }
]
```

## Authentication Details

### Google Drive Authentication

The application uses a modern, browser-based OAuth 2.0 flow for Google Drive authentication:

1. The user visits `/auth/google` endpoint
2. They are redirected to Google's authentication page
3. After granting permissions, they are redirected back to `/auth/google/callback`
4. The application receives an authorization code and exchanges it for access and refresh tokens
5. Tokens are stored in `token.json` and used for all Google Drive operations
6. Tokens are automatically refreshed when they expire

This approach provides:
- Better security (no manual token handling)
- Improved user experience (simple browser-based flow)
- More reliable authentication (automatic token refresh)

For server deployments, complete the authentication flow once, and the tokens will be automatically managed afterward.

## Design Decisions and Trade-offs

### Architecture

The application follows a modular architecture with clear separation of concerns:
- **Controller Layer**: Handles HTTP requests and responses
- **Service Layer**: Contains business logic
- **Data Layer**: Interacts with the database and external services

### Database

PostgreSQL was chosen for its reliability, feature-richness, and support for structured data. Prisma ORM is used to interact with the database, providing type safety and query building capabilities.

### External Services

Google Drive API was selected as the storage solution due to:
- High availability and reliability
- Generous free tier
- Well-documented API

The application uses OAuth 2.0 authentication for Google Drive integration, which provides a secure way to access user data with explicit user consent and supports long-running applications through the use of refresh tokens.

### Error Handling

The application implements robust error handling:
- Detailed error messages for debugging
- Graceful fallbacks when some operations fail
- Comprehensive logging

### Performance Considerations

- Files are processed sequentially to prevent overwhelming the system
- Failed uploads are tracked and reported but don't halt the entire process
- Stream processing used to handle large files efficiently

## Limitations and Known Issues

1. **URL Validation**: Basic URL validation is implemented, but some edge cases might not be handled correctly.

2. **File Size Limits**: Google Drive has upload limits that this service is subject to (currently 5TB per file).

3. **Rate Limiting**: No built-in rate limiting for API requests; consider adding for production use.

4. **Authentication**: The service does not implement user authentication. In a production environment, proper authentication and authorization should be added.

5. **Retries**: Failed uploads are not automatically retried. Consider implementing a retry mechanism for production use.

## Future Improvements

- Add user authentication and authorization
- Implement file upload status tracking
- Add support for folder organization in Google Drive
- Create a UI for managing uploads
- Add support for progress tracking during upload

## Enhanced Features

In addition to the core features, this service now includes several enhancements:

### Input Validation

- Comprehensive URL validation (checking for malicious URLs or unsupported file types)
- File size limits with configurable thresholds
- Support for various file formats with explicit allowlist/blocklist

### Performance Optimizations

- Parallel processing for multiple file uploads (with configurable concurrency)
- File chunking for large files
- Streaming downloads and uploads to minimize memory usage

### Error Recovery

- Automatic retry mechanism with exponential backoff for failed uploads
- Detailed error tracking and reporting
- Graceful handling of partial batch failures

### Monitoring & Logging

- Structured logging with severity levels using Winston
- Health check endpoints (`/health`) for monitoring
- Telemetry for tracking key metrics (upload times, success rates)
- Request logging with Morgan

### Security Improvements

- Rate limiting to prevent abuse (20 requests per minute by default)
- Security headers with Helmet
- Content validation for uploaded files

### DevOps & Deployment

- CI/CD pipeline configuration with GitHub Actions
- Infrastructure as Code using Terraform
- Automated testing with Jest
- Docker-based deployment

## Configuration

The application supports various configuration options through environment variables:

```
# Database Configuration
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fileupload?schema=public"

# Google Authentication
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/auth/google/callback"

# File Processing
MAX_FILE_SIZE=104857600  # Maximum file size in bytes (100MB default)
MAX_CONCURRENT_UPLOADS=3  # Number of files to process in parallel

# Rate Limiting
THROTTLE_TTL=60  # Window in seconds for rate limiting
THROTTLE_LIMIT=20  # Maximum number of requests within window
```

## Health Checks

The application includes various health check endpoints to monitor system status:

- `GET /health` - Overall system health including API, disk, memory, and database
- `GET /health/db` - Database connection check
- `GET /health/ping` - Simple ping endpoint

## API Rate Limiting

To prevent abuse, the API implements rate limiting:

- Default: 20 requests per minute
- Exceeding this limit will result in a 429 Too Many Requests response
- Configure using THROTTLE_TTL and THROTTLE_LIMIT environment variables

## CI/CD Pipeline

The project includes a GitHub Actions workflow for continuous integration and deployment:

1. Runs tests on every pull request and push to main/develop branches
2. Builds and pushes Docker image on successful tests
3. Deploys to production when merging to main branch

## Infrastructure as Code

Terraform configuration is provided to deploy the application to AWS:

- Sets up VPC, subnets, and security groups
- Provisions RDS PostgreSQL database
- Deploys application to ECS Fargate
- Configures load balancing and auto-scaling
- Sets up CloudWatch logging

To deploy:

```bash
cd terraform
terraform init
terraform apply
```

## Monitoring & Telemetry

The application logs various metrics that can be used for monitoring:

- Request/response details
- File upload statistics (size, time, success rate)
- Error rates and types
- System resource usage

Logs are written to:
- Console (for development)
- `/logs/combined.log` (all logs)
- `/logs/error.log` (error logs only)

## License

This project is licensed under the [UNLICENSED](LICENSE) license.