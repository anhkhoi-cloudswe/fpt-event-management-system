# =============================================================================
# CloudFront: S3 SPA (default) + API Gateway (/api/*)
# Domain variables are declared here so editors resolve them in this file;
# they are root-module variables (also referenced in route53-acm.tf, outputs.tf).
# =============================================================================

variable "public_domain_name" {
  type        = string
  description = "Public site hostname (Route 53 hosted zone must exist, e.g. fpt-event.online)"
  default     = "fpt-event.online"
}

variable "public_domain_extra_aliases" {
  type        = list(string)
  description = "Extra hostnames on the same certificate + Route53 alias (e.g. www)"
  default     = ["www.fpt-event.online"]
}

module "cloudfront" {
  source  = "terraform-aws-modules/cloudfront/aws"
  version = "~> 3.0"

  comment             = "FPT Event — SPA (S3) + API Gateway reverse proxy"
  enabled             = true
  is_ipv6_enabled     = true
  wait_for_deployment = false
  default_root_object = "index.html"

  aliases = concat([var.public_domain_name], var.public_domain_extra_aliases)

  depends_on = [aws_acm_certificate_validation.cloudfront]

  create_origin_access_control = true
  origin_access_control = {
    frontend_s3 = {
      description      = "OAC for frontend S3 bucket"
      origin_type      = "s3"
      signing_behavior = "always"
      signing_protocol = "sigv4"
    }
  }

  origin = {
    frontend_s3 = {
      domain_name           = aws_s3_bucket.frontend.bucket_regional_domain_name
      origin_access_control = "frontend_s3"
    }
    api_gateway_origin = {
      domain_name = "${module.api_gateway.api_id}.execute-api.ap-southeast-1.amazonaws.com"
      custom_origin_config = {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  # API first (path match order: first listed = highest precedence in module)
  ordered_cache_behavior = [
    {
      path_pattern           = "/api/*"
      target_origin_id       = "api_gateway_origin"
      viewer_protocol_policy = "https-only"
      allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
      cached_methods         = ["GET", "HEAD"]
      use_forwarded_values   = false
      # Do not forward Host header to execute-api origin.
      # This avoids 403/MissingAuthenticationToken caused by host mismatch.
      cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
      origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader
    },
  ]

  # Use fixed policy IDs (not names) so plan stays stable across apply when aliases/cert change.
  default_cache_behavior = {
    target_origin_id         = "frontend_s3"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    use_forwarded_values     = false
    cache_policy_id          = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
    origin_request_policy_id = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf" # Managed-CORS-S3Origin
  }

  custom_error_response = [
    {
      error_code            = 403
      response_code         = 200
      response_page_path    = "/index.html"
      error_caching_min_ttl = 0
    },
    {
      error_code            = 404
      response_code         = 200
      response_page_path    = "/index.html"
      error_caching_min_ttl = 0
    },
  ]

  viewer_certificate = {
    acm_certificate_arn      = aws_acm_certificate_validation.cloudfront.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  web_acl_id = aws_wafv2_web_acl.cloudfront.arn

  tags = {
    Project = "FPT-Event-Management"
  }
}
