# FEMS Critical Assets and Risks

| Asset | Why it matters | Main risks |
|---|---|---|
| User accounts | Account takeover can lead to unauthorized operations | Brute force, session abuse |
| Staff/Admin roles | High-privilege users can approve, audit, and manage events | Privilege escalation, RBAC bypass |
| Organizer data | Organizers manage events, speakers, tickets, and analytics | IDOR, unauthorized access |
| Seat reservations | Seat state affects ticket availability and revenue | Race condition, double booking |
| QR tickets | QR is used for event access control | Replay, forgery, duplicate check-in |
| Payment records | Payment state controls ticket issuance | Webhook tampering, replay, price manipulation |
| Wallet ledger | Wallet is financial/accounting data | Balance manipulation, double refund |
| Revenue dashboard | Contains sensitive event/business data | Information disclosure |
| CI/CD secrets | Secrets can control deployment or access APIs | Secret leakage |
| GitHub Actions workflows | Workflows can modify CI/CD behavior | Pipeline tampering |

