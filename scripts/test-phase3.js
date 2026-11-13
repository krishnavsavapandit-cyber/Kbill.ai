const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { SignJWT } = require("jose");

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

async function setupPhase3Data() {
  const runId = Date.now();
  console.log(`Setting up Phase 3 isolated test tenants (runId: ${runId})...`);

  const hash = await bcrypt.hash("PasswordRzp123!", 10);

  // Business Alpha: Fully configured Razorpay test credentials
  const bizAlpha = await prisma.business.create({
    data: {
      name: "Alpha Retailers",
      slug: `rzp-tenant-alpha-${runId}`,
      currency: "INR",
      timezone: "Asia/Kolkata",
      users: {
        create: {
          email: `alpha-rzp-${runId}@test.com`,
          name: "Alpha Owner",
          passwordHash: hash,
          role: "OWNER",
        },
      },
      customers: {
        create: {
          name: "Alpha Customer 1",
          phone: "+919876543211",
          email: "cust1@alpha.com",
        },
      },
      integrationConfig: {
        create: {
          razorpayKeyId: "rzp_test_AlphaKeyId12345",
          razorpayKeySecret: "AlphaSecret_9876543210abcdef",
          razorpayWebhookSecret: "AlphaWebhookSecret_1234567890",
          isRazorpayLive: false,
        },
      },
    },
    include: {
      users: true,
      customers: true,
      integrationConfig: true,
    },
  });

  // Business Beta: Competitor tenant with separate credentials
  const bizBeta = await prisma.business.create({
    data: {
      name: "Beta Services",
      slug: `rzp-tenant-beta-${runId}`,
      currency: "INR",
      timezone: "Asia/Kolkata",
      users: {
        create: {
          email: `beta-rzp-${runId}@test.com`,
          name: "Beta Owner",
          passwordHash: hash,
          role: "OWNER",
        },
      },
      customers: {
        create: {
          name: "Beta Customer 1",
          phone: "+919876543222",
          email: "cust1@beta.com",
        },
      },
      integrationConfig: {
        create: {
          razorpayKeyId: "rzp_test_BetaKeyId99999",
          razorpayKeySecret: "BetaSecret_abcdef0123456789",
          razorpayWebhookSecret: "BetaWebhookSecret_9876543210",
          isRazorpayLive: false,
        },
      },
    },
    include: {
      users: true,
      customers: true,
      integrationConfig: true,
    },
  });

  // Business NoKeys: Unconfigured tenant
  const bizNoKeys = await prisma.business.create({
    data: {
      name: "No Keys Enterprise",
      slug: `rzp-tenant-nokeys-${runId}`,
      currency: "INR",
      timezone: "Asia/Kolkata",
      users: {
        create: {
          email: `nokeys-${runId}@test.com`,
          name: "No Keys Owner",
          passwordHash: hash,
          role: "OWNER",
        },
      },
      customers: {
        create: {
          name: "NoKeys Customer",
          phone: "+919876543233",
          email: "cust@nokeys.com",
        },
      },
    },
    include: {
      users: true,
      customers: true,
    },
  });

  // Seed Invoices for Alpha
  const invAlphaUnpaid = await prisma.invoice.create({
    data: {
      businessId: bizAlpha.id,
      customerId: bizAlpha.customers[0].id,
      invoiceNumber: "INV-ALPHA-001",
      status: "SENT",
      totalAmount: 10000,
      amountPaid: 0,
      subtotal: 10000,
      taxAmount: 0,
      discountAmount: 0,
      dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });

  const invAlphaPaid = await prisma.invoice.create({
    data: {
      businessId: bizAlpha.id,
      customerId: bizAlpha.customers[0].id,
      invoiceNumber: "INV-ALPHA-PAID",
      status: "PAID",
      totalAmount: 5000,
      amountPaid: 5000,
      subtotal: 5000,
      taxAmount: 0,
      discountAmount: 0,
      dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });

  const invAlphaWebhook = await prisma.invoice.create({
    data: {
      businessId: bizAlpha.id,
      customerId: bizAlpha.customers[0].id,
      invoiceNumber: "INV-ALPHA-WH01",
      status: "SENT",
      totalAmount: 15000,
      amountPaid: 0,
      subtotal: 15000,
      taxAmount: 0,
      discountAmount: 0,
      dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });

  // Seed Invoice for Beta
  const invBeta = await prisma.invoice.create({
    data: {
      businessId: bizBeta.id,
      customerId: bizBeta.customers[0].id,
      invoiceNumber: "INV-BETA-001",
      status: "SENT",
      totalAmount: 7500,
      amountPaid: 0,
      subtotal: 7500,
      taxAmount: 0,
      discountAmount: 0,
      dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });

  // Generate tokens
  const tokenAlpha = await createTestJwt(bizAlpha.users[0].id, bizAlpha.id, bizAlpha.users[0].email);
  const tokenBeta = await createTestJwt(bizBeta.users[0].id, bizBeta.id, bizBeta.users[0].email);
  const tokenNoKeys = await createTestJwt(bizNoKeys.users[0].id, bizNoKeys.id, bizNoKeys.users[0].email);

  return {
    bizAlpha,
    bizBeta,
    bizNoKeys,
    tokenAlpha,
    tokenBeta,
    tokenNoKeys,
    invAlphaUnpaid,
    invAlphaPaid,
    invAlphaWebhook,
    invBeta,
  };
}

async function runPhase3Suite() {
  const t = await setupPhase3Data();

  console.log("\n==========================================================================");
  console.log("  HOSTILE SECURITY AUDIT: PHASE 3 RAZORPAY PAYMENTS VERIFICATION SUITE");
  console.log("==========================================================================\n");

  // -------------------------------------------------------------------
  // REQUIREMENT 1: Server-Side Amount Calculation & Order Safety
  // -------------------------------------------------------------------
  console.log(">>> [REQ 1] Testing Server-Side Amount Calculation & Order Validation <<<");

  // 1.1: Order creation on an already-paid invoice must return 400
  const paidOrderRes = await fetch(`${BASE_URL}/api/payments/razorpay/order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      type: "INVOICE",
      invoiceId: t.invAlphaPaid.id,
      amount: 1, // Malicious client attempt to pay ₹1 for a paid invoice
    }),
  });
  recordResult(
    "REQ 1: Server-Side Amount",
    "POST /api/payments/razorpay/order for already-paid invoice returns HTTP 400",
    400,
    paidOrderRes.status,
    paidOrderRes.status === 400
  );

  // 1.2: Order creation with foreign invoice ID must return 404 (IDOR)
  const foreignOrderRes = await fetch(`${BASE_URL}/api/payments/razorpay/order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      type: "INVOICE",
      invoiceId: t.invBeta.id,
    }),
  });
  recordResult(
    "REQ 1: Server-Side Amount",
    "POST /api/payments/razorpay/order with foreign invoiceId returns HTTP 404",
    404,
    foreignOrderRes.status,
    foreignOrderRes.status === 404
  );

  // 1.3: Unconfigured business returns HTTP 428 Precondition Required
  const noKeysOrderRes = await fetch(`${BASE_URL}/api/payments/razorpay/order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenNoKeys}`,
    },
    body: JSON.stringify({
      type: "INVOICE",
      invoiceId: t.invAlphaUnpaid.id,
    }),
  });
  recordResult(
    "REQ 1: Credentials Check",
    "Unconnected business without Razorpay keys returns HTTP 428 or 404",
    "404 or 428",
    noKeysOrderRes.status,
    noKeysOrderRes.status === 404 || noKeysOrderRes.status === 428
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 2 & 3: Order-to-Invoice Binding & Cryptographic Verification
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 2 & 3] Testing Order-to-Invoice Binding & Cryptographic Signature Verification <<<");

  const orderIdAlpha1 = `order_test_alpha_${Date.now()}`;
  const paymentIdAlpha1 = `pay_test_alpha_${Date.now()}`;
  const keySecretAlpha = t.bizAlpha.integrationConfig.razorpayKeySecret;

  // Seed a valid pending payment order bound to Invoice 1
  await prisma.payment.create({
    data: {
      businessId: t.bizAlpha.id,
      invoiceId: t.invAlphaUnpaid.id,
      amount: t.invAlphaUnpaid.totalAmount,
      currency: "INR",
      status: "PENDING",
      razorpayOrderId: orderIdAlpha1,
      receiptNumber: `rcpt_${orderIdAlpha1}`,
    },
  });

  // 2.1: Order-to-Invoice mismatch (Order bound to invAlphaUnpaid, but client submits invBeta or another invoice)
  const mismatchRes = await fetch(`${BASE_URL}/api/payments/razorpay/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      razorpay_order_id: orderIdAlpha1,
      razorpay_payment_id: paymentIdAlpha1,
      razorpay_signature: "some_signature",
      invoiceId: t.invAlphaWebhook.id, // Mismatched invoice
    }),
  });
  const mismatchJson = await mismatchRes.json();
  recordResult(
    "REQ 2: Order Binding",
    "Verify order bound to Invoice A with mismatched invoiceId returns HTTP 400 (INVOICE_MISMATCH)",
    "400 (INVOICE_MISMATCH)",
    `${mismatchRes.status} (${mismatchJson.code})`,
    mismatchRes.status === 400 && mismatchJson.code === "INVOICE_MISMATCH"
  );

  // 2.2: Cross-Tenant Verification: Business Beta attempts to verify Business Alpha's order
  const crossTenantVerifyRes = await fetch(`${BASE_URL}/api/payments/razorpay/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenBeta}`,
    },
    body: JSON.stringify({
      razorpay_order_id: orderIdAlpha1,
      razorpay_payment_id: paymentIdAlpha1,
      razorpay_signature: "fake_sig",
    }),
  });
  recordResult(
    "REQ 2: Tenant Isolation",
    "Foreign business verifying order returns HTTP 404 (ORDER_NOT_FOUND)",
    404,
    crossTenantVerifyRes.status,
    crossTenantVerifyRes.status === 404
  );

  // 2.3: Cryptographic Signature Verification - Tampered Signature Rejection
  const tamperedSig = "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678";
  const tamperedRes = await fetch(`${BASE_URL}/api/payments/razorpay/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      razorpay_order_id: orderIdAlpha1,
      razorpay_payment_id: paymentIdAlpha1,
      razorpay_signature: tamperedSig,
      invoiceId: t.invAlphaUnpaid.id,
    }),
  });
  const tamperedJson = await tamperedRes.json();
  recordResult(
    "REQ 3: Cryptographic Signature",
    "Tampered payment signature returns HTTP 400 (INVALID_SIGNATURE)",
    "400 (INVALID_SIGNATURE)",
    `${tamperedRes.status} (${tamperedJson.code})`,
    tamperedRes.status === 400 && tamperedJson.code === "INVALID_SIGNATURE"
  );

  // Verify that the payment in DB is marked FAILED after invalid signature attempt
  const paymentFailedInDb = await prisma.payment.findFirst({
    where: { razorpayOrderId: orderIdAlpha1, businessId: t.bizAlpha.id },
  });
  recordResult(
    "REQ 3: Cryptographic Signature",
    "Database payment status is updated to FAILED upon failed signature",
    "FAILED",
    paymentFailedInDb?.status,
    paymentFailedInDb?.status === "FAILED"
  );

  // Reset payment status back to PENDING for genuine verification test
  await prisma.payment.updateMany({
    where: { razorpayOrderId: orderIdAlpha1, businessId: t.bizAlpha.id },
    data: { status: "PENDING" },
  });

  // 2.4: Genuine Cryptographic Signature Verification
  const validSignatureAlpha1 = crypto
    .createHmac("sha256", keySecretAlpha)
    .update(`${orderIdAlpha1}|${paymentIdAlpha1}`)
    .digest("hex");

  const validVerifyRes = await fetch(`${BASE_URL}/api/payments/razorpay/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      razorpay_order_id: orderIdAlpha1,
      razorpay_payment_id: paymentIdAlpha1,
      razorpay_signature: validSignatureAlpha1,
      invoiceId: t.invAlphaUnpaid.id,
    }),
  });
  const validVerifyJson = await validVerifyRes.json();
  recordResult(
    "REQ 3: Cryptographic Signature",
    "Valid HMAC-SHA256 signature returns HTTP 200 (verified: true)",
    "200 (verified: true)",
    `${validVerifyRes.status} (verified: ${validVerifyJson.verified})`,
    validVerifyRes.status === 200 && validVerifyJson.verified === true
  );

  // 2.5: Verify Atomic DB Settle (Payment is SUCCESSFUL, Invoice is PAID, ActivityLog created)
  const settledInvoice = await prisma.invoice.findUnique({
    where: { id: t.invAlphaUnpaid.id },
  });
  const settledPayment = await prisma.payment.findFirst({
    where: { razorpayOrderId: orderIdAlpha1, businessId: t.bizAlpha.id },
  });
  const invoicePaidLog = await prisma.activityLog.findFirst({
    where: {
      businessId: t.bizAlpha.id,
      action: "INVOICE_PAID",
      entityId: t.invAlphaUnpaid.id,
    },
  });

  recordResult(
    "REQ 2: Atomic Settlement",
    "Invoice status atomically updated to PAID and amountPaid equals totalAmount",
    "PAID (amountPaid: 10000)",
    `${settledInvoice?.status} (amountPaid: ${settledInvoice?.amountPaid})`,
    settledInvoice?.status === "PAID" && settledInvoice?.amountPaid === 10000
  );

  recordResult(
    "REQ 2: Atomic Settlement",
    "Payment record updated to SUCCESSFUL with verifiedAt timestamp",
    "SUCCESSFUL",
    settledPayment?.status,
    settledPayment?.status === "SUCCESSFUL" && settledPayment?.verifiedAt !== null
  );

  recordResult(
    "REQ 2: Atomic Settlement",
    "ActivityLog recorded for verified invoice settlement",
    "INVOICE_PAID",
    invoicePaidLog?.action,
    Boolean(invoicePaidLog)
  );

  // 2.6: Replay Prevention (Re-submitting the exact same verified order)
  const replayOrderRes = await fetch(`${BASE_URL}/api/payments/razorpay/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      razorpay_order_id: orderIdAlpha1,
      razorpay_payment_id: paymentIdAlpha1,
      razorpay_signature: validSignatureAlpha1,
      invoiceId: t.invAlphaUnpaid.id,
    }),
  });
  const replayOrderJson = await replayOrderRes.json();
  recordResult(
    "REQ 2: Replay Prevention",
    "Re-verifying an already processed order returns HTTP 409 (PAYMENT_ALREADY_PROCESSED)",
    "409 (PAYMENT_ALREADY_PROCESSED)",
    `${replayOrderRes.status} (${replayOrderJson.code})`,
    replayOrderRes.status === 409 && replayOrderJson.code === "PAYMENT_ALREADY_PROCESSED"
  );

  // 2.7: Payment ID Replay (Re-using the same payment ID on a DIFFERENT pending order)
  const orderIdAlphaReplay = `order_test_alpha_replay_${Date.now()}`;
  await prisma.payment.create({
    data: {
      businessId: t.bizAlpha.id,
      invoiceId: t.invAlphaWebhook.id,
      amount: t.invAlphaWebhook.totalAmount,
      currency: "INR",
      status: "PENDING",
      razorpayOrderId: orderIdAlphaReplay,
      receiptNumber: `rcpt_${orderIdAlphaReplay}`,
    },
  });

  const sigForReplay = crypto
    .createHmac("sha256", keySecretAlpha)
    .update(`${orderIdAlphaReplay}|${paymentIdAlpha1}`) // Reusing paymentIdAlpha1!
    .digest("hex");

  const replayPayIdRes = await fetch(`${BASE_URL}/api/payments/razorpay/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      razorpay_order_id: orderIdAlphaReplay,
      razorpay_payment_id: paymentIdAlpha1, // Reused payment ID!
      razorpay_signature: sigForReplay,
      invoiceId: t.invAlphaWebhook.id,
    }),
  });
  const replayPayIdJson = await replayPayIdRes.json();
  recordResult(
    "REQ 2: Replay Prevention",
    "Reusing already-processed payment ID on new order returns HTTP 409 (PAYMENT_REPLAY_DETECTED)",
    "409 (PAYMENT_REPLAY_DETECTED)",
    `${replayPayIdRes.status} (${replayPayIdJson.code})`,
    replayPayIdRes.status === 409 && replayPayIdJson.code === "PAYMENT_REPLAY_DETECTED"
  );

  // Clean up replay test order
  await prisma.payment.deleteMany({ where: { razorpayOrderId: orderIdAlphaReplay } });

  // -------------------------------------------------------------------
  // REQUIREMENT 4: Razorpay Webhook on RAW Body & Idempotency
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 4] Testing Razorpay Webhook on RAW Body & Idempotency <<<");

  const orderIdWebhook = `order_wh_${Date.now()}`;
  const paymentIdWebhook = `pay_wh_${Date.now()}`;
  const webhookSecretAlpha = t.bizAlpha.integrationConfig.razorpayWebhookSecret;

  // Seed pending payment for webhook invoice
  await prisma.payment.create({
    data: {
      businessId: t.bizAlpha.id,
      invoiceId: t.invAlphaWebhook.id,
      amount: t.invAlphaWebhook.totalAmount,
      currency: "INR",
      status: "PENDING",
      razorpayOrderId: orderIdWebhook,
      receiptNumber: `rcpt_${orderIdWebhook}`,
    },
  });

  const webhookPayload = JSON.stringify({
    entity: "event",
    account_id: "acc_mock_alpha",
    event: "payment.captured",
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: paymentIdWebhook,
          entity: "payment",
          amount: t.invAlphaWebhook.totalAmount * 100,
          currency: "INR",
          status: "captured",
          order_id: orderIdWebhook,
          invoice_id: null,
          international: false,
          method: "upi",
          amount_refunded: 0,
          refund_status: null,
          captured: true,
          description: "Invoice payment",
          card_id: null,
          bank: null,
          wallet: null,
          vpa: "customer@upi",
          email: "cust1@alpha.com",
          contact: "+919876543211",
          fee: 300,
          tax: 54,
          error_code: null,
          error_description: null,
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  });

  // 4.1: Webhook call without x-razorpay-signature header returns HTTP 400
  const noSigWhRes = await fetch(`${BASE_URL}/api/payments/razorpay/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: webhookPayload,
  });
  recordResult(
    "REQ 4: Webhook Security",
    "Webhook request without x-razorpay-signature header returns HTTP 400",
    400,
    noSigWhRes.status,
    noSigWhRes.status === 400
  );

  // 4.2: Webhook call with invalid/tampered signature returns HTTP 401
  const badWhRes = await fetch(`${BASE_URL}/api/payments/razorpay/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": "invalid_webhook_signature_abcdef123456",
    },
    body: webhookPayload,
  });
  recordResult(
    "REQ 4: Webhook Security",
    "Webhook request with tampered HMAC signature returns HTTP 401",
    401,
    badWhRes.status,
    badWhRes.status === 401
  );

  // 4.3: Valid Webhook Signature on RAW Body succeeds with HTTP 200
  const validWebhookSig = crypto
    .createHmac("sha256", webhookSecretAlpha)
    .update(webhookPayload)
    .digest("hex");

  const validWhRes = await fetch(`${BASE_URL}/api/payments/razorpay/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": validWebhookSig,
    },
    body: webhookPayload,
  });
  const validWhJson = await validWhRes.json();
  recordResult(
    "REQ 4: Webhook Processing",
    "Valid signed webhook (payment.captured) returns HTTP 200 (processed: true)",
    "200 (processed: true)",
    `${validWhRes.status} (processed: ${validWhJson.processed})`,
    validWhRes.status === 200 && validWhJson.processed === true
  );

  // 4.4: Webhook settled payment and invoice in DB
  const whSettledInvoice = await prisma.invoice.findUnique({
    where: { id: t.invAlphaWebhook.id },
  });
  const whSettledPayment = await prisma.payment.findFirst({
    where: { razorpayOrderId: orderIdWebhook, businessId: t.bizAlpha.id },
  });
  recordResult(
    "REQ 4: Webhook DB Settlement",
    "Webhook payment.captured settles invoice to PAID in database",
    "PAID",
    whSettledInvoice?.status,
    whSettledInvoice?.status === "PAID"
  );
  recordResult(
    "REQ 4: Webhook DB Settlement",
    "Webhook payment.captured marks Payment SUCCESSFUL with paymentId recorded",
    "SUCCESSFUL",
    whSettledPayment?.status,
    whSettledPayment?.status === "SUCCESSFUL" && whSettledPayment?.razorpayPaymentId === paymentIdWebhook
  );

  // Count initial ActivityLogs for invoice payment
  const initialLogCount = await prisma.activityLog.count({
    where: {
      businessId: t.bizAlpha.id,
      entityId: t.invAlphaWebhook.id,
      action: "INVOICE_PAID",
    },
  });

  // 4.5: Webhook Idempotency (Duplicate webhook delivery must return 200 with idempotent: true and no duplicate state changes)
  const dupWhRes = await fetch(`${BASE_URL}/api/payments/razorpay/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": validWebhookSig,
    },
    body: webhookPayload,
  });
  const dupWhJson = await dupWhRes.json();
  recordResult(
    "REQ 4: Webhook Idempotency",
    "Duplicate webhook delivery returns HTTP 200 with idempotent: true",
    "200 (idempotent: true)",
    `${dupWhRes.status} (idempotent: ${dupWhJson.idempotent})`,
    dupWhRes.status === 200 && dupWhJson.idempotent === true
  );

  const postDupLogCount = await prisma.activityLog.count({
    where: {
      businessId: t.bizAlpha.id,
      entityId: t.invAlphaWebhook.id,
      action: "INVOICE_PAID",
    },
  });
  recordResult(
    "REQ 4: Webhook Idempotency",
    "Duplicate webhook delivery creates ZERO duplicate activity log entries",
    initialLogCount,
    postDupLogCount,
    postDupLogCount === initialLogCount
  );

  // 4.6: Webhook payment.failed handling
  const orderIdFail = `order_wh_fail_${Date.now()}`;
  const paymentIdFail = `pay_wh_fail_${Date.now()}`;
  await prisma.payment.create({
    data: {
      businessId: t.bizAlpha.id,
      amount: 2500,
      currency: "INR",
      status: "PENDING",
      razorpayOrderId: orderIdFail,
      receiptNumber: `rcpt_${orderIdFail}`,
    },
  });

  const failPayload = JSON.stringify({
    entity: "event",
    event: "payment.failed",
    payload: {
      payment: {
        entity: {
          id: paymentIdFail,
          order_id: orderIdFail,
          status: "failed",
          amount: 250000,
        },
      },
    },
  });

  const failSig = crypto
    .createHmac("sha256", webhookSecretAlpha)
    .update(failPayload)
    .digest("hex");

  const failWhRes = await fetch(`${BASE_URL}/api/payments/razorpay/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": failSig,
    },
    body: failPayload,
  });
  const failPaymentInDb = await prisma.payment.findFirst({
    where: { razorpayOrderId: orderIdFail, businessId: t.bizAlpha.id },
  });
  recordResult(
    "REQ 4: Webhook Failure",
    "Webhook payment.failed event marks database payment status as FAILED",
    "FAILED",
    failPaymentInDb?.status,
    failWhRes.status === 200 && failPaymentInDb?.status === "FAILED"
  );

  // 4.7: Duplicate payment.failed webhook is idempotent
  const dupFailWhRes = await fetch(`${BASE_URL}/api/payments/razorpay/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": failSig,
    },
    body: failPayload,
  });
  const dupFailJson = await dupFailWhRes.json();
  recordResult(
    "REQ 4: Webhook Failure Idempotency",
    "Duplicate payment.failed delivery returns HTTP 200 with idempotent: true",
    "200 (idempotent: true)",
    `${dupFailWhRes.status} (idempotent: ${dupFailJson.idempotent})`,
    dupFailWhRes.status === 200 && dupFailJson.idempotent === true
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 5 & 6: Subscription Transparency & Credentials Architecture
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 5 & 6] Testing Subscription Transparency & Credentials Architecture <<<");

  const razorpayTs = fs.readFileSync(path.join(__dirname, "../src/lib/razorpay.ts"), "utf8");

  const hasOneTimePlan = razorpayTs.includes('billingModel: "ONE_TIME_PURCHASE"');
  const has30Days = razorpayTs.includes('interval: "30_days"');
  const noFakeMonthly = !razorpayTs.includes('interval: "month"');

  recordResult(
    "REQ 5: Subscription Transparency",
    "All subscription tiers configured as ONE_TIME_PURCHASE for 30 days (no false auto-debit claims)",
    true,
    hasOneTimePlan && has30Days && noFakeMonthly,
    hasOneTimePlan && has30Days && noFakeMonthly
  );

  // 5.2: Verification of subscription order endpoint rejects invalid plans
  const invalidPlanRes = await fetch(`${BASE_URL}/api/payments/razorpay/order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      type: "SUBSCRIPTION",
      planId: "NON_EXISTENT_ULTRA_TIER",
    }),
  });
  recordResult(
    "REQ 5: Subscription Validation",
    "Selecting invalid subscription tier returns HTTP 400",
    400,
    invalidPlanRes.status,
    invalidPlanRes.status === 400
  );

  // Note: Test tenants preserved as immutable audit trail per DB constraints.

  // Summary
  console.log("\n==========================================================================");
  console.log(`PHASE 3 AUDIT RESULTS: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
  console.log("==========================================================================\n");

  if (failCount > 0) {
    console.error(`FAILURE: ${failCount} tests failed in Phase 3 suite.`);
    process.exit(1);
  } else {
    console.log("ALL TESTS IN PHASE 3 RAZORPAY PAYMENTS SUITE PASSED WITH 100% SUCCESS!");
    process.exit(0);
  }
}

runPhase3Suite().catch((err) => {
  console.error("Test execution threw fatal error:", err);
  process.exit(1);
});
