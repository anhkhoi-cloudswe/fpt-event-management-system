# =============================================================================
# API Gateway v2 Layer
# =============================================================================

module "api_gateway" {
  source = "terraform-aws-modules/apigateway-v2/aws"

  name          = "fpt-event-api"
  description   = "FPT Event Management API Gateway"
  protocol_type = "HTTP"

  create_domain_name = false

  cors_configuration = {
    allow_headers = ["content-type", "authorization", "x-requested-with"]
    allow_methods = ["*"]
    allow_origins = ["*"]
  }

  # VPC Link - inline, pointing to ALB in private subnet
  vpc_links = {
    ecs-vpc-link = {
      name               = "fpt-ecs-vpc-link"
      security_group_ids = [module.loadbalancer.security_group_id]
      subnet_ids         = module.vpc.private_subnets
    }
  }

  # Routes
  routes = {
    "ANY /api/login" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = module.loadbalancer.listeners["http"].arn
        type            = "HTTP_PROXY"
        method          = "ANY"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "ANY /api/register" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = module.loadbalancer.listeners["http"].arn
        type            = "HTTP_PROXY"
        method          = "ANY"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "ANY /api/events/{proxy+}" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = module.loadbalancer.listeners["http"].arn
        type            = "HTTP_PROXY"
        method          = "ANY"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "ANY /api/events" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = module.loadbalancer.listeners["http"].arn
        type            = "HTTP_PROXY"
        method          = "ANY"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "ANY /api/tickets/{proxy+}" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = module.loadbalancer.listeners["http"].arn
        type            = "HTTP_PROXY"
        method          = "ANY"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "ANY /api/tickets" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = module.loadbalancer.listeners["http"].arn
        type            = "HTTP_PROXY"
        method          = "ANY"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "ANY /api/venues/{proxy+}" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = module.loadbalancer.listeners["http"].arn
        type            = "HTTP_PROXY"
        method          = "ANY"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "ANY /api/venues" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = module.loadbalancer.listeners["http"].arn
        type            = "HTTP_PROXY"
        method          = "ANY"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "ANY /api/staff/{proxy+}" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = module.loadbalancer.listeners["http"].arn
        type            = "HTTP_PROXY"
        method          = "ANY"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "ANY /api/staff" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = module.loadbalancer.listeners["http"].arn
        type            = "HTTP_PROXY"
        method          = "ANY"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "ANY /api/notifications/{proxy+}" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = module.loadbalancer.listeners["http"].arn
        type            = "HTTP_PROXY"
        method          = "ANY"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "ANY /api/notifications" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = module.loadbalancer.listeners["http"].arn
        type            = "HTTP_PROXY"
        method          = "ANY"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
  }

  stage_access_log_settings = {
    create_log_group            = true
    log_group_retention_in_days = 7
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      httpMethod     = "$context.httpMethod"
      path           = "$context.path"
      status         = "$context.status"
      responseLength = "$context.responseLength"
    })
  }

  tags = {
    Project = "FPT-Event-Management"
  }
}
