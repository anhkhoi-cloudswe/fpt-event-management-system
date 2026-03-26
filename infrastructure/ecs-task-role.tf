# =============================================================================
# ECS Task Execution & Task Roles
# =============================================================================
# Execution role: ECS pulls images and writes logs to CloudWatch.
# Task role: application runtime (S3 access).

resource "aws_iam_role" "ecs_task_execution" {
  name = "fpt-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = {
    Project = "FPT-Event-Management"
  }
}

resource "aws_iam_role" "ecs_task" {
  name = "fpt-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = {
    Project = "FPT-Event-Management"
  }
}

# Base ECS task execution managed policy (image pull, log group write)
resource "aws_iam_role_policy_attachment" "ecs_task_execution_managed" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Permission to write logs to CloudWatch
resource "aws_iam_role_policy_attachment" "ecs_task_execution_cloudwatch" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}

# ECS Exec support (SSM messages channels)
# Required for Fargate tasks when enable_execute_command = true.
resource "aws_iam_policy" "ecs_exec_ssm_messages" {
  name        = "fpt-ecs-exec-ssm-messages"
  description = "Allow ECS Exec via SSM messages channels"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_ecs_exec_ssm_messages" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = aws_iam_policy.ecs_exec_ssm_messages.arn
}

# Task role: permission for S3 (storage bucket)
resource "aws_iam_policy" "s3_access" {
  name        = "fpt-ecs-s3-access"
  description = "Allow ECS tasks to access S3 bucket for file storage"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::fpt-event-management-storage",
          "arn:aws:s3:::fpt-event-management-storage/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_s3" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.s3_access.arn
}
