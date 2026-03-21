# =============================================================================
# ALB Layer
# =============================================================================

module "loadbalancer" {
  source = "terraform-aws-modules/alb/aws"

  name     = "fpt-event-alb"
  vpc_id   = module.vpc.vpc_id
  subnets  = module.vpc.private_subnets
  internal = true

  enable_deletion_protection = false

  create_security_group = true
  security_group_ingress_rules = {
    all_from_api_gateway = {
      from_port                    = 8080
      to_port                      = 8086
      ip_protocol                  = "tcp"
      description                  = "Allow traffic from API Gateway VPC Link"
      cidr_ipv4                    = module.vpc.vpc_cidr_block
    }
  }
  security_group_egress_rules = {
    all = {
      ip_protocol = "-1"
      cidr_ipv4   = "0.0.0.0/0"
    }
  }

  target_groups = {
    auth-target = {
      name_prefix = "auth-"
      port        = 8081
      protocol    = "HTTP"
      target_type = "ip"
      create_attachment = false

      health_check = {
        enabled             = true
        interval            = 30
        path                = "/api/login"
        port                = "traffic-port"
        healthy_threshold   = 2
        unhealthy_threshold = 2
        timeout             = 5
        protocol            = "HTTP"
        matcher             = "200,404"
      }
    }
    event-target = {
      name_prefix = "evt-"
      port        = 8082
      protocol    = "HTTP"
      target_type = "ip"
      create_attachment = false

      health_check = {
        enabled             = true
        interval            = 30
        path                = "/api/events"
        port                = "traffic-port"
        healthy_threshold   = 2
        unhealthy_threshold = 2
        timeout             = 5
        protocol            = "HTTP"
        matcher             = "200,404"
      }
    }
    ticket-target = {
      name_prefix = "tkt-"
      port        = 8083
      protocol    = "HTTP"
      target_type = "ip"
      create_attachment = false

      health_check = {
        enabled             = true
        interval            = 30
        path                = "/api/tickets"
        port                = "traffic-port"
        healthy_threshold   = 2
        unhealthy_threshold = 2
        timeout             = 5
        protocol            = "HTTP"
        matcher             = "200,404"
      }
    }
    venue-target = {
      name_prefix = "ven-"
      port        = 8084
      protocol    = "HTTP"
      target_type = "ip"
      create_attachment = false

      health_check = {
        enabled             = true
        interval            = 30
        path                = "/api/venues"
        port                = "traffic-port"
        healthy_threshold   = 2
        unhealthy_threshold = 2
        timeout             = 5
        protocol            = "HTTP"
        matcher             = "200,404"
      }
    }
    staff-target = {
      name_prefix = "stf-"
      port        = 8085
      protocol    = "HTTP"
      target_type = "ip"
      create_attachment = false

      health_check = {
        enabled             = true
        interval            = 30
        path                = "/api/staff"
        port                = "traffic-port"
        healthy_threshold   = 2
        unhealthy_threshold = 2
        timeout             = 5
        protocol            = "HTTP"
        matcher             = "200,404"
      }
    }
    notification-target = {
      name_prefix = "not-"
      port        = 8086
      protocol    = "HTTP"
      target_type = "ip"
      create_attachment = false

      health_check = {
        enabled             = true
        interval            = 30
        path                = "/health"
        port                = "traffic-port"
        healthy_threshold   = 2
        unhealthy_threshold = 2
        timeout             = 5
        protocol            = "HTTP"
        matcher             = "200,404"
      }
    }
  }

  listeners = {
    http = {
      port     = 80
      protocol = "HTTP"

      fixed_response = {
        content_type = "text/plain"
        message_body = "Service Not Found"
        status_code  = "404"
      }

      rules = {
        auth_rule = {
          actions = [
            {
              forward = {
                target_group_key = "auth-target"
              }
            }
          ]
          conditions = [
            {
              path_pattern = {
                values = ["/api/login", "/api/register"]
              }
            }
          ]
        }
        event_rule = {
          actions = [
            {
              forward = {
                target_group_key = "event-target"
              }
            }
          ]
          conditions = [
            {
              path_pattern = {
                values = ["/api/events", "/api/events/*"]
              }
            }
          ]
        }
        ticket_rule = {
          actions = [
            {
              forward = {
                target_group_key = "ticket-target"
              }
            }
          ]
          conditions = [
            {
              path_pattern = {
                values = ["/api/tickets", "/api/tickets/*"]
              }
            }
          ]
        }
        venue_rule = {
          actions = [
            {
              forward = {
                target_group_key = "venue-target"
              }
            }
          ]
          conditions = [
            {
              path_pattern = {
                values = ["/api/venues", "/api/venues/*"]
              }
            }
          ]
        }
        staff_rule = {
          actions = [
            {
              forward = {
                target_group_key = "staff-target"
              }
            }
          ]
          conditions = [
            {
              path_pattern = {
                values = ["/api/staff", "/api/staff/*"]
              }
            }
          ]
        }
        notification_rule = {
          actions = [
            {
              forward = {
                target_group_key = "notification-target"
              }
            }
          ]
          conditions = [
            {
              path_pattern = {
                values = ["/api/notifications", "/api/notifications/*"]
              }
            }
          ]
        }
      }
    }
  }

  tags = {
    Project = "FPT-Event-Management"
  }
}
