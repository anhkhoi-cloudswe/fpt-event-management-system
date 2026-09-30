# TECHNICAL SPECIFICATION & IMPLEMENTATION PROMPT: FEMS PAYMENT, WALLET & SETTLEMENT ENGINE

> **Target Agent / Context:** Feed this document directly into Antigravity or your AI coding assistant within your repository workspace.

---

## 1. CONTEXT & WORKSPACE INSTRUCTIONS

### ⚠️ CRITICAL INSTRUCTION ON DATABASE SCHEMA
Do NOT generate a speculative or destructive database schema from scratch. 
Before writing any migrations or ORM models:
1. Locate and inspect the existing database files in the workspace:
   * `01_fpt_event_full_postgres.sql`
   * `01_fpt_event_full.sql`
2. Analyze the existing tables (especially `users`, `events`, `tickets`, `registrations`, `roles`, etc.).
3. Prepare non-breaking, incremental SQL migration scripts (`ALTER TABLE` or additive new tables) compatible with PostgreSQL standards. Maintain naming conventions, UUID/ID formats, and foreign key relationships already defined in the SQL scripts.

---

## 2. BUSINESS DOMAIN & CORE POLICIES

### A. Free RSVP Events (Non-Ticketed / Zero Price)
* **Tier 1 ($\le$ 100 Registrations):** Completely **FREE (0 VND)**.
* **Tier 2 (> 100 Registrations):**
  * **On-Campus (School affiliated / approved):** $250\text{ VND}$ per registration from person #101 onward.
  * **Off-Campus (External / Self-hosted):** $800\text{ VND}$ per registration from person #101 onward.
* **Billing Mechanism:** Deducted automatically from the Organizer's **Pre-paid Balance (Internal Wallet)**. If the balance reaches 0, registrations temporarily pause until topped up.

### B. Paid Events (Ticket Sales with Admission Fee)
Platform commission is applied on every successful ticket sale. Zero upfront deduction from the attendee; commission is withheld at settlement time.

* **On-Campus Events:**
  * $< 100$ tickets: $4.5\% + 1,000\text{ VND}$ per ticket.
  * $\ge 100$ tickets: $3.5\% + 1,000\text{ VND}$ per ticket.
* **Off-Campus Events:**
  * $< 100$ tickets: $6.0\% + 1,000\text{ VND}$ per ticket.
  * $\ge 100$ tickets: $5.0\% + 1,000\text{ VND}$ per ticket.

---

## 3. CASH FLOW ARCHITECTURE & WALLET SETTLEMENT

```
[Attendee Purchases Ticket]
           │
           ▼
[Payment Gateway (PayOS/VNPay/MoMo)] ──► [System Escrow Account]
                                                │
           ┌────────────────────────────────────┴────────────────────────────────────┐
           ▼                                                                         ▼
[FEMS Commission Withheld]                                            [Net Proceeds Credited]
• Fixed fee + % commission                                            • Credited to Organizer Wallet:
• Invoice/Receipt item generated                                        Gross - Commission
                                                                                     │
                                                                                     ▼
                                                                     [Organizer Initiates Payout]
                                                                     • Transfer to Linked Bank Account
```

### Wallet Mechanics:
1. **Organizer Internal Wallet:**
   * `available_balance`: Funds available for withdrawal or paying registration quotas.
   * `pending_balance`: Revenue from ongoing ticket sales locked until event completion / safety holding period.
   * `currency`: Default `VND`.
2. **Itemized Receipts & Tracking:**
   * Every transaction generates an immutable **Financial Receipt** (`order_id`, `ticket_id`, `gross_amount`, `system_fee_percentage`, `fixed_fee`, `net_amount`, `created_at`).
   * Organizers can view detailed itemized breakdowns and export receipts to Excel/PDF.
3. **Payout & Withdrawal Management:**
   * Organizers can link a verified Vietnamese bank account (`bank_code`, `account_number`, `account_holder_name`).
   * Withdrawal requests flow through: `PENDING` $\rightarrow$ `PROCESSING` $\rightarrow$ `COMPLETED` / `REJECTED`.

---

## 4. FUNCTIONAL REQUIREMENTS & TASKS

### Task 1: Schema Discovery & Migration Generation
* Read `01_fpt_event_full_postgres.sql` and `01_fpt_event_full.sql`.
* Propose additive tables/fields:
  * `organizer_wallets` (linked to `organizer_id` / `user_id`).
  * `wallet_transactions` (ledger entries for TOP_UP, TICKET_SALE, COMMISSION_FEE, USAGE_FEE, WITHDRAWAL).
  * `organizer_bank_accounts` (bank routing details, verification flags).
  * `payout_requests` (withdrawal lifecycle tracking).
  * `event_fee_configurations` (event category: on-campus vs off-campus, custom rate overrides).

### Task 2: Payment Webhook & Commission Processing Engine
* Implement webhook handlers for incoming customer payments.
* Wrap ticket creation, wallet balance updates, and ledger inserts within an **ACID Transaction** to guarantee idempotency and prevent double-spending or race conditions.
* Compute dynamic fees based on current ticket volume tier ($<100$ vs $\ge 100$) and event location type.

### Task 3: Organizer Wallet & Invoice Module
* Implement API endpoints:
  * `GET /api/v1/organizer/wallet`: Return current available, pending, and lifetime earnings.
  * `GET /api/v1/organizer/wallet/transactions`: Paginated transaction history with filtering by type.
  * `GET /api/v1/organizer/events/{id}/financial-report`: Detailed revenue, fee breakdown, and net profit per ticket class.
  * `POST /api/v1/organizer/wallet/topup`: Create QR payment link for pre-paid balance.
  * `POST /api/v1/organizer/bank-accounts`: Register/verify beneficiary bank account.
  * `POST /api/v1/organizer/wallet/payout`: Submit payout request with balance deduction.

### Task 4: Free Event Quota Enforcement Service
* For free events exceeding 100 attendees:
  * Validate if the organizer has sufficient balance in `organizer_wallets`.
  * Deduct $250\text{ VND}$ or $800\text{ VND}$ per registration atomically.
  * Emit an event/lock if balance reaches zero to prevent overselling.

---

## 5. NON-FUNCTIONAL REQUIREMENTS
* **Concurrency Safety:** Apply row-level locking (`SELECT ... FOR UPDATE`) or atomic SQL balance operations (`UPDATE organizer_wallets SET available_balance = available_balance - $amount WHERE available_balance >= $amount`) to prevent negative balances.
* **Audit Trail:** Maintain an append-only transaction ledger (`wallet_transactions`). Wallet balances must match the sum of their historical ledger records.