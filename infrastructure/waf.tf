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
    name     = "AllowImageUpload"
    priority = 5
    action {
      allow {}
    }
    statement {
      byte_match_statement {
        field_to_match {
          uri_path {}
        }
        positional_constraint = "STARTS_WITH"
        search_string         = "/api/upload/"
        text_transformation {
          priority = 0
          type     = "LOWERCASE"
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AllowImageUpload"
      sampled_requests_enabled   = true
    }
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

