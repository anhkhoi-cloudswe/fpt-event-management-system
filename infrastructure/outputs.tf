# =============================================================================
# FPT Event Management — Terraform Outputs
# =============================================================================

output "api_gateway_url" {
  description = "API Gateway HTTP API endpoint URL"
  value       = module.api_gateway.api_endpoint
}

output "api_gateway_id" {
  description = "API Gateway HTTP API ID"
  value       = module.api_gateway.api_id
}

output "api_gateway_arn" {
  description = "API Gateway HTTP API ARN"
  value       = module.api_gateway.api_arn
}

output "waf_web_acl_arn" {
  description = "Regional WAFv2 Web ACL ARN (ALB)"
  value       = module.api_waf.arn
}

output "waf_web_acl_id" {
  description = "Regional WAFv2 Web ACL ID (ALB)"
  value       = module.api_waf.id
}

output "cloudfront_url" {
  description = "CloudFront distribution URL (reverse proxy + WAF in front of API Gateway)"
  value       = "https://${module.cloudfront.cloudfront_distribution_domain_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.cloudfront.cloudfront_distribution_id
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.loadbalancer.dns_name
}

output "alb_arn" {
  description = "ALB ARN"
  value       = module.loadbalancer.arn
}

output "alb_zone_id" {
  description = "ALB Zone ID"
  value       = module.loadbalancer.zone_id
}

output "rds_endpoint" {
  description = "RDS MySQL instance endpoint"
  value       = module.rds.db_instance_endpoint
}

output "rds_port" {
  description = "RDS MySQL instance port"
  value       = module.rds.db_instance_port
}

output "rds_arn" {
  description = "RDS MySQL instance ARN"
  value       = module.rds.db_instance_arn
}

output "ecs_cluster_arn" {
  description = "ECS Cluster ARN"
  value       = module.ecs.cluster_arn
}

output "ecs_cluster_name" {
  description = "ECS Cluster Name"
  value       = module.ecs.cluster_name
}

output "ecs_service_arns" {
  description = "Map of ECS Service names to IDs"
  value = {
    for svc_name, svc in module.ecs.services : svc_name => svc.id
  }
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "vpc_cidr_block" {
  description = "VPC CIDR block"
  value       = module.vpc.vpc_cidr_block
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = module.vpc.public_subnets
}

output "azs" {
  description = "List of Availability Zones"
  value       = module.vpc.azs
}
