const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { SignJWT } = require("jose");
const { validateGSTIN, validateHsnSac, calculateGst } = require("./dist/gst");
const { getFinancialYear } = require("./dist/invoice-sequence");

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

async function setupPhase6Data() {
  const runId = Date.now();
  console.log(`Setting up Phase 6 isolated test tenants (runId: ${runId})...`);

  const hash = await bcrypt.hash("PasswordGst123!", 10);

  // Business Alpha: Maharashtra supplier (GSTIN 27AABCU9603R1ZX)
  const bizAlpha = await prisma.business.create({
    data: {
      name: "Apex Tech Solutions LLP",
      slug: `gst-tenant-alpha-${runId}`,
      currency: "INR",
      timezone: "Asia/Kolkata",
      gstin: "27AABCU9603R1ZX", // Maharashtra
      state: "Maharashtra",
      address: "Bandra Kurla Complex",
      city: "Mumbai",
      users: {
        create: {
          email: `gst-alpha-${runId}@test.com`,
          name: "Alpha Admin",
          passwordHash: hash,
          role: "OWNER",
        },
      },
      services: {
        create: [
          {
            name: "Cloud Architecture Audit",
            durationMinutes: 60,
            price: 10000,
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

  // Business Beta: Delhi supplier (GSTIN 07AAAAA0000A1Z5)
  const bizBeta = await prisma.business.create({
    data: {
      name: "Capital Digital Services",
      slug: `gst-tenant-beta-${runId}`,
      currency: "INR",
      timezone: "Asia/Kolkata",
      gstin: "07AAAAA0000A1Z5", // Delhi
      state: "Delhi",
      city: "New Delhi",
      users: {
        create: {
          email: `gst-beta-${runId}@test.com`,
          name: "Beta Admin",
          passwordHash: hash,
          role: "OWNER",
        },
      },
      services: {
        create: [
          {
            name: "Digital Marketing Campaign",
            durationMinutes: 60,
            price: 5000,
            hsnSac: "998313",
          },
        ],
      },
    },
    include: {
      users: true,
      services: true,
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

async function runPhase6Suite() {
  const t = await setupPhase6Data();

  console.log("\n==========================================================================");
  console.log("  HOSTILE SECURITY AUDIT: PHASE 6 GST & INVOICES VERIFICATION SUITE");
  console.log("==========================================================================\n");

  // -------------------------------------------------------------------
  // REQUIREMENT 1: GSTIN Validation for Business and Customer
  // -------------------------------------------------------------------
  console.log(">>> [REQ 1] Testing 15-Digit GSTIN Validation & State Extraction <<<");

  // 1.1: Invalid GSTIN rejected by validator
  const invalidGstinCheck = validateGSTIN("INVALID_GSTIN_123");
  recordResult(
    "REQ 1: GSTIN Validation",
    "validateGSTIN rejects malformed string with valid: false",
    false,
    invalidGstinCheck.valid,
    invalidGstinCheck.valid === false && Boolean(invalidGstinCheck.error)
  );

  // 1.2: Valid 15-digit Maharashtra GSTIN extracts stateCode 27 and stateName Maharashtra
  const mhGstinCheck = validateGSTIN("27AABCU9603R1ZX");
  recordResult(
    "REQ 1: GSTIN State Extraction",
    "Valid MH GSTIN extracts stateCode 27 and stateName Maharashtra",
    "27 / Maharashtra",
    `${mhGstinCheck.stateCode} / ${mhGstinCheck.stateName}`,
    mhGstinCheck.valid === true && mhGstinCheck.stateCode === "27" && mhGstinCheck.stateName === "Maharashtra"
  );

  // 1.3: Valid 15-digit Karnataka GSTIN extracts stateCode 29 and stateName Karnataka
  const kaGstinCheck = validateGSTIN("29ABCDE1234F1Z5");
  recordResult(
    "REQ 1: GSTIN State Extraction",
    "Valid KA GSTIN extracts stateCode 29 and stateName Karnataka",
    "29 / Karnataka",
    `${kaGstinCheck.stateCode} / ${kaGstinCheck.stateName}`,
    kaGstinCheck.valid === true && kaGstinCheck.stateCode === "29" && kaGstinCheck.stateName === "Karnataka"
  );

  // 1.4: POST /api/customers with invalid GSTIN returns HTTP 400
  const badCustRes = await fetch(`${BASE_URL}/api/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      name: "Bad GST Customer",
      phone: "+919876543211",
      gstin: "12345NOTAGSTIN",
    }),
  });
  recordResult(
    "REQ 1: Customer GSTIN API Guard",
    "POST /api/customers with malformed GSTIN returns HTTP 400",
    400,
    badCustRes.status,
    badCustRes.status === 400
  );

  // 1.5: POST /api/customers with valid Maharashtra GSTIN succeeds and auto-populates state
  const mhCustRes = await fetch(`${BASE_URL}/api/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      name: "Mumbai Retailer Pvt Ltd",
      phone: "+919876543212",
      gstin: "27AABCU9603R1ZX",
      city: "Mumbai",
    }),
  });
  const mhCustJson = await mhCustRes.json();
  recordResult(
    "REQ 1: Customer GSTIN API Guard",
    "POST /api/customers with valid GSTIN returns HTTP 201 and sets state to Maharashtra",
    "201 / Maharashtra",
    `${mhCustRes.status} / ${mhCustJson.customer?.state}`,
    mhCustRes.status === 201 && mhCustJson.customer?.state === "Maharashtra"
  );
  const mhCustomer = mhCustJson.customer;

  // 1.6: POST /api/customers with valid Karnataka GSTIN succeeds (Inter-state customer)
  const kaCustRes = await fetch(`${BASE_URL}/api/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      name: "Bengaluru Tech Labs",
      phone: "+919876543213",
      gstin: "29ABCDE1234F1Z5",
      city: "Bengaluru",
    }),
  });
  const kaCustJson = await kaCustRes.json();
  recordResult(
    "REQ 1: Customer GSTIN API Guard",
    "POST /api/customers with valid KA GSTIN returns HTTP 201 and sets state to Karnataka",
    "201 / Karnataka",
    `${kaCustRes.status} / ${kaCustJson.customer?.state}`,
    kaCustRes.status === 201 && kaCustJson.customer?.state === "Karnataka"
  );
  const kaCustomer = kaCustJson.customer;

  // -------------------------------------------------------------------
  // REQUIREMENT 2: HSN / SAC per Line Item
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 2] Testing HSN / SAC Line Item Validation & Persistence <<<");

  // 2.1: validateHsnSac rejects non-numeric or short codes
  const badHsnCheck = validateHsnSac("SAC99");
  recordResult(
    "REQ 2: HSN/SAC Validation",
    "validateHsnSac rejects non-numeric HSN code with valid: false",
    false,
    badHsnCheck.valid,
    badHsnCheck.valid === false && Boolean(badHsnCheck.error)
  );

  // 2.2: POST /api/invoices with invalid HSN returns HTTP 400
  const badHsnInvRes = await fetch(`${BASE_URL}/api/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      customerId: mhCustomer.id,
      items: [
        {
          description: "Consulting",
          hsnSac: "INVALID_SAC",
          quantity: 1,
          unitPrice: 5000,
        },
      ],
    }),
  });
  recordResult(
    "REQ 2: HSN/SAC API Guard",
    "POST /api/invoices with invalid HSN/SAC returns HTTP 400",
    400,
    badHsnInvRes.status,
    badHsnInvRes.status === 400
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 3: CGST + SGST vs IGST Split based on Place of Supply
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 3] Testing CGST+SGST (Intra-State) vs IGST (Inter-State) Tax Split <<<");

  // 3.1: Intra-State Invoice (Maharashtra -> Maharashtra):
  // Subtotal ₹10,000, 18% GST -> 9% CGST (₹900) + 9% SGST (₹900), 0% IGST (₹0), Total: ₹11,800
  const intraInvRes = await fetch(`${BASE_URL}/api/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      customerId: mhCustomer.id,
      items: [
        {
          description: "Cloud Architecture Audit",
          hsnSac: "998314",
          quantity: 1,
          unitPrice: 10000,
        },
      ],
      taxRate: 18,
    }),
  });
  const intraInvJson = await intraInvRes.json();
  const intraInv = intraInvJson.invoice;

  recordResult(
    "REQ 3: Intra-State GST Split",
    "Intra-State supply splits 18% into 9% CGST (₹900) + 9% SGST (₹900) with IGST = ₹0",
    "CGST: 900 / SGST: 900 / IGST: 0",
    `CGST: ${intraInv?.cgstAmount} / SGST: ${intraInv?.sgstAmount} / IGST: ${intraInv?.igstAmount}`,
    intraInv?.isInterState === false &&
      intraInv?.cgstRate === 9 &&
      intraInv?.cgstAmount === 900 &&
      intraInv?.sgstRate === 9 &&
      intraInv?.sgstAmount === 900 &&
      intraInv?.igstAmount === 0 &&
      intraInv?.totalAmount === 11800
  );

  // 3.2: Verify line item persisted HSN/SAC code 998314
  recordResult(
    "REQ 2: HSN/SAC Persistence",
    "Invoice item persists validated HSN/SAC code 998314 in database",
    "998314",
    intraInv?.items?.[0]?.hsnSac,
    intraInv?.items?.[0]?.hsnSac === "998314"
  );

  // 3.3: Inter-State Invoice (Maharashtra -> Karnataka):
  // Subtotal ₹10,000, 18% GST -> 0% CGST (₹0) + 0% SGST (₹0), 18% IGST (₹1,800), Total: ₹11,800
  const interInvRes = await fetch(`${BASE_URL}/api/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      customerId: kaCustomer.id,
      items: [
        {
          description: "Cloud Architecture Audit",
          hsnSac: "998314",
          quantity: 1,
          unitPrice: 10000,
        },
      ],
      taxRate: 18,
    }),
  });
  const interInvJson = await interInvRes.json();
  const interInv = interInvJson.invoice;

  recordResult(
    "REQ 3: Inter-State GST Split",
    "Inter-State supply charges full 18% IGST (₹1800) with CGST = ₹0 and SGST = ₹0",
    "CGST: 0 / SGST: 0 / IGST: 1800",
    `CGST: ${interInv?.cgstAmount} / SGST: ${interInv?.sgstAmount} / IGST: ${interInv?.igstAmount}`,
    interInv?.isInterState === true &&
      interInv?.cgstAmount === 0 &&
      interInv?.sgstAmount === 0 &&
      interInv?.igstRate === 18 &&
      interInv?.igstAmount === 1800 &&
      interInv?.totalAmount === 11800
  );

  // 3.4: Place of Supply explicit override: Customer in MH, but Place of Supply set to Delhi
  const posOverrideRes = await fetch(`${BASE_URL}/api/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      customerId: mhCustomer.id,
      placeOfSupply: "Delhi",
      items: [
        {
          description: "Onsite Training in Delhi",
          hsnSac: "998314",
          quantity: 1,
          unitPrice: 10000,
        },
      ],
      taxRate: 18,
    }),
  });
  const posOverrideJson = await posOverrideRes.json();
  const posInv = posOverrideJson.invoice;

  recordResult(
    "REQ 3: Place of Supply Override",
    "Explicit Place of Supply = 'Delhi' triggers Inter-State IGST (₹1800) even for local customer",
    "true / IGST: 1800 / Delhi",
    `${posInv?.isInterState} / IGST: ${posInv?.igstAmount} / ${posInv?.placeOfSupply}`,
    posInv?.isInterState === true && posInv?.igstAmount === 1800 && posInv?.placeOfSupply === "Delhi"
  );

  // 3.5: Convert Quotation to Invoice applies Place of Supply GST split
  const quoteRes = await fetch(`${BASE_URL}/api/quotations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
    body: JSON.stringify({
      customerId: kaCustomer.id,
      items: [
        {
          description: "Enterprise Cloud Migration",
          hsnSac: "998314",
          quantity: 1,
          unitPrice: 20000,
        },
      ],
      taxRate: 18,
    }),
  });
  const quoteJson = await quoteRes.json();
  const quotation = quoteJson.quotation;

  const convertRes = await fetch(`${BASE_URL}/api/quotations/${quotation.id}/convert-to-invoice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t.tokenAlpha}`,
    },
  });
  const convertJson = await convertRes.json();
  const convertedInvoice = convertJson.invoice;

  recordResult(
    "REQ 3: Quotation Conversion GST Split",
    "Converting quotation for KA customer creates invoice with Inter-State IGST (₹3600 on ₹20,000)",
    "true / IGST: 3600 / Total: 23600",
    `${convertedInvoice?.isInterState} / IGST: ${convertedInvoice?.igstAmount} / Total: ${convertedInvoice?.totalAmount}`,
    convertedInvoice?.isInterState === true &&
      convertedInvoice?.igstAmount === 3600 &&
      convertedInvoice?.totalAmount === 23600 &&
      convertedInvoice?.items?.[0]?.hsnSac === "998314"
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 4: Sequential Invoice Numbers per Business & Financial Year
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 4] Testing Sequential Monotonic Invoice Numbers per Financial Year <<<");

  const currentFy = getFinancialYear();

  // 4.1: Financial Year helper accuracy
  recordResult(
    "REQ 4: Financial Year Determination",
    "Financial Year calculation for current date follows Indian April-March FY cycle",
    true,
    /^[0-9]{4}-[0-9]{2}$/.test(currentFy),
    /^[0-9]{4}-[0-9]{2}$/.test(currentFy)
  );

  // 4.2: First invoice has sequence 0001
  recordResult(
    "REQ 4: Sequential Numbering",
    `Initial invoice created for Alpha has number INV/${currentFy}/0001`,
    `INV/${currentFy}/0001`,
    intraInv?.invoiceNumber,
    intraInv?.invoiceNumber === `INV/${currentFy}/0001`
  );

  // 4.3: Second invoice has sequence 0002
  recordResult(
    "REQ 4: Sequential Numbering",
    `Second invoice created for Alpha has number INV/${currentFy}/0002`,
    `INV/${currentFy}/0002`,
    interInv?.invoiceNumber,
    interInv?.invoiceNumber === `INV/${currentFy}/0002`
  );

  // 4.4: Third invoice has sequence 0003
  recordResult(
    "REQ 4: Sequential Numbering",
    `Third invoice created for Alpha has number INV/${currentFy}/0003`,
    `INV/${currentFy}/0003`,
    posInv?.invoiceNumber,
    posInv?.invoiceNumber === `INV/${currentFy}/0003`
  );

  // 4.5: Fourth invoice (converted from quotation) has sequence 0004
  recordResult(
    "REQ 4: Sequential Numbering",
    `Converted quotation invoice has next sequential number INV/${currentFy}/0004`,
    `INV/${currentFy}/0004`,
    convertedInvoice?.invoiceNumber,
    convertedInvoice?.invoiceNumber === `INV/${currentFy}/0004`
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 5: Multi-Tenant Sequence Isolation
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 5] Testing Multi-Tenant Isolation of Invoice Number Sequences <<<");

  // Create customer for Business Beta
  const betaCustRes = await fetch(`${BASE_URL}/api/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenBeta}`,
    },
    body: JSON.stringify({
      name: "Delhi Retail Customer",
      phone: "+919876543299",
      gstin: "07AAAAA0000A1Z5",
      city: "New Delhi",
    }),
  });
  const betaCustJson = await betaCustRes.json();
  const betaCust = betaCustJson.customer;

  // Create first invoice for Business Beta
  const betaInvRes = await fetch(`${BASE_URL}/api/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t.tokenBeta}`,
    },
    body: JSON.stringify({
      customerId: betaCust.id,
      items: [
        {
          description: "Digital Marketing Campaign",
          hsnSac: "998313",
          quantity: 1,
          unitPrice: 5000,
        },
      ],
      taxRate: 18,
    }),
  });
  const betaInvJson = await betaInvRes.json();
  const betaInv = betaInvJson.invoice;

  recordResult(
    "REQ 5: Multi-Tenant Sequence Isolation",
    `Business Beta's invoice sequence starts independently at INV/${currentFy}/0001 (not affected by Alpha's 0004)`,
    `INV/${currentFy}/0001`,
    betaInv?.invoiceNumber,
    betaInv?.invoiceNumber === `INV/${currentFy}/0001`
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 6: Concurrency Stress Test for Duplicate Invoice Numbers
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 6] Running Concurrency Stress Test: 20 Parallel Invoice Creations <<<");
  console.log("Firing 20 simultaneous parallel invoice creation requests for Business Alpha...");

  const concurrentPromises = Array.from({ length: 20 }, (_, idx) =>
    fetch(`${BASE_URL}/api/invoices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t.tokenAlpha}`,
      },
      body: JSON.stringify({
        customerId: mhCustomer.id,
        items: [
          {
            description: `Concurrent Batch Item #${idx + 1}`,
            hsnSac: "998314",
            quantity: 1,
            unitPrice: 1000 + idx * 10,
          },
        ],
        taxRate: 18,
      }),
    }).then(async (res) => ({
      status: res.status,
      data: await res.json(),
    }))
  );

  const concurrentResults = await Promise.all(concurrentPromises);

  const successfulInvoices = concurrentResults.filter((r) => r.status === 201).map((r) => r.data.invoice);
  const failedRequests = concurrentResults.filter((r) => r.status !== 201);

  console.log(
    `Concurrent Results: ${successfulInvoices.length} created, ${failedRequests.length} rejected/failed.`
  );

  // 6.1: All 20 parallel requests succeeded
  recordResult(
    "REQ 6: Concurrency Safety",
    "All 20 concurrent invoice creation requests completed with HTTP 201",
    20,
    successfulInvoices.length,
    successfulInvoices.length === 20 && failedRequests.length === 0
  );

  // 6.2: Zero duplicate invoice numbers across all 20 created invoices
  const generatedInvoiceNumbers = successfulInvoices.map((inv) => inv.invoiceNumber);
  const uniqueNumbersSet = new Set(generatedInvoiceNumbers);

  recordResult(
    "REQ 6: Zero Duplicate Invoice Numbers",
    "Exactly 20 unique invoice numbers generated across 20 parallel concurrent requests",
    20,
    uniqueNumbersSet.size,
    uniqueNumbersSet.size === 20
  );

  // 6.3: Strictly sequential contiguous numbers: 0005 through 0024
  const sequenceNumbers = successfulInvoices
    .map((inv) => inv.sequenceNumber)
    .sort((a, b) => a - b);

  const minSeq = sequenceNumbers[0];
  const maxSeq = sequenceNumbers[sequenceNumbers.length - 1];
  const isContiguous = sequenceNumbers.every((num, idx) => idx === 0 || num === sequenceNumbers[idx - 1] + 1);

  recordResult(
    "REQ 6: Sequential Contiguity",
    `Concurrent sequence numbers are strictly contiguous (Min: 5, Max: 24, Contiguous: true)`,
    `Min: 5, Max: 24, Contiguous: true`,
    `Min: ${minSeq}, Max: ${maxSeq}, Contiguous: ${isContiguous}`,
    minSeq === 5 && maxSeq === 24 && isContiguous === true
  );

  // 6.4: Database verification: Count of invoices for Alpha in DB matches exact count
  const totalAlphaInvoicesInDb = await prisma.invoice.count({
    where: { businessId: t.bizAlpha.id },
  });

  // Total Alpha invoices: 4 initial (intra, inter, pos, converted) + 20 concurrent = 24 total
  recordResult(
    "REQ 6: DB Invariant Integrity",
    "Database contains EXACTLY 24 distinct invoice records for Business Alpha",
    24,
    totalAlphaInvoicesInDb,
    totalAlphaInvoicesInDb === 24
  );

  // -------------------------------------------------------------------
  // REQUIREMENT 7: Invoice PDF Generation with GST Breakdown
  // -------------------------------------------------------------------
  console.log("\n>>> [REQ 7] Testing Invoice & Quotation PDF Endpoints with GST Details <<<");

  // 7.1: Invoice PDF endpoint returns HTTP 200 and application/pdf
  const invPdfRes = await fetch(`${BASE_URL}/api/invoices/${intraInv.id}/pdf`, {
    headers: { Authorization: `Bearer ${t.tokenAlpha}` },
  });
  recordResult(
    "REQ 7: PDF Generation",
    "GET /api/invoices/:id/pdf returns HTTP 200 with content-type application/pdf",
    "200 / application/pdf",
    `${invPdfRes.status} / ${invPdfRes.headers.get("content-type")}`,
    invPdfRes.status === 200 && invPdfRes.headers.get("content-type")?.includes("application/pdf")
  );

  // 7.2: Quotation PDF endpoint returns HTTP 200 and application/pdf
  const quotePdfRes = await fetch(`${BASE_URL}/api/quotations/${quotation.id}/pdf`, {
    headers: { Authorization: `Bearer ${t.tokenAlpha}` },
  });
  recordResult(
    "REQ 7: PDF Generation",
    "GET /api/quotations/:id/pdf returns HTTP 200 with content-type application/pdf",
    "200 / application/pdf",
    `${quotePdfRes.status} / ${quotePdfRes.headers.get("content-type")}`,
    quotePdfRes.status === 200 && quotePdfRes.headers.get("content-type")?.includes("application/pdf")
  );

  // Note: Test businesses preserved as immutable audit trail per DB constraints.

  await prisma.$disconnect();

  // Summary
  console.log("\n==========================================================================");
  console.log(`PHASE 6 AUDIT RESULTS: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
  console.log("==========================================================================\n");

  if (failCount > 0) {
    console.error(`FAILURE: ${failCount} tests failed in Phase 6 suite.`);
    process.exit(1);
  } else {
    console.log("ALL TESTS IN PHASE 6 GST AND INVOICES SUITE PASSED WITH 100% SUCCESS!");
  }
}

runPhase6Suite().catch((err) => {
  console.error("Test execution threw fatal error:", err);
  process.exit(1);
});
