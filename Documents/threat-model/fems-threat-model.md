# FEMS Threat Model

## Method

This is a lightweight STRIDE-inspired threat model for the FEMS DevSecOps pipeline.

| Flow | Threat | Attack example | Control |
|---|---|---|---|
| Login | Spoofing | Brute-force Staff/Admin account | Rate limit, audit failed login |
| Event approval | Tampering | Organizer changes event status to approved | Server-side RBAC |
| Seat reservation | Race condition | Two users reserve the same seat | Transaction, locking, unique constraint |
| QR check-in | Replay | Same QR is used multiple times | Atomic check-in status update |
| Payment webhook | Tampering | Fake payment success callback | HMAC/signature verification |
| Wallet | Repudiation | User denies wallet transaction | Ledger and audit log |
| Revenue dashboard | Information disclosure | Organizer A views Organizer B revenue | Object-level authorization |
| CI/CD | Secret leakage | API key committed to GitHub | Gitleaks, protected secrets |
| GitHub Actions | Pipeline tampering | Malicious workflow change | CODEOWNERS and PR review |
