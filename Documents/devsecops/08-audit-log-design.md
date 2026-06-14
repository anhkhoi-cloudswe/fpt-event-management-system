# FEMS Audit Log Design

## Purpose

FEMS handles event access, payments, refunds, wallet balance, and role-based administration. Audit logs provide evidence for security investigations, dispute handling, and operational review.

## Audit Log Principles

- Log security-relevant decisions, not secrets.
- Use structured fields where possible.
- Include actor, target, action, outcome, and correlation ID.
- Keep logs append-only from the application perspective.
- Redact tokens, passwords, OTPs, webhook signatures, and raw payment secrets.

## Required Audit Events

| Area | Event examples |
|---|---|
| Authentication | Login success/failure, token refresh failure, password reset request, Google login callback failure |
| Authorization | RBAC denial, Organizer object access denial, Staff/Admin-only denial |
| Event management | Event created, submitted, approved, rejected, updated, cancelled |
| Seat reservation | Seat reserved, reservation expired, reservation converted to paid ticket, reservation conflict |
| Ticket/QR | Ticket issued, check-in success, duplicate check-in attempt, invalid QR, check-out |
| Payment | Payment initiated, webhook accepted, webhook rejected, replay detected, amount mismatch |
| Wallet | Debit, credit, reserve, confirm, release, refund, double-refund rejection |
| Dashboard/reporting | Revenue dashboard access, cross-organizer access denial |
| CI/CD | Workflow changed, deployment started, deployment completed, secret scan failed |

## Suggested Schema

| Field | Description |
|---|---|
| `timestamp` | Server-generated UTC timestamp |
| `request_id` | Request or trace correlation ID |
| `actor_user_id` | Authenticated user ID when available |
| `actor_role` | Student, Organizer, Staff, Admin, internal service, or anonymous |
| `source_ip` | Client IP when available |
| `service` | Gateway or backend service name |
| `action` | Stable event name such as `ticket.checkin.success` |
| `target_type` | Event, ticket, wallet, payment, report, user, workflow |
| `target_id` | ID of the affected object when safe |
| `outcome` | Success, denied, failed, conflict |
| `reason` | Short reason code such as `rbac_denied` or `webhook_bad_signature` |
| `metadata` | Redacted contextual JSON |

## Redaction Rules

Never log:

- Passwords, OTPs, refresh tokens, access tokens, or session cookies.
- JWT signing secrets or internal service tokens.
- Payment webhook secrets or full signatures.
- AWS, Google, reCAPTCHA, SMTP, or database credentials.
- Full QR payload if it can be replayed.

Safe metadata examples:

- Event ID, ticket ID, category ticket ID, bill ID.
- Last four characters of an external transaction reference.
- Amount and currency when needed for payment/wallet audit.
- Boolean flags such as `signature_valid=false`.

## Retention and Access

- Production audit logs should be retained according to project/legal requirements.
- Access should be limited to maintainers with operational or security responsibilities.
- Audit log exports must be treated as sensitive data.
- Logs used for incident response should be attached to incident records with secrets redacted.
