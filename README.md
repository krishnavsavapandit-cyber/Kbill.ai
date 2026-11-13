# BusinessOS AI

BusinessOS AI is an audited, multi-tenant business management and operating system designed for service businesses and independent professionals in India. It unifies appointment scheduling, GST-compliant invoicing, Razorpay payments, customer CRM, and Meta WhatsApp Cloud API messaging into a single platform.

Every architectural invariant in this codebase has been subjected to a zero-trust hostile security audit and verified through an automated 162-test verification suite.

---

## Audited Architectural Capabilities

- **Multi-Tenancy & Authorization**: Single-tenant data isolation enforced by `requireBusiness()` helper on every route. Body-based IDOR defense, whitelist query scoping, and unauthenticated redirects to `/login`.
- **Concurrency-Safe Booking**: Database-enforced partial unique slot indexes on appointments with UTC ISO-8601 storage and Asia/Kolkata timezone translation. Proven safe against 20 simultaneous parallel race-condition requests.
- **Cryptographic Payments (Razorpay)**: Server-side amount computation from DB invoice rows, order-to-invoice binding, payment replay rejection, timing-safe HMAC signature verification on raw request buffers, and idempotent webhook settlement.
- **WhatsApp Cloud API (Meta)**: Webhook verify token handshake, timing-safe HMAC-SHA256 signature verification on raw body, message deduplication by Meta `wamid`, customer auto-creation, and human-in-the-loop AI reply draft approval flow.
- **AI Quotation Safety (Google Gemini)**: Zod schema validation, service catalog grounding with enforced database pricing, uncataloged item flagging, and prompt injection sanitization.
- **Indian GST Compliance**: 15-character GSTIN validation, automatic state code extraction (01-38), HSN/SAC code validation, intra-state (9% CGST + 9% SGST) vs inter-state (18% IGST) tax split based on Place of Supply, and monotonic sequential invoice numbering per financial year (`INV/2026-27/0001`).
- **Data Protection & DPDP Act 2023**: Database trigger append-only audit log on `ActivityLog`, customer data dossier export, and customer PII anonymization preserving statutory 72-month GST tax invoice records.
- **Security & Secrets**: Sliding-window rate limiting on public endpoints (`/api/auth/*`, webhooks, booking) and AES-256-GCM symmetric encryption at rest for third-party API credentials (`enc:v1:<iv>:<tag>:<ciphertext>`).

For detailed audit proof and test logs, see [AUDIT.md](./AUDIT.md).

---

## Tech Stack

- **Framework**: Next.js 14.2 (App Router, React 18, TypeScript 5.7)
- **Styling**: Tailwind CSS 3.4, Lucide React
- **Database & ORM**: Prisma ORM 5.22
  - Local / Testing: SQLite (`file:./dev.db`) in WAL mode
  - Production: PostgreSQL 14+ (`prisma/schema.postgresql.prisma`)
- **Authentication**: JWT sessions with `jose`, password hashing with `bcryptjs`
- **PDF Generation**: `jspdf`

---

## Quick Start (Local Run)

### 1. Prerequisites
- Node.js 18.x, 20.x, or 22+
- npm 9+

### 2. Installation & Setup
```bash
# Clone the repository
git clone <repo-url>
cd businessos-ai

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Push Prisma schema to local database
npm run db:push

# (Optional) Seed demo data for testing
npm run seed:demo
```

### 3. Running the Test Suite
```bash
# Run the complete 162-test hostile verification suite
npm test
```

### 4. Starting the Application
```bash
# Development server
npm run dev

# Production build and run
npm run build
npm start
```
The application will be accessible at `http://localhost:3000`.

---

## Production Deployment Checklist (HTTPS Host)

When deploying to production (e.g. Vercel, Railway, Render, AWS, or VPS), complete the following steps:

### 1. Mandatory Environment Variables

Configure these in your production environment settings (never commit `.env`):

| Variable | Description | Example / Note |
|---|---|---|
| `NODE_ENV` | Runtime environment | `production` |
| `DATABASE_URL` | Database connection string | `postgresql://user:pass@host:5432/dbname` (or `file:./prod.db`) |
| `NEXT_PUBLIC_APP_URL` | Canonical public HTTPS URL | `https://app.yourbusinessos.com` |
| `AUTH_SECRET` | Strong session secret (>= 32 chars) | Generate via `openssl rand -hex 32` |
| `GEMINI_API_KEY` | (Optional) Platform Gemini API Key | `AIzaSy...` (from Google AI Studio) |
| `META_WA_APP_SECRET` | Meta App Secret for webhooks | From Meta Developer App Dashboard |
| `META_WA_WEBHOOK_VERIFY_TOKEN` | Webhook verification handshake token | Custom secure string (e.g. `biz_wh_prod_99`) |
| `RAZORPAY_KEY_ID` | Platform Razorpay Key ID | `rzp_live_...` (or `rzp_test_...`) |
| `RAZORPAY_KEY_SECRET` | Platform Razorpay Secret | From Razorpay API Keys dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | Secret for Razorpay webhook HMAC | Configured in Razorpay Webhook settings |

### 2. PostgreSQL Production Migration

To deploy on PostgreSQL (Supabase, AWS RDS, Neon, Cloud SQL):
1. Point `DATABASE_URL` to your PostgreSQL database.
2. Execute the included production migration:
   ```bash
   # Deploy PostgreSQL schema and GiST range exclusion constraints
   npx prisma db execute --file prisma/migrations_postgres/0001_init/migration.sql --schema prisma/schema.postgresql.prisma
   ```

### 3. Webhook Registration Guide

#### A. Meta WhatsApp Cloud API Webhook
1. Go to **Meta Developer Portal** &rarr; Your App &rarr; **WhatsApp** &rarr; **Configuration**.
2. Click **Edit** under **Callback URL**:
   - **Callback URL**: `https://your-domain.com/api/whatsapp/webhook`
   - **Verify Token**: Same value as `META_WA_WEBHOOK_VERIFY_TOKEN` (or per-tenant token in Settings).
3. Under **Webhook Fields**, subscribe to:
   - `messages` (inbound WhatsApp chats)
   - `message_template_status_update` (template approvals)
4. **Testing in Test Mode**:
   - Meta provides a test phone number in the Developer Portal.
   - Send a WhatsApp message to the test number from your authorized test phone.
   - Verify that the message appears in `/whatsapp` dashboard.

#### B. Razorpay Payment Gateway Webhook
1. Go to **Razorpay Dashboard** &rarr; **Settings** &rarr; **Webhooks** &rarr; **Add New Webhook**.
2. Fill in the webhook parameters:
   - **Webhook URL**: `https://your-domain.com/api/payments/razorpay/webhook`
   - **Secret**: Set a random secret and copy it into `RAZORPAY_WEBHOOK_SECRET`.
   - **Active Events**: Check `payment.captured` and `payment.failed`.
3. **Testing in Test Mode**:
   - In Razorpay Dashboard, toggle **Test Mode** (orange badge).
   - Generate an invoice in BusinessOS AI and click **Pay via Razorpay**.
   - Complete payment with Razorpay Test UPI or card.
   - Verify that invoice status updates to `PAID` automatically upon webhook delivery.

---

## License

Private and proprietary. Built for small business and service professionals.
