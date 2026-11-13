const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const { SignJWT } = require("jose");
const { encryptSecret, decryptSecret, isEncrypted } = require("./dist/encryption");

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const AUTH_SECRET = process.env.AUTH_SECRET || "c8e4d3a1f9b2576081e2479c3d5e6a8f10b29c48731e5069a7c3b81d0f24e689";

let passCount = 0;
let failCount = 0;
const results = [];

function recordResult(testGroup, testName, expected, actual, pass) {
  if (pass) {
    passCount++;
    results.push({ testGroup, testName, expected, actual, status: "PASS" });
    console.log(`[PASS] [${testGroup}] ${testName} (Actual: ${actual})`);
  } else {
    failCount++;
    results.push({ testGroup, testName, expected, actual, status: "FAIL" });
    console.error(`[FAIL] [${testGroup}] ${testName} (Expected: ${expected}, Got: ${actual})`);
  }
}

async function createTestJwt(userId, businessId, email) {
  const secretKey = new TextEncoder().encode(AUTH_SECRET.trim());
  return await new SignJWT({ userId, businessId, email, role: "OWNER" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secretKey);
}

async function setupPhase7Data() {
  const runId = Date.now();
  console.log(`Setting up Phase 7 isolated test tenants (runId: ${runId})...`);

  const hash = await bcrypt.hash("PasswordAudit123!", 10);

  const bizAlpha = await prisma.business.create({
    data: {
      name: "Alpha Compliance Corp",
      slug: `audit-tenant-alpha-${runId}`,
      currency: "INR",
      timezone: "Asia/Kolkata",
      gstin: "27AABCU9603R1ZX",
      state: "Maharashtra",
      users: {
        create: {
          email: `audit-alpha-${runId}@test.com`,
          name: "Compliance Officer",
          passwordHash: hash,
          role: "OWNER",
        },
      },
      services: {
        create: [
          {
            name: "DPDP Readiness Audit",
            durationMinutes: 60,
            price: 25000,
            hsnSac: "998314",
          },
        ],
      },
    },
    include: {
      users: true,
      services: true,
    },
  });

  const bizBeta = await prisma.business.create({
    data: {
      name: "Beta Security Ltd",
      slug: `audit-tenant-beta-${runId}`,
      currency: "INR",
      timezone: "Asia/Kolkata",
      users: {
        create: {
          email: `audit-beta-${runId}@test.com`,
          name: "Beta Admin",
          passwordHash: hash,
          role: "OWNER",
        },
      },
    },
    include: {
      users: true,
    },
  });

  const tokenAlpha = await createTestJwt(bizAlpha.users[0].id, bizAlpha.id, bizAlpha.users[0].email);
  const tokenBeta = await createTestJwt(bizBeta.users[0].id, bizBeta.id, bizBeta.users[0].email);

  return {
    bizAlpha,
    bizBeta,
    tokenAlpha,
    tokenBeta,
  };
}

async function runPhase7Suite() {
  const t = await setupPhase7Data();

  console.log("\n==========================================================================");
  console.log("  HOSTILE SECURITY AUDIT: PHASE 7 DATA, AUDIT & COMPLIANCE VERIFICATION");
  console.log("==========================================================================\n");

  // -------------------------------------------------------------------
  // REQUIREMENT 1: Audit Log Append-Only DB Constraints & Grep Proof
  // -------------------------------------------------------------------
  console.log(">>> [REQ 1] Testing Append-Only Audit Log Invariants & DB Triggers <<<");

  // Create a test activity log entry
  const testLog = await prisma.activityLog.create({
    data: {
      businessId: t.bizAlpha.id,
      action: "AUDIT_VERIFY_START",
      entityType: "SYSTEM",
      entityId: "phase7_init",
      description: "Initial audit verification log entry",
    },
  });

  // 1.1: Direct database UPDATE is aborted by SQLite trigger
  let updateBlocked = false;
  let updateErrorMsg = "";
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE ActivityLog SET description = 'TAMPERED_LOG' WHERE id = '${testLog.id}'`
    );
  } catch (err) {
    updateBlocked = true;
    updateErrorMsg = err.message;
  }
  recordResult(
    "REQ 1: Append-Only DB Trigger",
    "Database trigger aborts direct raw SQL UPDATE on ActivityLog",
    true,
    updateBlocked,
    updateBlocked && updateErrorMsg.includes("append-only and cannot be updated")
  );

  // 1.2: Direct database DELETE is aborted by SQLite trigger
  let deleteBlocked = false;
  let deleteErrorMsg = "";
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM ActivityLog WHERE id = '${testLog.id}'`
    );
  } catch (err) {
    deleteBlocked = true;
    deleteErrorMsg = err.message;
  }
  recordResult(
    "REQ 1: Append-Only DB Trigger",
    "Database trigger aborts direct raw SQL DELETE on ActivityLog",
    true,
    deleteBlocked,
    deleteBlocked && deleteErrorMsg.includes("append-only and cannot be deleted")
  );

  // 1.3: Codebase scan: Prove zero update/delete calls on activityLog in src/
  function scanDirForPatterns(dir, pattern) {
    let matches = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        matches = matches.concat(scanDirForPatterns(fullPath, pattern));
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, "utf8");
        if (pattern.test(content)) {
          matches.push(fullPath);
        }
      }
    }
    return matches;
  }

  const mutatingCalls = scanDirForPatterns(
    path.join(__dirname, "../src"),
    /activityLog\.(update|updateMany|delete|deleteMany)\s*\(/
  );
  recordResult(
    "REQ 1: Codebase Grep Proof",
    "Zero update or delete call paths on activityLog in entire src/ tree",
    0,
    mutatingCalls.length,
    mutatingCalls.length === 0
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 2: DPDP Act (Data Portability Export & Anonymization)
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 2] Testing India DPDP Act Customer Export & Anonymization <<<");

  // Create a customer with invoice, appointment, and messages for Alpha
  const custWithInv = await prisma.customer.create({
    data: {
      businessId: t.bizAlpha.id,
      name: "Vikram Singhania",
      email: "vikram@singhaniagroup.com",
      phone: "+919876500001",
      company: "Singhania Enterprises",
      address: "Nariman Point",
      city: "Mumbai",
      state: "Maharashtra",
      gstin: "27AABCU9603R1ZX",
      notes: "VIP Client for corporate restructuring",
      conversations: {
        create: {
          businessId: t.bizAlpha.id,
          channel: "WHATSAPP",
          messages: {
            create: [
              {
                businessId: t.bizAlpha.id,
                direction: "INBOUND",
                senderType: "CUSTOMER",
                body: "Please send our corporate audit quote immediately.",
                status: "DELIVERED",
              },
            ],
          },
        },
      },
    },
  });

  // Create an invoice for this customer
  const custInvoice = await prisma.invoice.create({
    data: {
      businessId: t.bizAlpha.id,
      customerId: custWithInv.id,
      invoiceNumber: "INV/2026-27/9991",
      financialYear: "2026-27",
      sequenceNumber: 9991,
      status: "ISSUED",
      dueDate: new Date(),
      subtotal: 25000,
      taxAmount: 4500,
      totalAmount: 29500,
      placeOfSupply: "Maharashtra",
      items: {
        create: [
          {
            description: "DPDP Readiness Audit",
            hsnSac: "998314",
            quantity: 1,
            unitPrice: 25000,
            amount: 25000,
          },
        ],
      },
    },
  });

  // 2.1: Data Export endpoint unauthenticated returns HTTP 401
  const unauthExportRes = await fetch(`${BASE_URL}/api/customers/${custWithInv.id}/export`);
  recordResult(
    "REQ 2: Data Export Auth Guard",
    "GET /api/customers/:id/export without auth returns HTTP 401",
    401,
    unauthExportRes.status,
    unauthExportRes.status === 401
  );

  // 2.2: Cross-tenant IDOR export attempt by Beta returns HTTP 404
  const idorExportRes = await fetch(`${BASE_URL}/api/customers/${custWithInv.id}/export`, {
    headers: { Authorization: `Bearer ${t.tokenBeta}` },
  });
  recordResult(
    "REQ 2: Data Export Tenant Isolation",
    "GET /api/customers/:id/export from foreign tenant returns HTTP 404",
    404,
    idorExportRes.status,
    idorExportRes.status === 404
  );

  // 2.3: Authenticated export returns full customer dossier
  const exportRes = await fetch(`${BASE_URL}/api/customers/${custWithInv.id}/export`, {
    headers: { Authorization: `Bearer ${t.tokenAlpha}` },
  });
  const exportJson = await exportRes.json();
  const contentDisp = exportRes.headers.get("content-disposition");

  recordResult(
    "REQ 2: Data Portability Export",
    "GET /api/customers/:id/export returns 200 with complete customer profile & financial history",
    true,
    exportRes.status === 200 &&
      contentDisp?.includes("customer-export-") &&
      exportJson.customerProfile?.name === "Vikram Singhania" &&
      exportJson.financialRecords?.invoices?.length === 1,
    exportRes.status === 200 &&
      contentDisp?.includes("customer-export-") &&
      exportJson.customerProfile?.name === "Vikram Singhania" &&
      exportJson.financialRecords?.invoices?.length === 1
  );

  // 2.4: Erasure of customer with statutory invoices triggers compliant Anonymization
  const anonDeleteRes = await fetch(`${BASE_URL}/api/customers/${custWithInv.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${t.tokenAlpha}` },
  });
  const anonDeleteJson = await anonDeleteRes.json();

  recordResult(
    "REQ 2: DPDP Erasure & Anonymization",
    "DELETE on customer with tax invoices returns anonymized: true (preserves tax records)",
    true,
    anonDeleteJson.anonymized,
    anonDeleteRes.status === 200 && anonDeleteJson.anonymized === true
  );

  // 2.5: Verify customer PII scrubbed in DB
  const scrubbedCustomer = await prisma.customer.findUnique({
    where: { id: custWithInv.id },
  });
  recordResult(
    "REQ 2: PII Scrubbing",
    "Customer PII scrubbed: name is 'Anonymized Customer' and email/gstin/address are null",
    true,
    scrubbedCustomer?.name === "Anonymized Customer" &&
      scrubbedCustomer?.email === null &&
      scrubbedCustomer?.gstin === null &&
      scrubbedCustomer?.address === null,
    scrubbedCustomer?.name === "Anonymized Customer" &&
      scrubbedCustomer?.email === null &&
      scrubbedCustomer?.gstin === null &&
      scrubbedCustomer?.address === null
  );

  // 2.6: Verify communication messages scrubbed in DB
  const scrubbedConvo = await prisma.conversation.findFirst({
    where: { customerId: custWithInv.id },
    include: { messages: true },
  });
  recordResult(
    "REQ 2: Message Scrubbing",
    "Communication messages scrubbed to '[Redacted under DPDP data erasure request]'",
    true,
    scrubbedConvo?.messages?.[0]?.body?.includes("Redacted under DPDP"),
    scrubbedConvo?.messages?.[0]?.body?.includes("Redacted under DPDP")
  );

  // 2.7: Customer WITHOUT invoices is hard deleted cleanly
  const ephemeralCust = await prisma.customer.create({
    data: {
      businessId: t.bizAlpha.id,
      name: "Temporary Lead",
      phone: "+919876500009",
    },
  });
  const hardDeleteRes = await fetch(`${BASE_URL}/api/customers/${ephemeralCust.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${t.tokenAlpha}` },
  });
  const hardDeleteJson = await hardDeleteRes.json();
  const deletedInDb = await prisma.customer.findUnique({
    where: { id: ephemeralCust.id },
  });

  recordResult(
    "REQ 2: DPDP Hard Deletion",
    "Customer without invoices is completely erased (deleted: true, DB record null)",
    "deleted: true / inDb: null",
    `deleted: ${hardDeleteJson.deleted} / inDb: ${deletedInDb}`,
    hardDeleteRes.status === 200 && hardDeleteJson.deleted === true && deletedInDb === null
  );

  // 2.8: Privacy policy page accessible publicly without authentication
  const privacyRes = await fetch(`${BASE_URL}/privacy`);
  const privacyHtml = await privacyRes.text();
  recordResult(
    "REQ 2: Privacy Policy Page",
    "GET /privacy returns HTTP 200 and contains India DPDP Act 2023 disclosures",
    true,
    privacyRes.status === 200 && privacyHtml.includes("Digital Personal Data Protection Act"),
    privacyRes.status === 200 && privacyHtml.includes("Digital Personal Data Protection Act")
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 3: Secrets Protection & AES-256-GCM Credential Encryption
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 3] Testing Secrets Management & AES-256-GCM Credential Encryption <<<");

  // 3.1: Verify .env is listed in .gitignore
  const gitignoreContent = fs.readFileSync(path.join(__dirname, "../.gitignore"), "utf8");
  const hasEnvInGitignore = /^\.env$/m.test(gitignoreContent) || /^\.env\*/m.test(gitignoreContent);
  recordResult(
    "REQ 3: Git Secrets Guard",
    ".env is strictly registered in .gitignore",
    true,
    hasEnvInGitignore,
    hasEnvInGitignore === true
  );

  // 3.2: AES-256-GCM encryption function unit test
  const testSecret = "live_meta_access_token_super_secret_xyz123";
  const encrypted = encryptSecret(testSecret);
  const decrypted = decryptSecret(encrypted);

  recordResult(
    "REQ 3: Cryptographic Encryption",
    "encryptSecret produces enc:v1:<iv>:<tag>:<ciphertext> and decryptSecret recovers plaintext",
    true,
    isEncrypted(encrypted) && !encrypted.includes(testSecret) && decrypted === testSecret,
    isEncrypted(encrypted) && !encrypted.includes(testSecret) && decrypted === testSecret
  );

  // 3.3: Integration settings API encrypts stored credentials in database
  const saveCredsRes = await fetch(`${BASE_URL}/api/integrations/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      geminiApiKey: "AIzaSyD_TEST_SECRET_API_KEY_12345",
      metaAccessToken: "EAAB_META_ACCESS_TOKEN_SECRET_9999",
      razorpayKeyId: "rzp_test_1234567890",
      razorpayKeySecret: "RZP_SECRET_KEY_SECURE_9876",
    }),
  });
  recordResult(
    "REQ 3: Integration Credentials API",
    "POST /api/integrations/status accepts and saves integration credentials",
    200,
    saveCredsRes.status,
    saveCredsRes.status === 200
  );

  // 3.4: Verify in database that credentials are encrypted at rest
  const storedConfig = await prisma.integrationConfig.findUnique({
    where: { businessId: t.bizAlpha.id },
  });

  recordResult(
    "REQ 3: Encrypted at Rest",
    "IntegrationConfig table stores secrets encrypted with enc:v1: prefix (never plaintext in DB)",
    true,
    isEncrypted(storedConfig?.geminiApiKey) &&
      isEncrypted(storedConfig?.metaAccessToken) &&
      isEncrypted(storedConfig?.razorpayKeySecret) &&
      !storedConfig?.geminiApiKey?.includes("AIzaSyD_TEST_SECRET") &&
      !storedConfig?.razorpayKeySecret?.includes("RZP_SECRET_KEY"),
    isEncrypted(storedConfig?.geminiApiKey) &&
      isEncrypted(storedConfig?.metaAccessToken) &&
      isEncrypted(storedConfig?.razorpayKeySecret) &&
      !storedConfig?.geminiApiKey?.includes("AIzaSyD_TEST_SECRET") &&
      !storedConfig?.razorpayKeySecret?.includes("RZP_SECRET_KEY")
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 4: Rate Limiting on Public Endpoints
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 4] Testing Rate Limiting on Public Endpoints (DoS Prevention) <<<");

  // 4.1: Rapid authentication brute-force attempt (POST /api/auth/login)
  console.log("Firing 14 rapid consecutive requests to /api/auth/login from test IP...");
  const loginAttempts = [];
  for (let i = 0; i < 14; i++) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.195", // Simulated client IP
      },
      body: JSON.stringify({
        email: "nonexistent@test.com",
        password: "wrongpassword",
      }),
    });
    loginAttempts.push({
      status: res.status,
      headers: {
        retryAfter: res.headers.get("retry-after"),
        remaining: res.headers.get("x-ratelimit-remaining"),
      },
    });
  }

  const normalAttempts = loginAttempts.slice(0, 10);
  const throttledAttempts = loginAttempts.slice(10);

  const initialStatusOk = normalAttempts.every((r) => r.status === 401);
  const throttledStatus429 = throttledAttempts.every((r) => r.status === 429);

  recordResult(
    "REQ 4: Auth Rate Limiter",
    "First 10 login attempts processed (401), 11th through 14th attempts return HTTP 429",
    "10 allowed / 4 throttled (429)",
    `${normalAttempts.length} allowed / ${throttledAttempts.filter((r) => r.status === 429).length} throttled`,
    initialStatusOk && throttledStatus429 && Boolean(throttledAttempts[0].headers.retryAfter)
  );

  // 4.2: Rate limiter response headers contain standard Retry-After
  recordResult(
    "REQ 4: Rate Limiter Headers",
    "HTTP 429 response includes Retry-After header and X-RateLimit-Remaining: 0",
    true,
    throttledAttempts[0].headers.remaining === "0" && Number(throttledAttempts[0].headers.retryAfter) > 0,
    throttledAttempts[0].headers.remaining === "0" && Number(throttledAttempts[0].headers.retryAfter) > 0
  );

  // Note: ActivityLog rows are immutable by DB triggers, so test businesses with logs are preserved as immutable audit trails.

  await prisma.$disconnect();

  // Summary
  console.log("\n==========================================================================");
  console.log(`PHASE 7 AUDIT RESULTS: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
  console.log("==========================================================================\n");

  if (failCount > 0) {
    console.error(`FAILURE: ${failCount} tests failed in Phase 7 suite.`);
    process.exit(1);
  } else {
    console.log("ALL TESTS IN PHASE 7 DATA, AUDIT & COMPLIANCE SUITE PASSED WITH 100% SUCCESS!");
  }
}

runPhase7Suite().catch((err) => {
  console.error("Test execution threw fatal error:", err);
  process.exit(1);
});
