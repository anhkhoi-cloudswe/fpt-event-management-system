# =============================================================================
# AWS WAFv2 (Regional) — Cloud Posse module

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
# https://registry.terraform.io/modules/cloudposse/waf/aws/latest
#
# Regional WAF gắn vào ALB (HTTP API / API Gateway v2 không hỗ trợ AssociateWebACL).
# Luồng: CloudFront (WAF CLOUDFRONT riêng) → API Gateway → VPC Link → ALB → ECS;
# traffic sau VPC Link được WAF regional trên ALB kiểm tra trước ECS.
# =============================================================================

module "api_waf_label" {
  source  = "cloudposse/label/null"
  version = "0.25.0"

  namespace = "fpt"
  stage     = "prod"
  name      = "event-api-waf"

  tags = {
    Project = "FPT-Event-Management"
  }
}

module "api_waf" {
  source  = "cloudposse/waf/aws"
  version = "1.9.0"

  description = "WAF regional for FPT Event ALB - not attachable to HTTP API v2"
  scope       = "REGIONAL"

  # Cho phép mặc định; các managed rule + rate limit chặn traffic xấu / bão hòa
  default_action = "allow"

  visibility_config = {
    cloudwatch_metrics_enabled = true
    metric_name                = "fpt-event-api-waf"
    sampled_requests_enabled   = true
  }

  # Association done via separate resource below
  association_resource_arns = []

  # AWS Managed Rule Groups
  managed_rule_group_statement_rules = [
    {
      name     = "AWS-AmazonIpReputation"
      priority = 10
      statement = {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
      visibility_config = {
        cloudwatch_metrics_enabled = true
        sampled_requests_enabled   = true
        metric_name                = "fpt-waf-ip-reputation"
      }
    },
    {
      name     = "AWS-KnownBadInputs"
      priority = 20
      statement = {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
      visibility_config = {
        cloudwatch_metrics_enabled = true
        sampled_requests_enabled   = true
        metric_name                = "fpt-waf-known-bad-inputs"
      }
    },
    {
      name     = "AWS-CommonRuleSet"
      priority = 30
      statement = {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
      visibility_config = {
        cloudwatch_metrics_enabled = true
        sampled_requests_enabled   = true
        metric_name                = "fpt-waf-common-rules"
      }
    }
  ]

  # Giới hạn tốc độ theo IP
  rate_based_statement_rules = [
    {
      name     = "fpt-global-rate-limit"
      action   = "block"
      priority = 40
      statement = {
        limit                 = 2000
        aggregate_key_type    = "IP"
        evaluation_window_sec = 300
      }
      visibility_config = {
        cloudwatch_metrics_enabled = true
        sampled_requests_enabled   = true
        metric_name                = "fpt-waf-rate-limit"
      }
    }
  ]

  context = module.api_waf_label.context
}

# Associate regional WAF with ALB only (AWS WAF does not support HTTP API stage ARN).

resource "aws_wafv2_web_acl_association" "alb_waf" {
  resource_arn = module.loadbalancer.arn
  web_acl_arn  = module.api_waf.arn
}

# =============================================================================
# CloudFront WAF — must be in us-east-1 with CLOUDFRONT scope
# =============================================================================

resource "aws_wafv2_web_acl" "cloudfront" {
  provider = aws.us_east_1

  name        = "fpt-cloudfront-waf"
  description = "WAF for unified CloudFront SPA and API Gateway"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "fpt-cloudfront-waf-metrics"
    sampled_requests_enabled   = true
  }

  rule {
    name     = "AWS-AmazonIpReputation"
    priority = 10

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }

    override_action {
      none {}
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      sampled_requests_enabled   = true
      metric_name                = "fpt-cf-waf-ip-reputation"
    }
  }

  rule {
    name     = "AWS-KnownBadInputs"
    priority = 20

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    override_action {
      none {}
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      sampled_requests_enabled   = true
      metric_name                = "fpt-cf-waf-known-bad-inputs"
    }
  }

  rule {
    name     = "AWS-CommonRuleSet"
    priority = 30

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }

    override_action {
      none {}
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      sampled_requests_enabled   = true
      metric_name                = "fpt-cf-waf-common-rules"
    }
  }

  rule {
    name     = "fpt-cloudfront-rate-limit"
    priority = 40

    statement {
      rate_based_statement {
        limit                 = 2000
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"
      }
    }

    action {
      block {}
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      sampled_requests_enabled   = true
      metric_name                = "fpt-cf-waf-rate-limit"
    }
  }

  tags = {
    Project = "FPT-Event-Management"
  }
}

