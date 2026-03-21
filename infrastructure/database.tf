# =============================================================================
# Database Layer (RDS MySQL)
# =============================================================================

resource "aws_security_group" "rds" {
  name        = "fpt-rds-sg"
  description = "Security group for RDS MySQL"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 3306
    to_port     = 3306
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "fpt-rds-sg" }
}

resource "aws_db_subnet_group" "main" {
  name       = "fpt-rds-subnet-group"
  subnet_ids = module.vpc.private_subnets

  tags = { Name = "fpt-rds-subnet-group" }
}

module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.0"

  identifier = "fpt-event-mysql"

  engine               = "mysql"
  engine_version       = "8.0"
  family               = "mysql8.0"
  major_engine_version = "8.0"
  instance_class       = "db.t3.medium"

  allocated_storage     = 20
  max_allocated_storage = 100

  db_name  = "fpteventmanagement"
  username = "admin"
  password = "FptEvent2024!"

  manage_master_user_password = false

  port = "3306"

  multi_az               = false
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 1
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  skip_final_snapshot = true

  tags = {
    Project = "FPT-Event-Management"
  }
}
