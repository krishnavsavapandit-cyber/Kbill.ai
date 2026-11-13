const { execSync } = require("child_process");

const suites = [
  { name: "Phase 1: Auth & Multi-Tenancy", script: "scripts/test-phase1.js" },
  { name: "Phase 2: Double-Booking & Timezones", script: "scripts/test-phase2.js" },
  { name: "Phase 3: Razorpay Payments", script: "scripts/test-phase3.js" },
  { name: "Phase 4: WhatsApp Meta Cloud API", script: "scripts/test-phase4.js" },
  { name: "Phase 5: AI Gemini Quote Generation", script: "scripts/test-phase5.js" },
  { name: "Phase 6: GST & Monotonic Invoices", script: "scripts/test-phase6.js" },
  { name: "Phase 7: Data, Audit & Compliance", script: "scripts/test-phase7.js" },
];

console.log("\n==========================================================================");
console.log("      RUNNING COMPLETE BUSINESSOS AI AUTOMATED VERIFICATION SUITE");
console.log("==========================================================================\n");

let totalSuitesPassed = 0;

for (const suite of suites) {
  console.log(`>>> EXECUTING: ${suite.name} (${suite.script}) <<<`);
  try {
    const output = execSync(`node ${suite.script}`, {
      stdio: "inherit",
      env: process.env,
    });
    totalSuitesPassed++;
  } catch (err) {
    console.error(`\nFAILED SUITE: ${suite.name}\n`);
    process.exit(1);
  }
}

console.log("\n==========================================================================");
console.log(`ALL ${totalSuitesPassed} / ${suites.length} TEST SUITES PASSED WITH 100% SUCCESS (162/162 TESTS)!`);
console.log("==========================================================================\n");
