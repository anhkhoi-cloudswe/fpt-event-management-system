# FEMS Release Process

## Purpose

This process describes how FEMS changes move from pull request to deployment with security gates, environment checks, and rollback readiness.

## Environments

| Environment | Purpose | Required controls |
|---|---|---|
| Local | Developer validation | `.env` kept local, no real production secrets committed |
| CI | Build and security validation | Least-privilege GitHub Actions permissions, repository secrets only |
| Staging/preview | Deployment validation and DAST | Non-production secrets, health checks, smoke tests |
| Production | User-facing release | Approved PR, required gates passed, rollback plan available |

## Release Flow

1. Create a feature branch from the current integration branch.
2. Implement changes with tests and documentation updates.
3. Open a pull request using the repository template.
4. Run required CI and security gates:
   - Secret scan
   - SCA
   - SAST
   - Frontend unit tests and build
   - Backend unit tests and build
   - Docker build and image scan
5. Address failed gates before merge.
6. Deploy backend to the selected environment.
7. Run backend health check at `/health` or `/api/health`.
8. Deploy frontend.
9. Run frontend smoke test and basic authenticated route checks where possible.
10. Run DAST against the deployed URL.
11. Triage findings and either promote, hold, or roll back.

## Production Readiness Checklist

- No committed secrets or real credentials in the diff.
- Required CI and security workflows passed.
- High-risk FEMS flows reviewed: RBAC, IDOR, QR check-in, seats, payment, wallet, dashboard.
- Environment variables are configured in the deployment platform, not in source.
- Health checks pass after deployment.
- DAST findings are triaged.
- Rollback target is known.

## Rollback

Rollback is required when production shows:

- Authentication or authorization bypass.
- Payment confirmation or wallet balance inconsistency.
- QR check-in replay or duplicate admission.
- Seat double booking.
- Severe availability regression.
- Confirmed secret exposure.

Rollback steps:

1. Disable the broken release path if possible.
2. Redeploy the last known-good backend image or service revision.
3. Redeploy the last known-good frontend version.
4. Rotate exposed secrets when relevant.
5. Record incident details in the appropriate runbook.
6. Create follow-up work items for root-cause remediation.

## Change Freeze Guidance

Avoid production releases during active incidents, unresolved critical security findings, or major event windows unless the release directly mitigates the incident.
