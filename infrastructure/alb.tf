# =============================================================================
# ALB Layer
# =============================================================================
# Path rules align with backend/cmd/gateway/main.go prefix routing.
# ALB allows at most 5 path_pattern values per rule — split rules when needed.
# Target groups: auth 8081, event 8082, ticket 8083, venue 8084, staff 8085, notification 8086
# =============================================================================

module "loadbalancer" {
  source = "terraform-aws-modules/alb/aws"

  name     = "fpt-event-alb"
  vpc_id   = module.vpc.vpc_id
  subnets  = module.vpc.private_subnets
  internal = true

  enable_deletion_protection = false

  create_security_group = true
  # VPC Link → ALB hits listener port 80 (not container ports 8081–8086).
  security_group_ingress_rules = {
    vpc_http_to_alb = {
      from_port   = 80
      to_port     = 80
      ip_protocol = "tcp"
      description = "HTTP from VPC (API Gateway VPC Link ENIs in private subnets)"
      cidr_ipv4   = module.vpc.vpc_cidr_block
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
      name_prefix       = "auth-"
      port              = 8081
      protocol          = "HTTP"
      target_type       = "ip"
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
    event-target = {
      name_prefix       = "evt-"
      port              = 8082
      protocol          = "HTTP"
      target_type       = "ip"
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
    ticket-target = {
      name_prefix       = "tkt-"
      port              = 8083
      protocol          = "HTTP"
      target_type       = "ip"
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
    venue-target = {
      name_prefix       = "ven-"
      port              = 8084
      protocol          = "HTTP"
      target_type       = "ip"
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
    staff-target = {
      name_prefix       = "stf-"
      port              = 8085
      protocol          = "HTTP"
      target_type       = "ip"
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
    notification-target = {
      name_prefix       = "not-"
      port              = 8086
      protocol          = "HTTP"
      target_type       = "ip"
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

      # Lower priority number = evaluated first. Match gateway order: staff/event-requests → Event before /api/staff/* → Staff.
      # Target groups: auth 8081, event 8082, ticket 8083, venue 8084, staff 8085, notification 8086
      rules = {
        event_staff_requests = {
          priority = 5
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
                values = ["/api/staff/event-requests", "/api/staff/event-requests/*"]
              }
            }
          ]
        }
        staff_admin_config = {
          priority = 10
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
                values = ["/api/admin/config", "/api/admin/config/*"]
              }
            }
          ]
        }
        auth_paths_a = {
          priority = 15
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
                values = [
                  "/api/login",
                  "/api/logout",
                  "/api/v1/auth/me",
                  "/api/auth/me",
                  "/api/register*",
                ]
              }
            }
          ]
        }
        auth_paths_b = {
          priority = 16
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
                values = [
                  "/api/forgot-password",
                  "/api/reset-password",
                  "/api/admin/create-account",
                  "/api/users",
                  "/api/users/*",
                ]
              }
            }
          ]
        }
        # /api/event/* must not use /api/event* (would match /api/event-requests).
        event_paths_singular = {
          priority = 18
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
                values = ["/api/event", "/api/event/*"]
              }
            }
          ]
        }
        event_paths_list = {
          priority = 19
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
                values = [
                  "/api/v1/events",
                  "/api/v1/events/*",
                  "/api/events",
                  "/api/events/*",
                ]
              }
            }
          ]
        }
        event_paths_b = {
          priority = 21
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
                values = [
                  "/api/event-requests",
                  "/api/event-requests/*",
                  "/api/organizer",
                  "/api/organizer/*",
                ]
              }
            }
          ]
        }
        ticket_paths_a = {
          priority = 30
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
                values = [
                  "/api/registrations",
                  "/api/registrations/*",
                  "/api/tickets",
                  "/api/tickets/*",
                ]
              }
            }
          ]
        }
        ticket_paths_a2 = {
          priority = 31
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
                values = [
                  "/api/category-tickets",
                  "/api/category-tickets/*",
                ]
              }
            }
          ]
        }
        # Wildcards keep patterns ≤5 per rule; /api/payment* covers /api/payment-ticket, /api/payment/my-bills, etc.
        ticket_paths_b = {
          priority = 32
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
                values = [
                  "/api/bills*",
                  "/api/payment*",
                ]
              }
            }
          ]
        }
        ticket_paths_c = {
          priority = 33
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
                values = [
                  "/api/buyTicket",
                  "/api/wallet",
                  "/api/wallet/*",
                ]
              }
            }
          ]
        }
        venue_paths_a = {
          priority = 40
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
                values = [
                  "/api/venues",
                  "/api/venues/*",
                  "/api/areas",
                  "/api/areas/*",
                ]
              }
            }
          ]
        }
        venue_paths_b = {
          priority = 41
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
                values = [
                  "/api/seats",
                  "/api/seats/*",
                ]
              }
            }
          ]
        }
        staff_paths = {
          priority = 50
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
        student_paths = {
          priority = 55
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
                values = ["/api/student", "/api/student/*"]
              }
            }
          ]
        }
        notification_paths = {
          priority = 60
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
