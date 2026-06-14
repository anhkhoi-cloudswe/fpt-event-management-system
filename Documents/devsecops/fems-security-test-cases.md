# FEMS Security Test Cases

## Purpose

These test cases translate the FEMS risk model into concrete validation scenarios for manual testing, automated API tests, and future regression coverage.

| ID | Risk | Scenario | Expected result |
|---|---|---|---|
| SEC-001 | Secret leakage | Commit contains `.env`, private key, API token, or webhook secret | Gitleaks blocks the change |
| SEC-002 | RBAC bypass | Student calls Staff/Admin management endpoint | Request is rejected with 401/403 |
| SEC-003 | RBAC bypass | Organizer calls Admin-only system configuration endpoint | Request is rejected with 401/403 |
| SEC-004 | IDOR | Organizer A requests Organizer B event details or edit API | Request is rejected or returns no unauthorized data |
| SEC-005 | Dashboard disclosure | Organizer A requests Organizer B revenue stats | Request is rejected or scoped to Organizer A only |
| SEC-006 | Ticket IDOR | Student A requests Student B ticket or bill detail | Request is rejected |
| SEC-007 | Wallet IDOR | User requests wallet balance or ledger for another user ID | Server ignores client user ID and uses authenticated user |
| SEC-008 | Seat race | Two users reserve/pay for the same seat concurrently | Only one reservation/payment succeeds |
| SEC-009 | Reservation expiry | User pays after reservation expiration | Payment is rejected and seat is released |
| SEC-010 | QR replay | Same ticket QR is checked in twice | First succeeds, second is rejected/audited |
| SEC-011 | Invalid QR | Staff scans random or malformed QR value | Request is rejected without server error |
| SEC-012 | Organizer ownership | Organizer scans QR for event they do not own | Request is rejected |
| SEC-013 | Payment webhook forgery | Webhook is sent without a valid signature | Request is rejected and audited |
| SEC-014 | Payment webhook replay | Same valid webhook is sent twice | Second request is idempotent and does not issue duplicate tickets |
| SEC-015 | Payment amount tampering | Client changes ticket price or amount before payment | Server-calculated price is used; tampering is rejected |
| SEC-016 | Wallet double refund | Same refund/report approval is processed twice | Balance changes once; duplicate is rejected or idempotent |
| SEC-017 | Wallet ledger integrity | Debit succeeds but ticket issuance fails | Wallet reservation is released or transaction is rolled back |
| SEC-018 | File upload | Unauthorized role uploads event/speaker image | Request is rejected |
| SEC-019 | Token expiry | Expired access token calls protected endpoint | Request is rejected or refresh flow is required |
| SEC-020 | Workflow tampering | PR changes `.github/workflows/*` | CODEOWNERS requires review and security workflow runs |

## Automation Priority

1. Secret scanning and CI gate checks.
2. Pure utility/unit tests that support input validation and date handling.
3. Backend unit tests for validators, password hashing, and timezone helpers.
4. API integration tests for RBAC, IDOR, QR replay, payment webhook, wallet refund, and seat race cases.
5. DAST smoke scans against deployed staging/preview.
