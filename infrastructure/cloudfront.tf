# =============================================================================
# CloudFront as Reverse Proxy for API Gateway
# =============================================================================

module "cloudfront" {
  source  = "terraform-aws-modules/cloudfront/aws"
  version = "~> 3.0"

  comment             = "CloudFront Reverse Proxy for FPT Event API Gateway"
  enabled             = true
  is_ipv6_enabled     = true
  wait_for_deployment = false

  # Origin: API Gateway HTTP API endpoint
  origin = {
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

  # Default cache behavior: pass all to API Gateway (no caching)
  default_cache_behavior = {
    target_origin_id       = "api_gateway_origin"
    viewer_protocol_policy = "https-only"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    # ForwardedValues: disable caching by forwarding all query strings/headers
    forwarded_values = {
      query_string = true
      headers     = ["*"]
      cookies = {
        forward = "all"
      }
    }
  }

  viewer_certificate = {
    cloudfront_default_certificate = true
  }

  # Attach WAFv2 CloudFront Web ACL
  web_acl_id = aws_wafv2_web_acl.cloudfront.arn

  tags = {
    Project = "FPT-Event-Management"
  }
}
