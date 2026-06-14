# FEMS Security Requirements

## Authentication

- Tokens must expire.
- Sensitive tokens must not be logged.
- Login failure should be auditable.
- High-privilege accounts should have stricter controls.

## Authorization and RBAC

- Student, Organizer, Staff, and Admin APIs must be enforced server-side.
- Organizer A must not access Organizer B's events, tickets, revenue, or reports.
- Staff/Admin-only APIs must reject lower-privilege users.
- Server must not trust role, user_id, event_id, price, or wallet balance from client input.

## Seat reservation

- A seat must not be reserved or sold to multiple users at the same time.
- Reservation must expire after the configured holding period.
- Payment confirmation must verify that the reservation is still valid.
- Booking logic should use database constraints, transaction, or locking.

## QR ticket and check-in

- QR token must not be predictable.
- A QR ticket must not be reusable after successful check-in.
- Check-in/check-out must be logged.
- Cancelled, refunded, or invalid tickets must be rejected.

## Payment and wallet

- Ticket price must be calculated on the server.
- Payment webhook signatures must be verified.
- Refund operations must be idempotent.
- Wallet balance must be updated through a transaction ledger.
- Money-related actions must be auditable.

## CI/CD

- Secrets must not be committed.
- Pull requests must pass CI checks before merge.
- High-risk security findings must block production release.
- GitHub Actions permissions should follow least privilege.