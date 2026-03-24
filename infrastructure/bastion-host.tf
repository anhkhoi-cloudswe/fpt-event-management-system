# =============================================================================
# Bastion Host for RDS Access via SSH
# =============================================================================

data "local_file" "bastion_ssh_public" {
  filename = "${path.module}/fpt-bastion-ssh.pub"
}

resource "aws_key_pair" "bastion" {
  key_name   = "fpt-event-bastion-ssh"
  public_key = data.local_file.bastion_ssh_public.content

  tags = {
    Name    = "fpt-event-bastion-ssh"
    Project = "FPT-Event-Management"
  }
}

# Connect via SSH:
#   ssh -i fpt-bastion-ssh ec2-user@<bastion_public_ip>
#
# SSH tunnel to RDS (run on your local machine):
#   ssh -i fpt-bastion-ssh -N -L 13306:<rds_hostname>:3306 ec2-user@<bastion_public_ip>
#   mysql -h 127.0.0.1 -P 13306 -u admin -p
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
  ami           = data.aws_ami.al2023.id
  instance_type = "t3.micro"

  key_name                    = aws_key_pair.bastion.key_name
  subnet_id                   = module.vpc.public_subnets[0]
  vpc_security_group_ids      = [aws_security_group.bastion.id]
  associate_public_ip_address = true

  tags = {
    Name    = "fpt-bastion"
    Project = "FPT-Event-Management"
  }
}

resource "aws_security_group" "bastion" {
  name        = "fpt-bastion-sg"
  description = "Security group for bastion host - SSH only"
  vpc_id      = module.vpc.vpc_id

  # Allow SSH inbound
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SSH inbound"
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

output "bastion_instance_id" {
  description = "Instance ID of the bastion host"
  value       = aws_instance.bastion.id
}

output "bastion_public_ip" {
  description = "Public IPv4 of the bastion (SSH)"
  value       = aws_instance.bastion.public_ip
}

output "bastion_ssh_private_key_path" {
  description = "Local path to private SSH key (chmod 600 after terraform apply)"
  value       = "${path.module}/fpt-bastion-ssh"
}

output "bastion_ssh_public_key_path" {
  description = "Local path to public SSH key"
  value       = "${path.module}/fpt-bastion-ssh.pub"
}

output "bastion_ssh_command" {
  description = "SSH command to connect to bastion"
  value       = "ssh -i ${path.module}/fpt-bastion-ssh ec2-user@${aws_instance.bastion.public_ip}"
}
