# Secret Leak Runbook

## Trigger

Use this runbook when a secret, private key, token, credential file, or webhook signing secret is committed, logged, uploaded, or exposed in CI output.

## Immediate Actions

1. Stop active deployment or release if the secret may affect production.
2. Identify the exposed secret type and owning service.
3. Revoke or rotate the secret in the source system.
4. Update the deployment platform secret value.
5. Rerun affected services or deployments so they use the rotated value.
6. Remove the secret from the working tree and replace it with a placeholder in `.env.example` when needed.
7. Run Gitleaks again.

## Git History Guidance

If the secret reached a shared remote, treat it as compromised even if the commit is later removed. History cleanup may reduce accidental exposure, but rotation is still mandatory.

## Evidence to Capture

- Commit, branch, PR, or workflow run where exposure occurred.
- Secret type and affected service.
- Rotation time.
- Person who rotated it.
- Follow-up PR or issue.

## Post-Incident

- Add or tighten `.gitignore` rules if needed.
- Add a placeholder-only env example.
- Add a regression check if the leak pattern was not detected.
