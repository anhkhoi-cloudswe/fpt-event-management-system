# Payment Webhook Incident Runbook

## Trigger

Use this runbook when a payment webhook appears forged, replayed, duplicated, has a bad signature, or causes incorrect ticket/wallet state.

## Immediate Actions

1. Preserve request ID, payment provider reference, order/bill ID, amount, status, signature validation result, and timestamp.
2. Do not trust client-provided payment status.
3. Compare webhook details with provider dashboard or API.
4. Check whether tickets or wallet entries were created more than once.
5. Temporarily disable the affected webhook route if active abuse is confirmed.

## Containment

- Rotate webhook secret if compromise is suspected.
- Block replayed provider transaction references.
- Hold ticket issuance/refunds for affected orders until reconciled.
- Restore wallet balances using ledger-backed correction entries, not direct balance edits.

## Recovery

1. Reconcile bills, tickets, wallet ledger entries, and provider settlement records.
2. Reissue or cancel tickets as needed.
3. Deploy fixes for signature verification, replay detection, or idempotency.
4. Add regression tests for forged webhook, replayed webhook, amount mismatch, and duplicate refund.

## Evidence to Capture

- Raw request metadata with secrets/signatures redacted.
- Provider transaction reference.
- Bill, ticket, wallet, and user IDs.
- Ledger entries before and after correction.
- Secret rotation time if rotated.
