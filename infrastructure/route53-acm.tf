# =============================================================================
# Route 53 + ACM (us-east-1) — custom domain → CloudFront
# CloudFront chỉ chấp nhận cert ACM ở region us-east-1.
# =============================================================================

data "aws_route53_zone" "public" {
  name         = "${var.public_domain_name}."
  private_zone = false
}

resource "aws_acm_certificate" "cloudfront" {
  provider = aws.us_east_1

  domain_name               = var.public_domain_name
  subject_alternative_names = var.public_domain_extra_aliases
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name    = "${var.public_domain_name}-cloudfront"
    Project = "FPT-Event-Management"
  }
}

resource "aws_route53_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cloudfront.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  zone_id         = data.aws_route53_zone.public.zone_id
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
}

resource "aws_acm_certificate_validation" "cloudfront" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.cloudfront.arn
  validation_record_fqdns = [for r in aws_route53_record.acm_validation : r.fqdn]
}

# Apex + optional names (www + any extra) → CloudFront
resource "aws_route53_record" "cloudfront_alias" {
  for_each = toset(concat([var.public_domain_name], var.public_domain_extra_aliases))

  zone_id = data.aws_route53_zone.public.zone_id
  name    = each.key
  type    = "A"

  alias {
    name                   = module.cloudfront.cloudfront_distribution_domain_name
    zone_id                = module.cloudfront.cloudfront_distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "cloudfront_alias_ipv6" {
  for_each = toset(concat([var.public_domain_name], var.public_domain_extra_aliases))

  zone_id = data.aws_route53_zone.public.zone_id
  name    = each.key
  type    = "AAAA"

  alias {
    name                   = module.cloudfront.cloudfront_distribution_domain_name
    zone_id                = module.cloudfront.cloudfront_distribution_hosted_zone_id
    evaluate_target_health = false
  }
}
