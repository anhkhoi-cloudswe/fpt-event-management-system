## Summary

- 

## Security Checklist

- [ ] No secrets, private keys, real `.env` values, tokens, or credential files are committed.
- [ ] RBAC/ownership impact was considered for Student, Organizer, Staff, and Admin roles.
- [ ] Event, ticket, wallet, payment, report, and dashboard APIs remain object-scoped.
- [ ] Payment, wallet, QR, and seat-reservation changes include relevant tests or manual evidence.
- [ ] GitHub Actions or deployment changes use least privilege and platform secrets.

## Validation

- [ ] Frontend unit tests/build run when frontend changed.
- [ ] Backend unit tests/build run when backend changed.
- [ ] Security scan findings are fixed, triaged, or documented with an approved exception.
