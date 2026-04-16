module "valkey_cache" {
  source  = "terraform-aws-modules/elasticache/aws"
  version = "~> 1.11.0" # Phiên bản cập nhật năm 2026 hỗ trợ tốt cho Valkey

  replication_group_id = "vbac-valkey-group"
  description          = "Valkey cluster for VBAC project"

  # Cấu hình định danh
  cluster_id           = "vbac-valkey-cluster"
  engine               = "valkey"
  engine_version       = "7.2"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.valkey7" # Lưu ý đổi tên parameter group cho Valkey
  port                 = 6379

  # Kết nối mạng (Module tự tạo Subnet Group)
  vpc_id     = module.vpc.vpc_id
  subnet_ids = [module.vpc.private_subnets[0]]

  # Bảo mật (Module tự tạo Security Group)
  security_group_rules = {
    ingress_vpc = {
      description = "Allow inbound from VPC"
      cidr_ipv4   = module.vpc.vpc_cidr_block
    }
  }

  tags = {
    Project = "FPT-Event-Management"
  }
}

output "valkey_primary_endpoint" {
  description = "Địa chỉ kết nối đến Valkey Primary node để Read/Write"
  value       = module.valkey_cache.replication_group_primary_endpoint_address
}

output "valkey_reader_endpoint" {
  description = "Địa chỉ kết nối đến Valkey Reader node để Read-only"
  value       = module.valkey_cache.replication_group_reader_endpoint_address
}


module "sqs" {
  source  = "terraform-aws-modules/sqs/aws"
  version = "~> 5.2.1" # [1]

  name = "my-app-queue" # [3]

  # 1. Kích hoạt Dead Letter Queue để hứng các tin nhắn xử lý lỗi
  create_dlq = true               # [4]
  dlq_name   = "my-app-queue-dlq" # [5]

  # 2. Cấu hình thời gian (tính bằng giây)
  visibility_timeout_seconds    = 30      # Thời gian ẩn tin nhắn khi đang được xử lý [6]
  message_retention_seconds     = 345600  # Thời gian lưu giữ tin nhắn (Ví dụ: 4 ngày) [3]
  dlq_message_retention_seconds = 1209600 # Thời gian lưu giữ trong DLQ (Ví dụ: 14 ngày) [5]

  # 3. Bật mã hóa bảo mật mặc định của SQS
  sqs_managed_sse_enabled     = true # [7]
  dlq_sqs_managed_sse_enabled = true # [8]

  # (Tùy chọn) Đổi thành true và đặt tên có đuôi .fifo nếu bạn cần loại hàng đợi FIFO 
  # fifo_queue = false # [8]
}

output "sqs_queue_url" {
  value = module.sqs.queue_url # [6]
}

