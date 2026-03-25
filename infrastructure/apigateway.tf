# =============================================================================
# API Gateway v2 Layer
# =============================================================================

# Lookup the ALB HTTP listener ARN dynamically
data "aws_lb_listener" "http" {
  load_balancer_arn = module.loadbalancer.arn
  port              = 80
  depends_on        = [module.loadbalancer]
}

module "api_gateway" {
  source = "terraform-aws-modules/apigateway-v2/aws"

  name          = "fpt-event-api"
  description   = "FPT Event Management API Gateway"
  protocol_type = "HTTP"

  create_domain_name = false

  cors_configuration = {
    allow_headers     = ["content-type", "authorization", "x-requested-with", "x-user-id", "x-user-role", "x-user-email", "cookie"]
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
    allow_origins     = var.cors_allowed_origins
    allow_credentials = true
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
    # -------------------- Auth service --------------------
    "POST /api/login" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/logout" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/v1/auth/me" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/auth/me" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/register" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/register/send-otp" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/register/verify-otp" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/register/resend-otp" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/forgot-password" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/reset-password" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/admin/create-account" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "PUT /api/admin/create-account" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "PUT"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "DELETE /api/admin/create-account" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "DELETE"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/users/staff-organizer" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }

    # -------------------- Event service --------------------
    "POST /api/upload/image" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/v1/events" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/events" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/events/{proxy+}" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/event-requests" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/event-requests/my" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/event-requests/my/active" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/event-requests/my/archived" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/event-requests/{proxy+}" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/staff/event-requests" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/event-requests/process" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/event-requests/update" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/events/update-details" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/events/update-config" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/events/disable" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/event/disable" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/organizer/events/cancel" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }

    # -------------------- Ticket service --------------------
    "GET /api/registrations/my-tickets" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/tickets/list" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/category-tickets" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/bills/my-bills" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/payment/my-bills" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/payment-ticket" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/buyTicket" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/wallet/balance" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/wallet/pay-ticket" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }

    # -------------------- Venue service --------------------
    "GET /api/venues" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/venues" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "PUT /api/venues" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "PUT"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "DELETE /api/venues" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "DELETE"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/venues/areas" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/venues/areas" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "PUT /api/venues/areas" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "PUT"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "DELETE /api/venues/areas" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "DELETE"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/areas/free" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/seats" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }

    # -------------------- Staff service --------------------
    "POST /api/staff/checkin" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/staff/checkout" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/admin/config/system" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/admin/config/system" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/staff/reports" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/staff/reports/detail" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/staff/reports/{proxy+}" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/staff/reports/process" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/staff/reports/approve" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/staff/reports/reject" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "POST /api/student/reports" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "POST"
        vpc_link_key    = "ecs-vpc-link"
      }
    }
    "GET /api/student/reports/pending-ticket-ids" = {
      integration = {
        connection_type = "VPC_LINK"
        uri             = "${data.aws_lb_listener.http.arn}"
        type            = "HTTP_PROXY"
        method          = "GET"
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
