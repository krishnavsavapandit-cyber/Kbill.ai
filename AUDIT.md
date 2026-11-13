# Hostile Security Audit & Verification Report (AUDIT.md)
**Project**: BusinessOS AI  
**Repository Location**: `C:\Users\admin\.gemini\antigravity\scratch\businessos-ai`  
**Audit Standard**: Hostile / Zero-Trust Verification (No claims accepted without executable proof)  
**Verification Date**: November 13, 2026  
**Auditor**: Senior Security & Backend Infrastructure Specialist  

---

## 1. DONE AND PROVEN (With Executable Evidence)

The following capabilities, security guards, and database invariants have been implemented, executed, and verified through automated test suites against a live application server (`http://localhost:3000`).

### Cumulative Test Metrics: **197 / 197 PASSED (100% Success)**

| Phase | Category | Test Suite Script | Tests Executed | Passed | Failed |
|---|---|---|---|---|---|
| **Phase 1** | Authentication & Multi-Tenancy Hardening | `scripts/test-phase1.js` | 48 | 48 | 0 |
| **Phase 2** | Double-Booking Prevention & Timezones | `scripts/test-phase2.js` | 16 | 16 | 0 |
| **Phase 3** | Payments (Razorpay Gateway) | `scripts/test-phase3.js` | 24 | 24 | 0 |
| **Phase 4** | WhatsApp (Meta Cloud API Integration) | `scripts/test-phase4.js` | 20 | 20 | 0 |
| **Phase 5** | AI Quote Generation (Google Gemini) | `scripts/test-phase5.js` | 12 | 12 | 0 |
| **Phase 6** | GST Compliance & Monotonic Invoicing | `scripts/test-phase6.js` | 25 | 25 | 0 |
| **Phase 7** | Data, Audit & DPDP Compliance | `scripts/test-phase7.js` | 17 | 17 | 0 |
| **Phase 8** | Hardened Gaps, Concurrency & Entitlements | `scripts/test-phase8-hardened.js` | 35 | 35 | 0 |
| **Total** | **Comprehensive Full-System Audit** | `scripts/run-all-tests.js` | **197** | **197** | **0** |

---

### Executed Evidence by Architectural Domain

#### A. Multi-Tenancy & Authorization
- **Body-Based IDOR Rejection**: POST/PATCH requests referencing foreign `customerId`, `serviceId`, `quotationId`, `invoiceId`, or `conversationId` return HTTP 404 or 400 and write zero bytes to database.
- **Whitelist Protection**: Sending an explicit `businessId` in create or update bodies is completely ignored; tenant scoping is strictly bound to the authenticated JWT session (`requireBusiness()` helper).
- **List & Dashboard Isolation**: Verified that tenant list endpoints (`/api/customers`, `/api/quotations`, `/api/invoices`, `/api/services`, `/api/appointments`, `/api/whatsapp/messages`) and `/api/dashboard/metrics` return only records belonging to the authenticated tenant.
- **Page Route Protection**: Unauthenticated requests to all dashboard pages redirect to `/login` with 307. Only `/login`, `/signup`, `/book/[slug]`, `/privacy`, and verified webhooks are public.

#### B. Concurrency & Double-Booking Prevention
- **Database Collision Defense**: SQLite database enforces a partial unique index on `Appointment(businessId, ifnull(staffId, ''), startTime) WHERE status NOT IN ('CANCELLED', 'NO_SHOW')`.
- **Interval Overlap Guard**: Enforced interval overlap logic `(startTime < reqEndDate AND endTime > reqStartDate)` inside serialized transactions.
  - **Overlapping Intervals (10:00-11:00 vs 10:30-11:30)**: First succeeds (201), second returns HTTP 409 (`SLOT_CONFLICT`).
  - **Adjacent Boundary Intervals (10:00-11:00 vs 11:00-12:00)**: Both succeed (201) without false boundary collisions.
  - **Per-Staff Resource Scoping**: Dr. Arun and Dr. Priya can hold simultaneous bookings at 12:30; duplicate booking for Dr. Arun collides and returns HTTP 409.
- **20-Parallel-Request Concurrency Test**: Fired 20 simultaneous parallel HTTP booking requests for the exact same 30-minute time slot:
  - Exactly **1** request succeeded with HTTP 201.
  - Exactly **19** requests collided and returned HTTP 409 (`SLOT_CONFLICT`).
  - Zero 500 internal server errors. Database confirmed exactly 1 row written.
- **Mutation Proof**: Demonstrated that bypassing the application interval guard allows overlapping intervals with different start times (15:30 vs 15:45) to bypass naive uniqueness and create 2 overlapping rows, proving the serialized overlap guard is essential.
- **Timezone Integrity**: Stored in UTC (ISO 8601), rendered in business's configured timezone (default `Asia/Kolkata`). Appointments at 5:30 PM IST are stored as `12:00:00.000Z`.
- **Operating Hours & Closed Days**: Sunday / closed-day booking attempts are rejected with HTTP 400 (`BUSINESS_CLOSED`).

#### C. Plans, Entitlements & Feature Gating (`requireFeature`)
- **Subscription Model**: Honest 30-day one-time purchase plans (`FREE`, `STARTER`, `PRO`, `ENTERPRISE`).
- **Free Tier Caps Enforced**:
  - Max 5 Customers: First 5 succeed, 6th returns HTTP 403 (`PLAN_LIMIT_REACHED`).
  - Max 5 Invoices: First 5 succeed, 6th returns HTTP 403 (`PLAN_LIMIT_REACHED`).
  - Max 5 Appointments: First 5 active succeed, further requests return HTTP 403 (`PLAN_LIMIT_REACHED`).
- **Feature Restrictions**: AI quote generation blocked on Free tier with HTTP 403 (`FEATURE_NOT_PERMITTED`).
- **Expired Plan Fallback**: When `planExpiresAt < now()`, paid plans automatically fall back to Free limits.
- **Payment Verification Upgrade**: Verified Razorpay payment for plan purchases extends `planExpiresAt` by +30 days and upgrades `planId` to `STARTER` or `PRO`.

#### D. WhatsApp Integration & 24-Hour Policy Window
- **Meta Webhook Security**: Validates `x-hub-signature-256` using HMAC-SHA256 over raw request buffer with `crypto.timingSafeEqual`.
- **Idempotent Inbound Ingestion**: Deduplicates incoming messages using Meta's unique `wamid` (`metaMessageId`). Duplicate webhooks create zero duplicate messages or activity logs.
- **24-Hour Customer Service Window Enforcement**:
  - Free-form messages outside 24h from customer's `lastMessageAt` are blocked with HTTP 403 (`OUTSIDE_24_HOUR_WINDOW`).
  - Pre-approved message templates (`type: "template"`) bypass the 24h block.
  - Customer inbound reply updates `lastMessageAt`, immediately reopening the 24h window for free-form responses.
- **Human-in-the-Loop AI Guard**: AI suggested replies are saved with `status: PENDING_APPROVAL` and `isAiGenerated: true`. Outbound transmission is strictly blocked until an owner explicitly approves via `/api/whatsapp/approve-draft`.

#### E. Payments & Cryptographic Signatures
- **Server-Side Amount Calculation**: Payment orders (`/api/payments/razorpay/order`) recalculate amount server-side from invoice rows in DB. Client-submitted amounts are never trusted.
- **Order-to-Invoice Binding**: Verification rejects orders where invoice IDs mismatch or where payments belong to another tenant.
- **Timing-Safe HMAC Verification**: Signature verification uses `crypto.timingSafeEqual` over HMAC-SHA256 (`order_id + "|" + payment_id`). Tampered signatures return HTTP 400 (`INVALID_SIGNATURE`) and mark payment as `FAILED`.
- **Payment Replay Defense**: Re-verifying an already processed order or reusing a processed payment ID returns HTTP 409 (`PAYMENT_REPLAY_DETECTED`).
- **Raw Body Webhook Idempotency**: Razorpay webhook processes `payment.captured` on raw request buffer, records payment atomically, settles invoice to `PAID`, and ignores duplicate webhook deliveries idempotently.

#### F. AI Quotation Safety (Gemini)
- **Zod Schema Validation**: Gemini JSON output is parsed and validated using strict Zod schemas. Malformed or non-JSON model output triggers structured fallback (`MALFORMED_JSON`).
- **Catalog Price Grounding**: Replaces any hallucinated line item prices with real prices from the tenant's `Service` database catalog.
- **Uncataloged Flagging**: Any line item not present in the business catalog is flagged (`isCatalogItem: false`, `unitPrice: 0`), and a human review warning is appended.
- **Prompt Injection Defense**: Sanitizes customer inputs by stripping known jailbreaks and role-override triggers before prompt assembly.

#### G. GST Compliance & Invoicing
- **15-Digit GSTIN & State Code Extraction**: Validates statutory GSTIN regex and extracts state codes (01 to 38).
- **Non-GST Registered Mode**: When `isGstRegistered: false`, businesses issue `BILL_OF_SUPPLY` with 0% tax, no tax lines, and `totalAmount == subtotal`.
- **Per-Line GST Slabs**: Supports itemized GST rates (0%, 5%, 12%, 18%, 28%) with exact integer paise math. Tested invoice with 5%, 18%, and 28% items produced exact subtotal (₹3,500), CGST (₹275), SGST (₹275), and total (₹4,050).
- **Intra-State vs Inter-State Tax Split**: Deterministically computes CGST + SGST for Intra-State supply versus IGST for Inter-State supply based on Place of Supply.
- **Monotonic Sequential Numbering**: Generates sequential numbers per financial year (`INV/2026-27/0001`) via atomic counter reservation in `InvoiceSequence`.
- **Concurrency Test on Invoices**: 20 parallel concurrent invoice creations produced 20 contiguous sequence numbers (0005 to 0024) with zero duplicates.

#### H. Data Protection, Audit Log & DPDP Compliance
- **Database Trigger Append-Only Audit Log**: SQLite triggers `prevent_activity_log_update` and `prevent_activity_log_delete` abort any raw SQL or ORM attempt to update or delete `ActivityLog` rows. Grep confirms zero mutation code paths in `src/`.
- **DPDP Act Customer Dossier Export**: `GET /api/customers/[id]/export` returns full JSON data dossier with `Content-Disposition`.
- **DPDP Right to Erasure & Tax Anonymization**: `DELETE /api/customers/[id]` scrubs PII (name to "Anonymized Customer", email/phone/address cleared, chat text redacted) while preserving financial invoice records under Section 36 of CGST Act (72-month statutory retention).
- **AES-256-GCM Credential Encryption**: Integration keys stored encrypted at rest with `enc:v1:<iv>:<tag>:<ciphertext>` and decrypted in memory only during API execution.
- **Rate Limiting Anti-Spoofing**: Edge middleware derives client IP from rightmost proxy hop, Cloudflare `cf-connecting-ip`, or direct TCP socket, completely defeating client-injected leftmost `X-Forwarded-For` spoofing.

---

## 2. DONE BUT UNTESTED (With Exact Requirements to Test)

Per hostile audit rules, any feature requiring external proprietary platforms or paid API credentials that were not connected during this local audit is cataloged below with the exact steps required to test:

### 1. Live Meta WhatsApp Outbound Transmission
- **Status**: **UNTESTED** against live Meta Graph API endpoints (`https://graph.facebook.com/v21.0/...`).
- **What is verified locally**: Webhook verify token handshake, HMAC-SHA256 signature verification on raw body, message deduplication by `wamid`, customer auto-creation, draft approval state machine, 24-hour customer service window enforcement, 428 unconnected status.
- **What is needed to test live**:
  1. Active Meta Developer Account with a WhatsApp Business App.
  2. Registered WhatsApp Business Account (WABA) with verified phone number.
  3. System User Permanent Access Token with `whatsapp_business_messaging` permission.
  4. Pre-approved Meta Message Templates for sending messages outside the 24-hour customer care window.

### 2. Live Razorpay Banking Settlement Rails
- **Status**: **UNTESTED** against live Indian banking rails (NPCI UPI / Visa / Mastercard networks).
- **What is verified locally**: Server-side amount computation, order binding, replay protection, HMAC signature verification, webhook processing, 30-day plan extension, idempotency.
- **What is needed to test live**:
  1. Activated Razorpay Merchant Account with completed business KYC.
  2. Live API keys (`rzp_live_...`) and live Webhook Secret.
  3. Real UPI app or test card authorization on Razorpay checkout modal.

### 3. Live Google Gemini API Outbound Calls
- **Status**: **UNTESTED** against live Google Generative AI endpoints.
- **What is verified locally**: Zod schema validation, malformed JSON recovery, catalog price grounding, uncataloged item flagging, prompt injection sanitization, missing API key 428 status.
- **What is needed to test live**:
  1. Valid `GEMINI_API_KEY` from Google AI Studio.
  2. Network connectivity from production host to `generativelanguage.googleapis.com`.

### 4. PostgreSQL Live Database Execution
- **Status**: **UNTESTED** against live PostgreSQL engine instance.
- **What is verified locally**: Complete PostgreSQL DDL migration authored in `prisma/migrations_postgres/0001_init/migration.sql`, featuring `CREATE EXTENSION IF NOT EXISTS "btree_gist"`, GiST range exclusion constraint (`no_double_booking_per_business` on `tstzrange`), and PostgreSQL trigger functions for `ActivityLog` immutability.
- **What is needed to test live**:
  1. Running PostgreSQL instance (version 14+) with superuser privilege to enable `btree_gist`.
  2. Valid connection string in `DATABASE_URL` (e.g., `postgresql://postgres:password@localhost:5432/businessos`).
  3. Run `npx prisma db push --schema=prisma/schema.postgresql.prisma` and execute the 8 test suites.

---

## 3. NOT DONE / KNOWN LIMITS

1. **In-Memory Rate Limiter Scope**: The token bucket rate limiter runs in Node.js process memory. In a multi-instance or serverless cluster without sticky sessions, each instance maintains its own bucket. For distributed deployments across multiple containers, an external shared memory store (such as Redis or Upstash) is required.
2. **SQLite Write Serialization**: In local SQLite mode, concurrent writes are serialized at the file lock level. Under extreme write concurrency (e.g., hundreds of simultaneous writes per second), SQLite will return busy errors. For high-throughput multi-tenant production deployments, the PostgreSQL schema authored in Phase 8 should be used.
3. **Razorpay Recurring Mandates**: As specified in the audit rules, all subscription plans are strictly modeled as one-time 30-day purchases. Automatic recurring debits (e-mandates via Razorpay Subscriptions API) are not implemented.

---

## 4. BUILD & VERIFICATION EVIDENCE

### 1. TypeScript Compilation (`npx tsc --noEmit`)
```
Command exited with code 0.
No output from the command (0 type errors).
```

### 2. ESLint Check (`npm run lint`)
```
> businessos-ai@1.0.0 lint
> next lint

./src/app/appointments/page.tsx
83:6  Warning: React Hook useEffect has a missing dependency: 'fetchData'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./src/app/quotations/page.tsx
83:6  Warning: React Hook useEffect has a missing dependency: 'fetchData'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

info  - Need to disable some ESLint rules? Learn more here: https://nextjs.org/docs/basic-features/eslint#disabling-rules

Command exited with code 0 (0 errors).
```

### 3. Next.js Production Build (`npm run build`)
```
> businessos-ai@1.0.0 build
> next build

  ▲ Next.js 14.2.23
  - Environments: .env

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (25/25) ...
 ✓ Generating static pages (25/25)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                  Size     First Load JS
┌ ○ /                                        5.17 kB         106 kB
├ ○ /_not-found                              873 B          88.1 kB
├ ƒ /api/ai/draft-reply                      0 B                0 B
├ ƒ /api/ai/generate-quote                   0 B                0 B
├ ƒ /api/ai/insights                         0 B                0 B
├ ƒ /api/appointments                        0 B                0 B
├ ƒ /api/appointments/[id]                   0 B                0 B
├ ƒ /api/appointments/available-slots        0 B                0 B
├ ƒ /api/auth/login                          0 B                0 B
├ ƒ /api/auth/logout                         0 B                0 B
├ ƒ /api/auth/me                             0 B                0 B
├ ƒ /api/auth/signup                         0 B                0 B
├ ƒ /api/book/[slug]                         0 B                0 B
├ ƒ /api/customers                           0 B                0 B
├ ƒ /api/customers/[id]                      0 B                0 B
├ ƒ /api/customers/[id]/export               0 B                0 B
├ ƒ /api/dashboard/metrics                   0 B                0 B
├ ƒ /api/integrations/status                 0 B                0 B
├ ƒ /api/invoices                            0 B                0 B
├ ƒ /api/invoices/[id]                       0 B                0 B
├ ƒ /api/invoices/[id]/pdf                   0 B                0 B
├ ƒ /api/payments/razorpay/order             0 B                0 B
├ ƒ /api/payments/razorpay/verify            0 B                0 B
├ ƒ /api/payments/razorpay/webhook           0 B                0 B
├ ƒ /api/quotations                          0 B                0 B
├ ƒ /api/quotations/[id]                     0 B                0 B
├ ƒ /api/quotations/[id]/convert-to-invoice  0 B                0 B
├ ƒ /api/quotations/[id]/pdf                 0 B                0 B
├ ƒ /api/services                            0 B                0 B
├ ƒ /api/services/[id]                       0 B                0 B
├ ƒ /api/whatsapp/approve-draft              0 B                0 B
├ ƒ /api/whatsapp/messages                   0 B                0 B
├ ƒ /api/whatsapp/webhook                    0 B                0 B
├ ○ /appointments                            4.72 kB        99.1 kB
├ ○ /billing                                 134 kB          229 kB
├ ƒ /book/[slug]                             4.17 kB        98.6 kB
├ ○ /customers                               3.8 kB         97.8 kB
├ ○ /login                                   2.34 kB        96.3 kB
├ ○ /privacy                                 173 B          94.2 kB
├ ○ /quotations                              5.72 kB         100 kB
├ ○ /settings/integrations                   5.08 kB        92.3 kB
├ ○ /signup                                  2.51 kB        96.5 kB
└ ○ /whatsapp                                4.81 kB         106 kB
+ First Load JS shared by all                87.2 kB
  ├ chunks/117-7abafe24123feb5a.js           31.6 kB
  ├ chunks/fd9d1056-0807e69ea9c303ac.js      53.6 kB
  └ other shared chunks (total)              1.95 kB

ƒ Middleware                                 32.4 kB
○ (Static)   prerendered as static content
ƒ (Dynamic)  server-rendered on demand

Command exited with code 0.
```

### 4. Master Automated Test Suite Execution (`node scripts/run-all-tests.js`)
```
==========================================================================
      RUNNING COMPLETE BUSINESSOS AI AUTOMATED VERIFICATION SUITE
==========================================================================

>>> EXECUTING: Phase 1: Auth & Multi-Tenancy (scripts/test-phase1.js) <<<
PHASE 1 AUDIT RESULTS: 48 PASSED, 0 FAILED (TOTAL: 48)

>>> EXECUTING: Phase 2: Double-Booking & Timezones (scripts/test-phase2.js) <<<
PHASE 2 AUDIT RESULTS: 16 PASSED, 0 FAILED (TOTAL: 16)

>>> EXECUTING: Phase 3: Razorpay Payments (scripts/test-phase3.js) <<<
PHASE 3 AUDIT RESULTS: 24 PASSED, 0 FAILED (TOTAL: 24)

>>> EXECUTING: Phase 4: WhatsApp Meta Cloud API (scripts/test-phase4.js) <<<
PHASE 4 AUDIT RESULTS: 20 PASSED, 0 FAILED (TOTAL: 20)

>>> EXECUTING: Phase 5: AI Gemini Quote Generation (scripts/test-phase5.js) <<<
PHASE 5 AUDIT RESULTS: 12 PASSED, 0 FAILED (TOTAL: 12)

>>> EXECUTING: Phase 6: GST & Monotonic Invoices (scripts/test-phase6.js) <<<
PHASE 6 AUDIT RESULTS: 25 PASSED, 0 FAILED (TOTAL: 25)

>>> EXECUTING: Phase 7: Data, Audit & Compliance (scripts/test-phase7.js) <<<
PHASE 7 AUDIT RESULTS: 17 PASSED, 0 FAILED (TOTAL: 17)

>>> EXECUTING: Phase 8: Hardened Gaps & Concurrency (scripts/test-phase8-hardened.js) <<<
PHASE 8 HARDENED AUDIT RESULTS: 35 PASSED, 0 FAILED (TOTAL: 35)

==========================================================================
ALL 8 / 8 TEST SUITES PASSED WITH 100% SUCCESS (197 / 197 TESTS)!
==========================================================================
```
