# =============================================================================
# ECS Layer (Cluster + Services)
# =============================================================================

module "ecs" {
  source = "terraform-aws-modules/ecs/aws"

  cluster_name = "fpt-event-cluster"

  create_cloudwatch_log_group = true

  # Execute Command Configuration (ECS Exec)
  cluster_configuration = {
    execute_command_configuration = {
      logging = "DEFAULT"
    }
  }

  cluster_capacity_providers = ["FARGATE"]
  default_capacity_provider_strategy = {
    FARGATE = {
      weight = 1
      base   = 0
    }
  }

  services = {
    auth-service = {
      cpu    = 256
      memory = 512

      enable_execute_command = true

      subnet_ids            = module.vpc.private_subnets
      create_security_group = true

      task_execution_role_arn = aws_iam_role.ecs_task_execution.arn
      task_role_arn           = aws_iam_role.ecs_task.arn

      security_group_ingress_rules = {
        ingress_alb = {
          description                  = "Allow traffic from ALB"
          from_port                    = 8081
          to_port                      = 8081
          ip_protocol                  = "tcp"
          referenced_security_group_id = module.loadbalancer.security_group_id
        }
      }

      security_group_egress_rules = {
        egress_all = {
          description = "Allow all outbound traffic"
          ip_protocol = "-1"
          cidr_ipv4   = "0.0.0.0/0"
        }
        egress_rds = {
          description = "Allow MySQL outbound"
          ip_protocol = "tcp"
          from_port   = 3306
          to_port     = 3306
          cidr_ipv4   = module.vpc.vpc_cidr_block
        }
      }

      load_balancer = {
        service = {
          target_group_arn = module.loadbalancer.target_groups["auth-target"].arn
          container_name   = "auth-service"
          container_port   = 8081
        }
      }

      container_definitions = {
        auth-service = {
          name = "auth-service"

          cpu                      = 256
          memory                   = 512
          essential                = true
          readonlyRootFilesystem   = false

          image = "436756555762.dkr.ecr.ap-southeast-1.amazonaws.com/auth-service:latest"

          environment = [
            { name = "AWS_LAMBDA_FUNCTION_NAME", value = "" },
            { name = "LOCAL_PORT", value = "8081" },
            { name = "DB_SERVER", value = module.rds.db_instance_address },
            { name = "DB_PORT", value = "3306" },
            { name = "DB_USER", value = local.db_user },
            { name = "DB_PASSWORD", value = local.db_password },
            { name = "JWT_SECRET", value = local.jwt_secret },
            { name = "INTERNAL_AUTH_TOKEN", value = local.internal_auth_token },
            { name = "INTERNAL_ALB_URL", value = "http://${module.loadbalancer.dns_name}" },
          ]

          portMappings = [
            {
              name          = "auth-service"
              containerPort = 8081
              protocol      = "tcp"
            }
          ]
        }
      }
    }

    event-service = {
      cpu    = 256
      memory = 512

      enable_execute_command = true

      subnet_ids            = module.vpc.private_subnets
      create_security_group = true

      task_execution_role_arn = aws_iam_role.ecs_task_execution.arn
      task_role_arn           = aws_iam_role.ecs_task.arn

      security_group_ingress_rules = {
        ingress_alb = {
          description                  = "Allow traffic from ALB"
          from_port                    = 8082
          to_port                      = 8082
          ip_protocol                  = "tcp"
          referenced_security_group_id = module.loadbalancer.security_group_id
        }
      }

      security_group_egress_rules = {
        egress_all = {
          description = "Allow all outbound traffic"
          ip_protocol = "-1"
          cidr_ipv4   = "0.0.0.0/0"
        }
        egress_rds = {
          description = "Allow MySQL outbound"
          ip_protocol = "tcp"
          from_port   = 3306
          to_port     = 3306
          cidr_ipv4   = module.vpc.vpc_cidr_block
        }
      }

      load_balancer = {
        service = {
          target_group_arn = module.loadbalancer.target_groups["event-target"].arn
          container_name   = "event-service"
          container_port   = 8082
        }
      }

      container_definitions = {
        event-service = {
          name = "event-service"

          cpu                      = 256
          memory                   = 512
          essential                = true
          readonlyRootFilesystem   = false

          image = "436756555762.dkr.ecr.ap-southeast-1.amazonaws.com/event-service:latest"

          environment = [
            { name = "AWS_LAMBDA_FUNCTION_NAME", value = "" },
            { name = "LOCAL_PORT", value = "8082" },
            { name = "DB_SERVER", value = module.rds.db_instance_address },
            { name = "DB_PORT", value = "3306" },
            { name = "DB_USER", value = local.db_user },
            { name = "DB_PASSWORD", value = local.db_password },
            { name = "JWT_SECRET", value = local.jwt_secret },
            { name = "INTERNAL_AUTH_TOKEN", value = local.internal_auth_token },
            { name = "AWS_S3_BUCKET", value = "fpt-event-management-storage" },
            { name = "AWS_REGION", value = "ap-southeast-1" },
            { name = "AWS_ACCESS_KEY_ID", value = local.aws_access_key_id },
            { name = "***REMOVED***", value = local.aws_secret_access_key },
            { name = "INTERNAL_ALB_URL", value = "http://${module.loadbalancer.dns_name}" },
          ]

          portMappings = [
            {
              name          = "event-service"
              containerPort = 8082
              protocol      = "tcp"
            }
          ]
        }
      }
    }

    ticket-service = {
      cpu    = 256
      memory = 512

      enable_execute_command = true

      subnet_ids            = module.vpc.private_subnets
      create_security_group = true

      task_execution_role_arn = aws_iam_role.ecs_task_execution.arn
      task_role_arn           = aws_iam_role.ecs_task.arn

      security_group_ingress_rules = {
        ingress_alb = {
          description                  = "Allow traffic from ALB"
          from_port                    = 8083
          to_port                      = 8083
          ip_protocol                  = "tcp"
          referenced_security_group_id = module.loadbalancer.security_group_id
        }
      }

      security_group_egress_rules = {
        egress_all = {
          description = "Allow all outbound traffic"
          ip_protocol = "-1"
          cidr_ipv4   = "0.0.0.0/0"
        }
        egress_rds = {
          description = "Allow MySQL outbound"
          ip_protocol = "tcp"
          from_port   = 3306
          to_port     = 3306
          cidr_ipv4   = module.vpc.vpc_cidr_block
        }
      }

      load_balancer = {
        service = {
          target_group_arn = module.loadbalancer.target_groups["ticket-target"].arn
          container_name   = "ticket-service"
          container_port   = 8083
        }
      }

      container_definitions = {
        ticket-service = {
          name = "ticket-service"

          cpu                      = 256
          memory                   = 512
          essential                = true
          readonlyRootFilesystem   = false

          image = "436756555762.dkr.ecr.ap-southeast-1.amazonaws.com/ticket-service:latest"

          environment = [
            { name = "AWS_LAMBDA_FUNCTION_NAME", value = "" },
            { name = "LOCAL_PORT", value = "8083" },
            { name = "DB_SERVER", value = module.rds.db_instance_address },
            { name = "DB_PORT", value = "3306" },
            { name = "DB_USER", value = local.db_user },
            { name = "DB_PASSWORD", value = local.db_password },
            { name = "JWT_SECRET", value = local.jwt_secret },
            { name = "INTERNAL_AUTH_TOKEN", value = local.internal_auth_token },
            { name = "VNPAY_TMN_CODE", value = local.vnpay_tmn_code },
            { name = "VNPAY_HASH_SECRET", value = local.vnpay_hash_secret },
            { name = "VNPAY_URL", value = local.vnpay_url },
            { name = "VNPAY_RETURN_URL", value = local.vnpay_return_url },
            { name = "RECAPTCHA_SECRET", value = local.recaptcha_secret },
            { name = "INTERNAL_ALB_URL", value = "http://${module.loadbalancer.dns_name}" },
          ]

          portMappings = [
            {
              name          = "ticket-service"
              containerPort = 8083
              protocol      = "tcp"
            }
          ]
        }
      }
    }

    venue-service = {
      cpu    = 256
      memory = 512

      enable_execute_command = true

      subnet_ids            = module.vpc.private_subnets
      create_security_group = true

      task_execution_role_arn = aws_iam_role.ecs_task_execution.arn
      task_role_arn           = aws_iam_role.ecs_task.arn

      security_group_ingress_rules = {
        ingress_alb = {
          description                  = "Allow traffic from ALB"
          from_port                    = 8084
          to_port                      = 8084
          ip_protocol                  = "tcp"
          referenced_security_group_id = module.loadbalancer.security_group_id
        }
      }

      security_group_egress_rules = {
        egress_all = {
          description = "Allow all outbound traffic"
          ip_protocol = "-1"
          cidr_ipv4   = "0.0.0.0/0"
        }
        egress_rds = {
          description = "Allow MySQL outbound"
          ip_protocol = "tcp"
          from_port   = 3306
          to_port     = 3306
          cidr_ipv4   = module.vpc.vpc_cidr_block
        }
      }

      load_balancer = {
        service = {
          target_group_arn = module.loadbalancer.target_groups["venue-target"].arn
          container_name   = "venue-service"
          container_port   = 8084
        }
      }

      container_definitions = {
        venue-service = {
          name = "venue-service"

          cpu                      = 256
          memory                   = 512
          essential                = true
          readonlyRootFilesystem   = false

          image = "436756555762.dkr.ecr.ap-southeast-1.amazonaws.com/venue-service:latest"

          environment = [
            { name = "AWS_LAMBDA_FUNCTION_NAME", value = "" },
            { name = "LOCAL_PORT", value = "8084" },
            { name = "DB_SERVER", value = module.rds.db_instance_address },
            { name = "DB_PORT", value = "3306" },
            { name = "DB_USER", value = local.db_user },
            { name = "DB_PASSWORD", value = local.db_password },
            { name = "JWT_SECRET", value = local.jwt_secret },
            { name = "INTERNAL_AUTH_TOKEN", value = local.internal_auth_token },
            { name = "INTERNAL_ALB_URL", value = "http://${module.loadbalancer.dns_name}" },
          ]

          portMappings = [
            {
              name          = "venue-service"
              containerPort = 8084
              protocol      = "tcp"
            }
          ]
        }
      }
    }

    staff-service = {
      cpu    = 256
      memory = 512

      enable_execute_command = true

      subnet_ids            = module.vpc.private_subnets
      create_security_group = true

      task_execution_role_arn = aws_iam_role.ecs_task_execution.arn
      task_role_arn           = aws_iam_role.ecs_task.arn

      security_group_ingress_rules = {
        ingress_alb = {
          description                  = "Allow traffic from ALB"
          from_port                    = 8085
          to_port                      = 8085
          ip_protocol                  = "tcp"
          referenced_security_group_id = module.loadbalancer.security_group_id
        }
      }

      security_group_egress_rules = {
        egress_all = {
          description = "Allow all outbound traffic"
          ip_protocol = "-1"
          cidr_ipv4   = "0.0.0.0/0"
        }
        egress_rds = {
          description = "Allow MySQL outbound"
          ip_protocol = "tcp"
          from_port   = 3306
          to_port     = 3306
          cidr_ipv4   = module.vpc.vpc_cidr_block
        }
      }

      load_balancer = {
        service = {
          target_group_arn = module.loadbalancer.target_groups["staff-target"].arn
          container_name   = "staff-service"
          container_port   = 8085
        }
      }

      container_definitions = {
        staff-service = {
          name = "staff-service"

          cpu                      = 256
          memory                   = 512
          essential                = true
          readonlyRootFilesystem   = false

          image = "436756555762.dkr.ecr.ap-southeast-1.amazonaws.com/staff-service:latest"

          environment = [
            { name = "AWS_LAMBDA_FUNCTION_NAME", value = "" },
            { name = "LOCAL_PORT", value = "8085" },
            { name = "DB_SERVER", value = module.rds.db_instance_address },
            { name = "DB_PORT", value = "3306" },
            { name = "DB_USER", value = local.db_user },
            { name = "DB_PASSWORD", value = local.db_password },
            { name = "JWT_SECRET", value = local.jwt_secret },
            { name = "INTERNAL_AUTH_TOKEN", value = local.internal_auth_token },
            { name = "INTERNAL_ALB_URL", value = "http://${module.loadbalancer.dns_name}" },
          ]

          portMappings = [
            {
              name          = "staff-service"
              containerPort = 8085
              protocol      = "tcp"
            }
          ]
        }
      }
    }

    notification-service = {
      cpu    = 256
      memory = 512

      enable_execute_command = true

      subnet_ids            = module.vpc.private_subnets
      create_security_group = true

      task_execution_role_arn = aws_iam_role.ecs_task_execution.arn
      task_role_arn           = aws_iam_role.ecs_task.arn

      security_group_ingress_rules = {
        ingress_alb = {
          description                  = "Allow traffic from ALB"
          from_port                    = 8086
          to_port                      = 8086
          ip_protocol                  = "tcp"
          referenced_security_group_id = module.loadbalancer.security_group_id
        }
      }

      security_group_egress_rules = {
        egress_all = {
          description = "Allow all outbound traffic"
          ip_protocol = "-1"
          cidr_ipv4   = "0.0.0.0/0"
        }
        egress_rds = {
          description = "Allow MySQL outbound"
          ip_protocol = "tcp"
          from_port   = 3306
          to_port     = 3306
          cidr_ipv4   = module.vpc.vpc_cidr_block
        }
      }

      load_balancer = {
        service = {
          target_group_arn = module.loadbalancer.target_groups["notification-target"].arn
          container_name   = "notification-service"
          container_port   = 8086
        }
      }

      container_definitions = {
        notification-service = {
          name = "notification-service"

          cpu                      = 256
          memory                   = 512
          essential                = true
          readonlyRootFilesystem   = false

          image = "436756555762.dkr.ecr.ap-southeast-1.amazonaws.com/notification-service:latest"

          environment = [
            { name = "AWS_LAMBDA_FUNCTION_NAME", value = "" },
            { name = "LOCAL_PORT", value = "8086" },
            { name = "DB_SERVER", value = module.rds.db_instance_address },
            { name = "DB_PORT", value = "3306" },
            { name = "DB_USER", value = local.db_user },
            { name = "DB_PASSWORD", value = local.db_password },
            { name = "INTERNAL_AUTH_TOKEN", value = local.internal_auth_token },
            { name = "SMTP_HOST", value = local.smtp_host },
            { name = "SMTP_PORT", value = local.smtp_port },
            { name = "SMTP_FROM", value = local.smtp_from },
            { name = "SMTP_FROM_NAME", value = local.smtp_from_name },
            { name = "SMTP_USERNAME", value = local.smtp_username },
            { name = "SMTP_PASSWORD", value = local.smtp_password },
            { name = "JWT_SECRET", value = local.jwt_secret },
            { name = "INTERNAL_ALB_URL", value = "http://${module.loadbalancer.dns_name}" }
          ]

          portMappings = [
            {
              name          = "notification-service"
              containerPort = 8086
              protocol      = "tcp"
            }
          ]
        }
      }
    }
  }

  depends_on = [
    module.loadbalancer,
    aws_iam_role.ecs_task_execution,
    aws_iam_role.ecs_task,
  ]
}
