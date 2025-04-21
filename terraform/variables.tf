variable "aws_region" {
  description = "The AWS region to deploy to"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "file-upload-service"
}

variable "availability_zones" {
  description = "AWS availability zones to use"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "app_count" {
  description = "Number of application instances to run"
  type        = number
  default     = 2
}

variable "db_username" {
  description = "Database username"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "container_image" {
  description = "Docker image to deploy"
  type        = string
  default     = "username/file-upload-service:latest"
}