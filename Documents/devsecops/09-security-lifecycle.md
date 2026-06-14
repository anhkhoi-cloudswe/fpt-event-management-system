# FEMS Security Lifecycle

## Purpose

This lifecycle keeps FEMS security work continuous instead of treating security as a one-time audit.

## Security Activities by Phase

| Phase | Activities |
|---|---|
| Plan | Update assets, risks, and requirements for new features |
| Design | Review RBAC, object ownership, payment/wallet state, and audit logging |
| Code | Use secure coding patterns, avoid secrets, add focused tests |
| Build | Run SCA, SAST, unit tests, builds, and image scans |
| Deploy | Use protected environments, platform secrets, health checks, and DAST |
| Operate | Monitor logs, triage findings, rotate secrets, respond to incidents |
| Improve | Feed incidents and audit findings into backlog and test cases |

## Recurring Reviews

- Review dependency and container vulnerabilities at least monthly.
- Review GitHub Actions permissions and CODEOWNERS quarterly.
- Review environment secrets after team or hosting changes.
- Revisit the threat model after new payment, wallet, ticket, or admin features.
- Review audit logs after production incidents and major events.

## Secure Coding Expectations

- Enforce authorization on the server, never only in React.
- Use authenticated user and role from trusted middleware or verified token claims.
- Verify object ownership for event, ticket, wallet, payment, report, and dashboard APIs.
- Keep payment amount and wallet balance calculations server-side.
- Make payment webhook and refund operations idempotent.
- Use database constraints, transactions, or locking for seat and wallet state.
- Avoid logging sensitive request bodies.
- Keep deployment and API secrets out of Git.

## Security Backlog

Security findings should be tracked with:

- Description and affected component.
- Risk and severity.
- Owner.
- Target fix date.
- Link to PR, test, or exception.

## Definition of Done for Security-Sensitive Changes

- Unit or integration tests cover the changed behavior.
- Authorization and ownership checks are reviewed.
- Audit event impact is considered.
- No new secrets or sensitive logs are introduced.
- CI/security gates pass or have approved exceptions.
