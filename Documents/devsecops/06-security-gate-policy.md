# FEMS Security Gate Policy

## Purpose

This policy defines the required quality and security gates for FEMS pull requests and releases. The gates are risk-driven and map to the highest-impact FEMS risks: secret leakage, RBAC/IDOR defects, ticket replay, seat double booking, payment webhook abuse, wallet ledger abuse, dashboard data exposure, and GitHub Actions tampering.

## Branch Governance

- Do not commit directly to `main`.
- All changes to application code, infrastructure, GitHub Actions, security policy, and deployment configuration must go through a pull request.
- Pull requests must be reviewed by the relevant code owners before merge.
- Workflow changes under `.github/` require security or repository-owner review.
- Secrets must be stored in GitHub Actions secrets, Vercel project secrets, Render/service secrets, or a managed secret store. They must not be committed.

## Required Pull Request Gates

| Gate | Tooling | Blocks merge when |
|---|---|---|
| Secret scan | Gitleaks | Any verified secret, private key, credential file, token, or high-confidence leak is found |
| Frontend dependency audit | `npm audit` | High or critical production dependency vulnerability is present without approved exception |
| Backend dependency audit | `govulncheck` | Reachable high-risk Go vulnerability is present without approved exception |
| SAST | Semgrep, gosec | High or critical finding affects auth, authorization, payment, wallet, ticket, file upload, or CI/CD code |
| Frontend unit tests | Vitest | Any unit test fails |
| Frontend build | Vite | Build fails |
| Backend unit tests | `go test ./...` | Any unit test fails |
| Backend build | `go build` | Gateway or service build fails |
| Container image scan | Trivy | High or critical OS/library vulnerability is present without approved exception |

## Release Gates

- The release candidate must be built from reviewed code.
- Required CI and security jobs must pass before deployment.
- Backend health check must pass after deployment.
- Frontend health check or smoke test must pass after deployment.
- DAST must run against the deployed non-production or approved production URL.
- Any DAST finding affecting authentication, authorization, payment, ticketing, wallet, or dashboard confidentiality must be triaged before release promotion.

## Severity Policy

| Severity | Merge/release action |
|---|---|
| Critical | Block merge and release. Fix immediately or roll back. |
| High | Block release. Block merge unless a documented temporary exception is approved. |
| Medium | Track in backlog with owner and due date. May merge if no exploit path exists in FEMS context. |
| Low | Track and fix during normal maintenance. |

## Exception Process

Exceptions are temporary and must include:

- Finding ID, source tool, and affected file/package.
- Business reason for accepting the risk.
- Compensating control.
- Owner.
- Expiration date.
- Follow-up ticket or issue.

Exceptions must not be used for committed secrets, unauthenticated admin access, payment signature bypass, or wallet balance manipulation.

## FEMS-Specific Required Checks

- RBAC-sensitive PRs must include reviewer attention to Student, Organizer, Staff, and Admin boundaries.
- Event, ticket, wallet, payment, and dashboard APIs must include object-level authorization review.
- QR check-in changes must consider duplicate check-in and replay behavior.
- Seat reservation changes must consider transaction boundaries, locking, and uniqueness.
- Payment webhook changes must verify signature validation, replay handling, and idempotency.
- Wallet/refund changes must preserve ledger integrity and idempotency.
- Dashboard changes must ensure Organizer users cannot see other organizers' revenue or attendance data.

## Audit Evidence

Each release should retain:

- Pull request review record.
- CI and security workflow run links.
- DAST report summary.
- Approved exceptions, if any.
- Release notes identifying security-relevant changes.
