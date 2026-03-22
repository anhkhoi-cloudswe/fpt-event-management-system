# =============================================================================
# Bastion Host for RDS Access
# =============================================================================
# Use AWS SSM Session Manager to connect to this host, then run MySQL commands
# to initialize the RDS database.
#
# Connect via AWS Console:
#   EC2 → Instances → fpt-bastion → Connect → Session Manager
#
# Or via CLI:
#   aws ssm start-session --target <instance-id>
# =============================================================================

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-ecs-hvm-*-x86_64"]
  }
  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
  filter {
    name   = "state"
    values = ["available"]
  }
}

resource "aws_instance" "bastion" {
  ami = data.aws_ami.al2023.id
  instance_type = "t3.micro"

  subnet_id                   = module.vpc.public_subnets[0]
  security_groups             = [aws_security_group.bastion.id]
  iam_instance_profile        = aws_iam_instance_profile.bastion.name
  associate_public_ip_address  = true

  tags = {
    Name = "fpt-bastion"
    Project = "FPT-Event-Management"
  }
}

resource "aws_security_group" "bastion" {
  name        = "fpt-bastion-sg"
  description = "Security group for bastion host - full access"
  vpc_id     = module.vpc.vpc_id

  # Allow all inbound (SSH, RDP, etc.)
  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All inbound"
  }

  # Allow all outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound"
  }

  tags = {
    Name = "fpt-bastion-sg"
  }
}

# IAM policy for SSM Session Manager
resource "aws_iam_instance_profile" "bastion" {
  name = "fpt-bastion-profile"
  role = aws_iam_role.bastion.name
}

resource "aws_iam_role" "bastion" {
  name = "fpt-bastion-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = {
    Name = "fpt-bastion-role"
  }
}

resource "aws_iam_role_policy_attachment" "bastion_ssm" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "bastion_ssm_session" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM"
}

# Add SSM endpoint to VPC (required for Session Manager)
# Note: If using a modern VPC, SSM endpoint may already exist

output "bastion_instance_id" {
  description = "Instance ID of the bastion host for SSM connection"
  value       = aws_instance.bastion.id
}

output "ssm_connect_command" {
  description = "Command to connect to bastion via SSM"
  value       = "aws ssm start-session --target ${aws_instance.bastion.id} --region ap-southeast-1"
}
