const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

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

async function setupPhase2Data() {
  const runId = Date.now();
  console.log(`Setting up Phase 2 test business (runId: ${runId})...`);

  const hash = await bcrypt.hash("PasswordSlot123!", 10);

  const business = await prisma.business.create({
    data: {
      name: "SlotWise Precision Clinic",
      slug: `slotwise-test-${runId}`,
      currency: "INR",
      timezone: "Asia/Kolkata",
      workingHoursStart: "09:00",
      workingHoursEnd: "18:00",
      workingDays: "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday", // Closed on Sunday
      planId: "PRO",
      planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      users: {
        create: {
          email: `slotwise-owner-${runId}@test.com`,
          name: "Dr. Precision",
          passwordHash: hash,
          role: "OWNER",
        },
      },
      customers: {
        create: {
          name: "SlotWise Test Customer",
          phone: "+919876500001",
          email: "slot-cust@test.com",
        },
      },
      services: {
        create: [
          {
            name: "Standard Consultation",
            durationMinutes: 30,
            bufferMinutes: 0,
            price: 1500,
            isActive: true,
          },
          {
            name: "Comprehensive Diagnostic",
            durationMinutes: 60,
            bufferMinutes: 0,
            price: 3000,
            isActive: true,
          },
        ],
      },
    },
    include: {
      users: true,
      customers: true,
      services: true,
    },
  });

  return {
    business,
    user: business.users[0],
    customer: business.customers[0],
    service30: business.services.find((s) => s.durationMinutes === 30),
    service60: business.services.find((s) => s.durationMinutes === 60),
  };
}

async function runPhase2Suite() {
  const t = await setupPhase2Data();

  console.log("\n==========================================================================");
  console.log("  HOSTILE SECURITY AUDIT: PHASE 2 DOUBLE-BOOKING & TIMEZONE VERIFICATION");
  console.log("==========================================================================\n");

  // -------------------------------------------------------------------
  // REQUIREMENT 1: Database-Level Double-Booking Prevention & Constraints
  // -------------------------------------------------------------------
  console.log(">>> [REQ 1] Testing Database-Level Constraint & Collision Enforcement <<<");

  // 1a. Verify SQLite partial unique index exists on Appointment table
  const indexes = await prisma.$queryRawUnsafe(`PRAGMA index_list(Appointment);`);
  const hasPartialUniqueIndex = Array.isArray(indexes) && indexes.some(
    (idx) => idx.name === "unique_active_appointment_slot" && (idx.unique === 1 || idx.unique === 1n)
  );
  recordResult(
    "REQ 1: DB Constraint",
    "Database contains unique partial index (unique_active_appointment_slot)",
    true,
    hasPartialUniqueIndex,
    hasPartialUniqueIndex
  );

  // 1b. Book a slot at 10:00 AM IST on Friday 2026-11-20
  // 10:00 AM IST = 04:30 AM UTC
  const slot10AmIst = "2026-11-20T10:00:00+05:30";
  const bookRes1 = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessSlug: t.business.slug,
      serviceId: t.service30.id,
      customerName: "Alice Walker",
      customerPhone: "+919876500010",
      startTime: slot10AmIst,
    }),
  });
  const bookJson1 = await bookRes1.json();
  recordResult("REQ 1: Double-Booking", "Initial booking for 10:00 AM IST succeeds (HTTP 201)", 201, bookRes1.status, bookRes1.status === 201);

  // 1c. Sequential duplicate booking for the exact same slot MUST return 409
  const dupRes = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessSlug: t.business.slug,
      serviceId: t.service30.id,
      customerName: "Bob Duplicate",
      customerPhone: "+919876500020",
      startTime: slot10AmIst,
    }),
  });
  const dupJson = await dupRes.json();
  recordResult(
    "REQ 1: Double-Booking",
    "Sequential identical booking returns HTTP 409 (SLOT_CONFLICT)",
    409,
    dupRes.status,
    dupRes.status === 409 && dupJson.code === "SLOT_CONFLICT"
  );

  // 1d. Staggered overlapping interval booking:
  // Initial appointment is 10:00 - 10:30 IST. Attempt booking 10:15 - 10:45 IST!
  const overlapIst = "2026-11-20T10:15:00+05:30";
  const overlapRes = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessSlug: t.business.slug,
      serviceId: t.service30.id,
      customerName: "Charlie Overlap",
      customerPhone: "+919876500030",
      startTime: overlapIst,
    }),
  });
  const overlapJson = await overlapRes.json();
  recordResult(
    "REQ 1: Double-Booking",
    "Overlapping staggered interval (10:15-10:45) returns HTTP 409 (SLOT_CONFLICT)",
    409,
    overlapRes.status,
    overlapRes.status === 409 && overlapJson.code === "SLOT_CONFLICT"
  );

  // 1e. Cancelled appointment frees the slot:
  // Cancel Alice's appointment, then verify Bob can now book 10:00 AM IST successfully
  await prisma.appointment.update({
    where: { id: bookJson1.appointment.id },
    data: { status: "CANCELLED" },
  });

  const rebookRes = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessSlug: t.business.slug,
      serviceId: t.service30.id,
      customerName: "Bob Rebooker",
      customerPhone: "+919876500020",
      startTime: slot10AmIst,
    }),
  });
  recordResult(
    "REQ 1: Double-Booking",
    "Re-booking a previously CANCELLED slot succeeds (HTTP 201)",
    201,
    rebookRes.status,
    rebookRes.status === 201
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 2: UTC Storage & Asia/Kolkata Timezone Rendering
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 2] Testing UTC Storage, Asia/Kolkata Rendering & Closed-Day Validation <<<");

  // 2a. Test 5:30 PM IST Booking
  // 5:30 PM (17:30) IST on 2026-11-20.
  // In UTC: 17:30 - 05:30 = 12:00:00.000Z!
  const slot530PmIst = "2026-11-20T17:30:00+05:30";
  const book530Res = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessSlug: t.business.slug,
      serviceId: t.service30.id,
      customerName: "David Evening",
      customerPhone: "+919876500040",
      startTime: slot530PmIst,
    }),
  });
  const book530Json = await book530Res.json();
  recordResult("REQ 2: Timezone & UTC", "Booking at 5:30 PM IST succeeds (HTTP 201)", 201, book530Res.status, book530Res.status === 201);

  // Verify in database: stored in UTC
  const aptInDb = await prisma.appointment.findUnique({
    where: { id: book530Json.appointment.id },
  });
  const storedUtcIso = aptInDb.startTime.toISOString();
  const expectedUtcIso = "2026-11-20T12:00:00.000Z";
  recordResult(
    "REQ 2: Timezone & UTC",
    "5:30 PM IST is stored in DB as UTC 12:00:00.000Z",
    expectedUtcIso,
    storedUtcIso,
    storedUtcIso === expectedUtcIso
  );

  // Verify rendering back into Asia/Kolkata formats to 05:30 PM
  const renderedInIst = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(aptInDb.startTime);
  const isRenderedCorrectly = /05:30\s*pm/i.test(renderedInIst);
  recordResult(
    "REQ 2: Timezone & UTC",
    "UTC 12:00 rendered in Asia/Kolkata formats to 05:30 PM",
    "05:30 PM",
    renderedInIst,
    isRenderedCorrectly
  );

  // Verify available-slots endpoint lists 5:30 PM slot in IST
  const slotsRes = await fetch(
    `${BASE_URL}/api/appointments/available-slots?serviceId=${t.service30.id}&date=2026-11-20&businessSlug=${t.business.slug}`,
    { method: "GET" }
  );
  const slotsData = await slotsRes.json();
  const slot530InList = slotsData.slots.find((s) => s.startTime === expectedUtcIso);
  const has530SlotWithLabel = slot530InList && /05:30\s*pm/i.test(slot530InList.timeLabel);
  recordResult(
    "REQ 2: Timezone & UTC",
    "Available-slots renders 5:30 PM timeLabel for 12:00:00.000Z",
    "timeLabel: 05:30 PM",
    slot530InList ? `timeLabel: ${slot530InList.timeLabel}` : "Slot not found",
    has530SlotWithLabel
  );

  // 2b. Test Sunday / Closed-Day Booking
  // Sunday: 2026-11-22.
  const sundaySlot = "2026-11-22T10:00:00+05:30";
  const sundayBookRes = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessSlug: t.business.slug,
      serviceId: t.service30.id,
      customerName: "Sunday Requester",
      customerPhone: "+919876500050",
      startTime: sundaySlot,
    }),
  });
  const sundayJson = await sundayBookRes.json();
  recordResult(
    "REQ 2: Closed Day",
    "POST /api/appointments on Sunday returns HTTP 400 (BUSINESS_CLOSED)",
    400,
    sundayBookRes.status,
    sundayBookRes.status === 400 && sundayJson.code === "BUSINESS_CLOSED"
  );

  // Verify available-slots for Sunday returns businessOpen: false
  const sundaySlotsRes = await fetch(
    `${BASE_URL}/api/appointments/available-slots?serviceId=${t.service30.id}&date=2026-11-22&businessSlug=${t.business.slug}`,
    { method: "GET" }
  );
  const sundaySlotsJson = await sundaySlotsRes.json();
  const sundayClosedHandled =
    sundaySlotsJson.businessOpen === false &&
    sundaySlotsJson.slots.length === 0 &&
    sundaySlotsJson.reason?.includes("Closed on Sundays");
  recordResult(
    "REQ 2: Closed Day",
    "GET /api/appointments/available-slots on Sunday returns businessOpen: false",
    "businessOpen: false",
    `businessOpen: ${sundaySlotsJson.businessOpen} (${sundaySlotsJson.reason})`,
    sundayClosedHandled
  );

  // 2c. Test Outside Operating Hours Booking (8:00 PM IST when business closes at 6:00 PM)
  const lateSlot = "2026-11-20T20:00:00+05:30";
  const lateBookRes = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessSlug: t.business.slug,
      serviceId: t.service30.id,
      customerName: "Late Requester",
      customerPhone: "+919876500060",
      startTime: lateSlot,
    }),
  });
  const lateJson = await lateBookRes.json();
  recordResult(
    "REQ 2: Operating Hours",
    "POST /api/appointments outside working hours returns HTTP 400 (OUTSIDE_WORKING_HOURS)",
    400,
    lateBookRes.status,
    lateBookRes.status === 400 && lateJson.code === "OUTSIDE_WORKING_HOURS"
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 3: High-Concurrency Double-Booking Test (20 Parallel Requests)
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 3] Running Concurrency Test: 20 Parallel Requests for the Same Slot <<<");

  const concurrentSlotIst = "2026-11-20T14:30:00+05:30"; // 2:30 PM IST (09:00 UTC)
  const concurrentUtcIso = "2026-11-20T09:00:00.000Z";

  // Clean any existing test booking at this slot
  await prisma.appointment.deleteMany({
    where: {
      businessId: t.business.id,
      startTime: new Date(concurrentUtcIso),
    },
  });

  console.log(`Firing 20 simultaneous parallel requests for ${concurrentSlotIst} (${concurrentUtcIso})...`);

  const promises = [];
  for (let i = 1; i <= 20; i++) {
    const reqBody = {
      businessSlug: t.business.slug,
      serviceId: t.service30.id,
      customerName: `Concurrent User ${i}`,
      customerPhone: `+91987650${String(100 + i).padStart(4, "0")}`,
      startTime: concurrentSlotIst,
    };

    promises.push(
      fetch(`${BASE_URL}/api/appointments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": `198.51.100.${i}`,
        },
        body: JSON.stringify(reqBody),
      }).then(async (res) => {
        const body = await res.json().catch(() => ({}));
        return { index: i, status: res.status, body };
      })
    );
  }

  const responses = await Promise.all(promises);

  const success201 = responses.filter((r) => r.status === 201);
  const conflict409 = responses.filter((r) => r.status === 409);
  const serverError500 = responses.filter((r) => r.status >= 500);

  console.log(`Results: ${success201.length} succeeded (201), ${conflict409.length} collided (409), ${serverError500.length} server errors (500).`);

  recordResult(
    "REQ 3: Concurrency",
    "Exactly 1 of 20 parallel requests succeeds with HTTP 201",
    1,
    success201.length,
    success201.length === 1
  );

  recordResult(
    "REQ 3: Concurrency",
    "Exactly 19 of 20 parallel requests return HTTP 409 (SLOT_CONFLICT)",
    19,
    conflict409.length,
    conflict409.length === 19
  );

  recordResult(
    "REQ 3: Concurrency",
    "Zero 500 server errors under 20-request race condition",
    0,
    serverError500.length,
    serverError500.length === 0
  );

  // Database verification: exactly 1 active appointment in the DB
  const dbRows = await prisma.appointment.findMany({
    where: {
      businessId: t.business.id,
      startTime: new Date(concurrentUtcIso),
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
  });

  recordResult(
    "REQ 3: Concurrency",
    "Database contains EXACTLY 1 active appointment row for the contested slot",
    1,
    dbRows.length,
    dbRows.length === 1
  );

  // -------------------------------------------------------------------
  // TEST SUMMARY TABLE
  // -------------------------------------------------------------------
  console.log("\n==========================================================================");
  console.log(`PHASE 2 AUDIT RESULTS: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
  console.log("==========================================================================\n");

  if (failCount > 0) {
    console.error("FAILURES DETECTED IN PHASE 2. Fix the issues before proceeding.");
    process.exit(1);
  } else {
    console.log("ALL TESTS IN PHASE 2 DOUBLE-BOOKING & TIMEZONE SUITE PASSED WITH 100% SUCCESS!");
    process.exit(0);
  }
}

runPhase2Suite()
  .catch((e) => {
    console.error("Test runner error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
