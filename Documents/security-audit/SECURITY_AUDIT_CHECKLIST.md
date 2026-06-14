# FEMS Security Audit Checklist

## Repository and CI/CD

- [ ] `main` is protected and direct commits are disabled.
- [ ] Pull requests are required before merge.
- [ ] `.github/CODEOWNERS` protects workflows and security-sensitive files.
- [ ] Secret scanning runs on pull requests.
- [ ] GitHub Actions use least-privilege `permissions`.
- [ ] Deployment secrets are stored in platform secret managers, not source.
- [ ] `.env.example` files contain placeholders only.

## Application Security

- [ ] Student, Organizer, Staff, and Admin APIs enforce server-side RBAC.
- [ ] Event, ticket, wallet, payment, report, venue, and dashboard APIs enforce object ownership.
- [ ] QR check-in prevents duplicate use and unauthorized organizer scanning.
- [ ] Seat reservation/payment uses transactions, locks, or uniqueness controls.
- [ ] Payment webhooks verify signatures and reject replays.
- [ ] Wallet debit, credit, reserve, release, and refund operations are ledger-backed and idempotent.
- [ ] Sensitive request bodies, tokens, OTPs, and signatures are not logged.
- [ ] Upload endpoints restrict role, file type, and size.

## Dependency and Build Security

- [ ] Frontend dependency audit has no unapproved high/critical production findings.
- [ ] Go vulnerability scan has no unapproved reachable high-risk findings.
- [ ] Semgrep findings are triaged.
- [ ] gosec findings are triaged.
- [ ] Docker image scan findings are triaged.
- [ ] Frontend unit tests pass.
- [ ] Backend unit tests pass.
- [ ] Frontend and backend builds pass.

## Runtime and Release

- [ ] Backend health check passes after deployment.
- [ ] Frontend smoke test passes after deployment.
- [ ] DAST scan runs against staging/preview or approved production URL.
- [ ] Monitoring and audit logs cover auth, RBAC denial, payment, wallet, QR, and CI/CD events.
- [ ] Rollback process and last known-good release are identified.

## Incident Preparedness

- [ ] Secret leak runbook is available.
- [ ] QR replay runbook is available.
- [ ] Payment webhook runbook is available.
- [ ] Security contacts and owners are known.
- [ ] Findings feed into a tracked security backlog.
