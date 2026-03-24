# =============================================================================
# Shared variables — infrastructure root
# (public_domain_* lives in cloudfront.tf — used by CloudFront + Route53 + outputs)
# =============================================================================

variable "cors_allowed_origins" {
  type        = list(string)
  description = <<-EOT
    Browser origins allowed by API Gateway CORS. Include your custom domain HTTPS URLs.
  EOT
  default = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://fpt-event.online",
    "https://www.fpt-event.online",
  ]
}
