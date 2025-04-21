terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
  
  backend "s3" {
    # In a real environment, you would configure this to store state in S3
    # bucket = "fileupload-terraform-state"
    # key    = "prod/terraform.tfstate"
    # region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}

# VPC for the application
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = {
    Name        = "${var.project_name}-vpc"
    Environment = var.environment
  }
}

# Public subnets
resource "aws_subnet" "public" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index}.0/24"
  availability_zone = var.availability_zones[count.index]
  
  tags = {
    Name        = "${var.project_name}-public-subnet-${count.index + 1}"
    Environment = var.environment
  }
}

# RDS PostgreSQL instance
resource "aws_db_instance" "postgres" {
  allocated_storage      = 20
  engine                 = "postgres"
  engine_version         = "14"
  instance_class         = "db.t3.micro"
  db_name                = "fileupload"
  username               = var.db_username
  password               = var.db_password
  parameter_group_name   = "default.postgres14"
  skip_final_snapshot    = true
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
  
  tags = {
    Name        = "${var.project_name}-db"
    Environment = var.environment
  }
}

# ECS Cluster for container deployment
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"
  
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  
  tags = {
    Name        = "${var.project_name}-ecs-cluster"
    Environment = var.environment
  }
}

# ECS Task Definition
resource "aws_ecs_task_definition" "app" {
  family                   = "${var.project_name}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn
  
  container_definitions = jsonencode([
    {
      name      = "${var.project_name}-container"
      image     = var.container_image
      essential = true
      
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
        }
      ]
      
      environment = [
        {
          name  = "DATABASE_URL"
          value = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/fileupload"
        },
        {
          name  = "NODE_ENV"
          value = var.environment
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/${var.project_name}"
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
  
  tags = {
    Name        = "${var.project_name}-task-definition"
    Environment = var.environment
  }
}

# ECS Service
resource "aws_ecs_service" "main" {
  name            = "${var.project_name}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.app_count
  launch_type     = "FARGATE"
  
  network_configuration {
    security_groups  = [aws_security_group.ecs_tasks.id]
    subnets          = aws_subnet.public[*].id
    assign_public_ip = true
  }
  
  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "${var.project_name}-container"
    container_port   = 3000
  }
  
  depends_on = [
    aws_lb_listener.front_end,
  ]
  
  tags = {
    Name        = "${var.project_name}-ecs-service"
    Environment = var.environment
  }
}

# CloudWatch Logs
resource "aws_cloudwatch_log_group" "main" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = 30
  
  tags = {
    Name        = "${var.project_name}-cloudwatch-log-group"
    Environment = var.environment
  }
}