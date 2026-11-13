const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
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

async function setupPhase4Data() {
  const runId = Date.now();
  console.log(`Setting up Phase 4 isolated test tenants (runId: ${runId})...`);

  const hash = await bcrypt.hash("PasswordWa123!", 10);

  // Business Alpha: Fully configured Meta WhatsApp credentials
  const bizAlpha = await prisma.business.create({
    data: {
      name: "Alpha Dental Care",
      slug: `wa-tenant-alpha-${runId}`,
      currency: "INR",
      timezone: "Asia/Kolkata",
      users: {
        create: {
          email: `alpha-wa-${runId}@test.com`,
          name: "Dr. Alpha",
          passwordHash: hash,
          role: "OWNER",
        },
      },
      integrationConfig: {
        create: {
          metaPhoneNumberId: `1098765${String(runId).slice(-6)}`,
          metaAccessToken: "EAABmockTokenAlpha_1234567890abcdef",
          metaWabaId: `waba_alpha_${runId}`,
          metaAppSecret: "AlphaAppSecret_1234567890abcdef",
          metaWebhookVerifyToken: `token_alpha_wa_${runId}`,
        },
      },
      services: {
        create: {
          name: "Dental Cleaning",
          durationMinutes: 30,
          price: 1200,
        },
      },
    },
    include: {
      users: true,
      integrationConfig: true,
      services: true,
    },
  });

  // Business Beta: Competitor tenant
  const bizBeta = await prisma.business.create({
    data: {
      name: "Beta Diagnostics",
      slug: `wa-tenant-beta-${runId}`,
      currency: "INR",
      timezone: "Asia/Kolkata",
      users: {
        create: {
          email: `beta-wa-${runId}@test.com`,
          name: "Dr. Beta",
          passwordHash: hash,
          role: "OWNER",
        },
      },
      integrationConfig: {
        create: {
          metaPhoneNumberId: "209876543210987",
          metaAccessToken: "EAABmockTokenBeta_0987654321fedcba",
          metaWabaId: "waba_beta_123456",
          metaAppSecret: "BetaAppSecret_0987654321fedcba",
          metaWebhookVerifyToken: "token_beta_wa_verify_2026",
        },
      },
    },
    include: {
      users: true,
      integrationConfig: true,
    },
  });

  // Business Unconnected: No Meta credentials
  const bizUnconnected = await prisma.business.create({
    data: {
      name: "Offline Clinic",
      slug: `wa-tenant-unconnected-${runId}`,
      currency: "INR",
      timezone: "Asia/Kolkata",
      users: {
        create: {
          email: `offline-${runId}@test.com`,
          name: "Dr. Offline",
          passwordHash: hash,
          role: "OWNER",
        },
      },
      customers: {
        create: {
          name: "Offline Patient",
          phone: "+919876599999",
        },
      },
    },
    include: {
      users: true,
      customers: true,
    },
  });

  // Generate tokens
  const tokenAlpha = await createTestJwt(bizAlpha.users[0].id, bizAlpha.id, bizAlpha.users[0].email);
  const tokenBeta = await createTestJwt(bizBeta.users[0].id, bizBeta.id, bizBeta.users[0].email);
  const tokenUnconnected = await createTestJwt(bizUnconnected.users[0].id, bizUnconnected.id, bizUnconnected.users[0].email);

  return {
    bizAlpha,
    bizBeta,
    bizUnconnected,
    tokenAlpha,
    tokenBeta,
    tokenUnconnected,
  };
}

async function runPhase4Suite() {
  const t = await setupPhase4Data();

  console.log("\n==========================================================================");
  console.log("  HOSTILE SECURITY AUDIT: PHASE 4 WHATSAPP (META) VERIFICATION SUITE");
  console.log("==========================================================================\n");

  // -------------------------------------------------------------------
  // REQUIREMENT 1: x-hub-signature-256 HMAC-SHA256 & Timing-Safe Verification
  // -------------------------------------------------------------------
  console.log(">>> [REQ 1] Testing Webhook Handshake & Cryptographic HMAC Verification <<<");

  // 1.1: Webhook GET with wrong verify token returns 403
  const badTokenRes = await fetch(`${BASE_URL}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test_chall`);
  recordResult(
    "REQ 1: Webhook Handshake",
    "GET /api/whatsapp/webhook with wrong verify_token returns HTTP 403",
    403,
    badTokenRes.status,
    badTokenRes.status === 403
  );

  // 1.2: Webhook GET with valid verify token returns 200 and challenge
  const validTokenRes = await fetch(`${BASE_URL}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${t.bizAlpha.integrationConfig.metaWebhookVerifyToken}&hub.challenge=chall_alpha_99`);
  const challengeText = await validTokenRes.text();
  recordResult(
    "REQ 1: Webhook Handshake",
    "GET /api/whatsapp/webhook with valid verify_token returns HTTP 200 and echo challenge",
    "200 (chall_alpha_99)",
    `${validTokenRes.status} (${challengeText})`,
    validTokenRes.status === 200 && challengeText === "chall_alpha_99"
  );

  const testWamid1 = `wamid.HBgM${Date.now()}_alpha01`;
  const appSecretAlpha = t.bizAlpha.integrationConfig.metaAppSecret;
  const phoneNumberIdAlpha = t.bizAlpha.integrationConfig.metaPhoneNumberId;

  const sampleWebhookPayload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba_alpha_987654",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: phoneNumberIdAlpha,
              },
              contacts: [
                {
                  profile: { name: "Ananya Sharma" },
                  wa_id: "919876543210",
                },
              ],
              messages: [
                {
                  from: "919876543210",
                  id: testWamid1,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  text: { body: "Hi, I want to book a dental cleaning appointment for tomorrow." },
                  type: "text",
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  });

  // 1.3: Webhook POST missing signature header when secret is configured returns HTTP 400
  const noSigRes = await fetch(`${BASE_URL}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: sampleWebhookPayload,
  });
  recordResult(
    "REQ 1: Webhook HMAC Security",
    "POST /api/whatsapp/webhook missing x-hub-signature-256 returns HTTP 400",
    400,
    noSigRes.status,
    noSigRes.status === 400
  );

  // 1.4: Webhook POST with tampered signature returns HTTP 401
  const badSigRes = await fetch(`${BASE_URL}/api/whatsapp/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": "sha256=deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef",
    },
    body: sampleWebhookPayload,
  });
  recordResult(
    "REQ 1: Webhook HMAC Security",
    "POST /api/whatsapp/webhook with tampered HMAC signature returns HTTP 401",
    401,
    badSigRes.status,
    badSigRes.status === 401
  );

  // 1.5: Valid HMAC-SHA256 signature returns HTTP 200
  const validSignature = "sha256=" + crypto
    .createHmac("sha256", appSecretAlpha)
    .update(sampleWebhookPayload)
    .digest("hex");

  const validWebhookRes = await fetch(`${BASE_URL}/api/whatsapp/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": validSignature,
    },
    body: sampleWebhookPayload,
  });
  recordResult(
    "REQ 1: Webhook HMAC Security",
    "POST /api/whatsapp/webhook with valid x-hub-signature-256 returns HTTP 200",
    200,
    validWebhookRes.status,
    validWebhookRes.status === 200
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 2: Inbound Ingestion, wamid Recording & Idempotency
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 2] Testing Inbound Message Ingestion, wamid & Idempotency <<<");

  // 2.1: Verify Customer created with phone and name from Meta payload
  const ingestedCustomer = await prisma.customer.findFirst({
    where: {
      businessId: t.bizAlpha.id,
      phone: "+919876543210",
    },
  });
  recordResult(
    "REQ 2: Ingestion & Tenant Scoping",
    "Inbound message created customer record scoped to businessId",
    "Ananya Sharma (+919876543210)",
    `${ingestedCustomer?.name} (${ingestedCustomer?.phone})`,
    ingestedCustomer?.name === "Ananya Sharma" && ingestedCustomer?.phone === "+919876543210"
  );

  // 2.2: Verify Message recorded with exact Meta message ID (wamid) and status DELIVERED
  const ingestedMessage = await prisma.message.findFirst({
    where: {
      businessId: t.bizAlpha.id,
      metaMessageId: testWamid1,
    },
  });
  recordResult(
    "REQ 2: wamid Integrity",
    "Message recorded with direction INBOUND, status DELIVERED, and exact wamid",
    `INBOUND / DELIVERED / ${testWamid1}`,
    `${ingestedMessage?.direction} / ${ingestedMessage?.status} / ${ingestedMessage?.metaMessageId}`,
    ingestedMessage?.direction === "INBOUND" &&
      ingestedMessage?.status === "DELIVERED" &&
      ingestedMessage?.metaMessageId === testWamid1
  );

  // 2.3: ActivityLog recorded for inbound WhatsApp message
  const waActivityLog = await prisma.activityLog.findFirst({
    where: {
      businessId: t.bizAlpha.id,
      action: "WHATSAPP_MESSAGE_RECEIVED",
      entityId: testWamid1,
    },
  });
  recordResult(
    "REQ 2: Audit Trail",
    "ActivityLog recorded for received WhatsApp message with wamid entityId",
    "WHATSAPP_MESSAGE_RECEIVED",
    waActivityLog?.action,
    Boolean(waActivityLog)
  );

  // 2.4: Idempotency - Send the EXACT same webhook payload again with identical wamid
  const dupWebhookRes = await fetch(`${BASE_URL}/api/whatsapp/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": validSignature,
    },
    body: sampleWebhookPayload,
  });
  recordResult(
    "REQ 2: Webhook Idempotency",
    "Duplicate webhook delivery returns HTTP 200",
    200,
    dupWebhookRes.status,
    dupWebhookRes.status === 200
  );

  // Verify that count of messages with testWamid1 is still EXACTLY 1
  const messageCountForWamid = await prisma.message.count({
    where: { metaMessageId: testWamid1 },
  });
  recordResult(
    "REQ 2: Webhook Idempotency",
    "Duplicate wamid delivery ignored: database contains EXACTLY 1 message row",
    1,
    messageCountForWamid,
    messageCountForWamid === 1
  );

  // Verify activity log count is still EXACTLY 1
  const logCountForWamid = await prisma.activityLog.count({
    where: {
      businessId: t.bizAlpha.id,
      action: "WHATSAPP_MESSAGE_RECEIVED",
      entityId: testWamid1,
    },
  });
  recordResult(
    "REQ 2: Webhook Idempotency",
    "Duplicate wamid delivery created ZERO duplicate activity logs",
    1,
    logCountForWamid,
    logCountForWamid === 1
  );

  // 2.5: Status Update Event from Meta (e.g., status changed to READ)
  const statusUpdatePayload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba_alpha_987654",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: phoneNumberIdAlpha,
              },
              statuses: [
                {
                  id: testWamid1,
                  status: "read",
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  recipient_id: "919876543210",
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  });

  const statusSig = "sha256=" + crypto
    .createHmac("sha256", appSecretAlpha)
    .update(statusUpdatePayload)
    .digest("hex");

  const statusRes = await fetch(`${BASE_URL}/api/whatsapp/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": statusSig,
    },
    body: statusUpdatePayload,
  });
  const updatedStatusMsg = await prisma.message.findFirst({
    where: { metaMessageId: testWamid1 },
  });
  recordResult(
    "REQ 2: Status Delivery",
    "Webhook status update event transitions message status to READ",
    "READ",
    updatedStatusMsg?.status,
    statusRes.status === 200 && updatedStatusMsg?.status === "READ"
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 3: Draft Approval Flow & Human-in-the-Loop Isolation
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 3] Testing Draft Approval Flow & Human-in-the-Loop Safeguards <<<");

  // Create a conversation and seed an AI draft message in PENDING_APPROVAL
  const testConv = await prisma.conversation.findFirst({
    where: { businessId: t.bizAlpha.id, customerId: ingestedCustomer.id },
  });

  const aiDraftMessage = await prisma.message.create({
    data: {
      conversationId: testConv.id,
      businessId: t.bizAlpha.id,
      direction: "OUTBOUND",
      senderType: "AI_ASSISTANT",
      body: "Hello Ananya, we have slots open tomorrow at 11:00 AM or 3:00 PM for Dental Cleaning. Would either work for you?",
      status: "PENDING_APPROVAL",
      isAiGenerated: true,
      aiConfidence: 0.94,
    },
  });

  // 3.1: Verify the draft stays in PENDING_APPROVAL without explicit action
  const freshDraft = await prisma.message.findUnique({
    where: { id: aiDraftMessage.id },
  });
  recordResult(
    "REQ 3: Draft State Guard",
    "AI generated reply stays in PENDING_APPROVAL until explicitly approved",
    "PENDING_APPROVAL",
    freshDraft?.status,
    freshDraft?.status === "PENDING_APPROVAL"
  );

  // 3.2: Calling POST /api/whatsapp/messages (the regular send route) does NOT send or mutate the draft
  await fetch(`${BASE_URL}/api/whatsapp/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      conversationId: testConv.id,
      text: "Manual message from front desk",
    }),
  });
  const draftAfterDirectSend = await prisma.message.findUnique({
    where: { id: aiDraftMessage.id },
  });
  recordResult(
    "REQ 3: Draft State Guard",
    "Sending regular message does not mutate or send unapproved AI draft",
    "PENDING_APPROVAL",
    draftAfterDirectSend?.status,
    draftAfterDirectSend?.status === "PENDING_APPROVAL"
  );

  // 3.3: Attempting to call approve-draft on a message that is NOT in PENDING_APPROVAL returns HTTP 400
  const nonDraftApproveRes = await fetch(`${BASE_URL}/api/whatsapp/approve-draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      draftMessageId: ingestedMessage.id, // INBOUND message, status: READ
    }),
  });
  const nonDraftJson = await nonDraftApproveRes.json();
  recordResult(
    "REQ 3: Draft Approval Guard",
    "Approving a message that is not in PENDING_APPROVAL returns HTTP 400 (NOT_A_PENDING_DRAFT)",
    "400 (NOT_A_PENDING_DRAFT)",
    `${nonDraftApproveRes.status} (${nonDraftJson.code})`,
    nonDraftApproveRes.status === 400 && nonDraftJson.code === "NOT_A_PENDING_DRAFT"
  );

  // 3.4: Cross-tenant approval attempt (Business Beta attempts to approve Business Alpha's draft)
  const crossApproveRes = await fetch(`${BASE_URL}/api/whatsapp/approve-draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenBeta}`,
    },
    body: JSON.stringify({
      draftMessageId: aiDraftMessage.id,
    }),
  });
  recordResult(
    "REQ 3: Multi-Tenancy Guard",
    "Foreign tenant approving draft returns HTTP 404 (IDOR protection)",
    404,
    crossApproveRes.status,
    crossApproveRes.status === 404
  );

  // 3.5: Unauthenticated approve-draft request returns HTTP 401
  const unauthApproveRes = await fetch(`${BASE_URL}/api/whatsapp/approve-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftMessageId: aiDraftMessage.id }),
  });
  recordResult(
    "REQ 3: Auth Guard",
    "Unauthenticated approve-draft request returns HTTP 401",
    401,
    unauthApproveRes.status,
    unauthApproveRes.status === 401
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 4: Unconfigured Credentials & Honest Failure
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 4] Testing Unconnected Business & Honest Failure Responses <<<");

  // 4.1: Direct send from unconnected business returns HTTP 428 (WHATSAPP_NOT_CONNECTED)
  const unconnectedSendRes = await fetch(`${BASE_URL}/api/whatsapp/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenUnconnected}`,
    },
    body: JSON.stringify({
      customerId: t.bizUnconnected.customers[0].id,
      text: "Hello patient",
    }),
  });
  const unconnectedSendJson = await unconnectedSendRes.json();
  recordResult(
    "REQ 4: Honest Credential Guard",
    "Sending message without Meta credentials returns HTTP 428 (WHATSAPP_NOT_CONNECTED)",
    "428 (WHATSAPP_NOT_CONNECTED)",
    `${unconnectedSendRes.status} (${unconnectedSendJson.code})`,
    unconnectedSendRes.status === 428 && unconnectedSendJson.code === "WHATSAPP_NOT_CONNECTED"
  );

  // 4.2: Seed draft under unconnected business and attempt to approve it
  const unconnectedConv = await prisma.conversation.upsert({
    where: {
      businessId_customerId_channel: {
        businessId: t.bizUnconnected.id,
        customerId: t.bizUnconnected.customers[0].id,
        channel: "WHATSAPP",
      },
    },
    update: {},
    create: {
      businessId: t.bizUnconnected.id,
      customerId: t.bizUnconnected.customers[0].id,
      channel: "WHATSAPP",
    },
  });
  const unconnectedDraft = await prisma.message.create({
    data: {
      conversationId: unconnectedConv.id,
      businessId: t.bizUnconnected.id,
      direction: "OUTBOUND",
      senderType: "AI_ASSISTANT",
      body: "Unconnected draft reply",
      status: "PENDING_APPROVAL",
    },
  });

  const unconnectedApproveRes = await fetch(`${BASE_URL}/api/whatsapp/approve-draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenUnconnected}`,
    },
    body: JSON.stringify({
      draftMessageId: unconnectedDraft.id,
    }),
  });
  const unconnectedApproveJson = await unconnectedApproveRes.json();
  recordResult(
    "REQ 4: Honest Credential Guard",
    "Approving draft without Meta credentials returns HTTP 428 (WHATSAPP_NOT_CONNECTED)",
    "428 (WHATSAPP_NOT_CONNECTED)",
    `${unconnectedApproveRes.status} (${unconnectedApproveJson.code})`,
    unconnectedApproveRes.status === 428 && unconnectedApproveJson.code === "WHATSAPP_NOT_CONNECTED"
  );

  // 4.3: Verify integration status endpoint returns connected: false for unconnected business
  const intStatusRes = await fetch(`${BASE_URL}/api/integrations/status`, {
    headers: { Authorization: `Bearer ${t.tokenUnconnected}` },
  });
  const intStatusJson = await intStatusRes.json();
  recordResult(
    "REQ 4: Honest Status Display",
    "Integration status for unconnected business reports connected: false",
    false,
    intStatusJson.integrations?.whatsapp?.connected,
    intStatusJson.integrations?.whatsapp?.connected === false
  );

  // Note: Test businesses preserved as immutable audit trail per DB constraints.

  // Summary
  console.log("\n==========================================================================");
  console.log(`PHASE 4 AUDIT RESULTS: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
  console.log("==========================================================================\n");

  if (failCount > 0) {
    console.error(`FAILURE: ${failCount} tests failed in Phase 4 suite.`);
    process.exit(1);
  } else {
    console.log("ALL TESTS IN PHASE 4 WHATSAPP (META) SUITE PASSED WITH 100% SUCCESS!");
    process.exit(0);
  }
}

runPhase4Suite().catch((err) => {
  console.error("Test execution threw fatal error:", err);
  process.exit(1);
});
