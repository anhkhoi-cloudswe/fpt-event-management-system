# QR Replay Incident Runbook

## Trigger

Use this runbook when a ticket QR is reused, duplicated, forged, or allows unauthorized event entry.

## Immediate Actions

1. Preserve event ID, ticket ID, QR value hash if available, scan time, organizer/staff user, and device/source IP.
2. Check whether the ticket has multiple check-in timestamps or conflicting status transitions.
3. Pause check-in for the affected event if unauthorized entry is ongoing.
4. Verify that the organizer scanning the QR owns the event.
5. Confirm whether duplicate check-in protection failed or the QR payload was exposed.
6. Mark affected tickets for manual review.

## Containment

- Disable or rotate compromised QR tokens when supported.
- Require manual ID/ticket validation for affected attendees.
- Block known replayed QR values.
- Patch check-in logic if duplicate status updates are not atomic.

## Recovery

1. Reconcile attendance records.
2. Notify event staff and affected users if needed.
3. Deploy fix after CI/security gates pass.
4. Add regression tests for duplicate scan, wrong organizer, invalid QR, and concurrent scan.

## Evidence to Capture

- Event, ticket, bill, user, and organizer IDs.
- Audit logs for scans and denials.
- API request IDs.
- Timeline of first valid scan and replay attempts.
