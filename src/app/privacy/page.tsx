import React from "react";
import Link from "next/link";
import { Shield, ArrowLeft, Lock, FileText, CheckCircle2, AlertCircle } from "lucide-react";

export const metadata = {
  title: "Privacy Policy | BusinessOS AI",
  description: "Privacy Policy compliant with the Digital Personal Data Protection Act, 2023 (DPDP Act, India).",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Shield className="h-5 w-5" />
            </div>
            <span className="font-bold text-lg text-white">BusinessOS AI</span>
          </div>
          <Link
            href="/login"
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Login
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-medium text-indigo-400 mb-4">
            <Lock className="h-3.5 w-3.5" /> India DPDP Act 2023 Compliance
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Privacy Policy & Data Protection Notice
          </h1>
          <p className="mt-3 text-slate-400 text-sm">
            Effective Date: November 13, 2026 • Governed by the Digital Personal Data Protection Act, 2023 (DPDP Act) of India
          </p>
        </div>

        <div className="space-y-8 text-slate-300 leading-relaxed text-sm">
          {/* Section 1 */}
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
              1. Introduction & Data Fiduciary Details
            </h2>
            <p>
              This Privacy Policy explains how <strong>BusinessOS AI</strong> and each subscribing business operating as a{" "}
              <strong>Data Fiduciary</strong> collect, process, store, and protect digital personal data of customers, clients,
              and users (collectively, <strong>Data Principals</strong>) under India’s Digital Personal Data Protection Act,
              2023.
            </p>
          </section>

          {/* Section 2 */}
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
              2. Categories of Personal Data Processed
            </h2>
            <p className="mb-3">We process only personal data strictly necessary for providing business services:</p>
            <ul className="list-disc pl-5 space-y-2 text-slate-400">
              <li>
                <strong className="text-slate-200">Contact & Identity Data:</strong> Name, phone number, email address, physical delivery/billing address, and company name.
              </li>
              <li>
                <strong className="text-slate-200">Statutory Tax Identifiers:</strong> Goods and Services Tax Identification Number (GSTIN) and Place of Supply state codes for tax invoicing.
              </li>
              <li>
                <strong className="text-slate-200">Transaction & Billing Data:</strong> Quotations, tax invoices, sequential invoice numbers, amounts, payment receipts, and settlement timestamps via regulated payment gateways (Razorpay).
              </li>
              <li>
                <strong className="text-slate-200">Appointment Data:</strong> Booked services, appointment date/time in UTC, and staff service notes.
              </li>
              <li>
                <strong className="text-slate-200">Communications:</strong> Inbound and outbound customer service messages exchanged over authorized WhatsApp channels (Meta Cloud API).
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
              3. Lawful Grounds & Purposes of Processing
            </h2>
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-xl">
                <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Contract Performance
                </h3>
                <p className="mt-2 text-xs text-slate-400">
                  Processing appointments, issuing service estimates, delivering customer support on WhatsApp, and scheduling appointments.
                </p>
              </div>
              <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-xl">
                <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Statutory Obligation
                </h3>
                <p className="mt-2 text-xs text-slate-400">
                  Generating GST-compliant tax invoices, calculating CGST/SGST/IGST, preserving tax records under Section 36 of the CGST Act 2017.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
              4. Data Principal Rights (Under DPDP Act 2023)
            </h2>
            <p className="mb-4">As a Data Principal, you are entitled to exercise the following rights:</p>
            <div className="space-y-3">
              <div className="border-l-2 border-indigo-500 pl-4 py-1">
                <h4 className="font-semibold text-white text-xs">Right to Access and Data Portability</h4>
                <p className="text-xs text-slate-400 mt-1">
                  You can request a machine-readable export of all your personal data, invoices, appointments, and communication logs at any time via <code>GET /api/customers/:id/export</code>.
                </p>
              </div>
              <div className="border-l-2 border-indigo-500 pl-4 py-1">
                <h4 className="font-semibold text-white text-xs">Right to Correction and Updating</h4>
                <p className="text-xs text-slate-400 mt-1">
                  You have the right to correct inaccurate or incomplete personal data held by your service provider.
                </p>
              </div>
              <div className="border-l-2 border-indigo-500 pl-4 py-1">
                <h4 className="font-semibold text-white text-xs">Right to Erasure & Anonymization</h4>
                <p className="text-xs text-slate-400 mt-1">
                  You may request deletion of your personal data. Where statutory tax and accounting laws mandate retaining issued tax invoices (72 months under GST rules), all personal identifiers (name, phone, email, notes, communication content) are scrubbed and anonymized.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
              5. Technical Security & Protection Measures
            </h2>
            <ul className="list-disc pl-5 space-y-2 text-slate-400">
              <li>
                <strong className="text-slate-200">Cryptographic Credential Encryption:</strong> Third-party integration tokens and API secrets are encrypted using authenticated AES-256-GCM symmetric encryption.
              </li>
              <li>
                <strong className="text-slate-200">Append-Only Audit Logging:</strong> Critical business activities and data modifications are logged in an immutable, append-only ledger protected by database constraints.
              </li>
              <li>
                <strong className="text-slate-200">Strict Multi-Tenant Isolation:</strong> Data rows are partition-isolated by <code>businessId</code> with automated authorization enforcement on every API route.
              </li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
              6. Grievance Redressal Officer
            </h2>
            <p className="text-slate-400">
              If you have any questions, concerns, or requests regarding the processing of your personal data or wish to exercise your rights under the DPDP Act, please contact our designated Data Protection & Grievance Officer:
            </p>
            <div className="mt-4 p-4 rounded-xl bg-slate-800/30 border border-slate-800 text-xs text-slate-300 space-y-1">
              <div><strong>Grievance Officer:</strong> Data Protection Cell, BusinessOS AI</div>
              <div><strong>Email:</strong> privacy@businessos.ai</div>
              <div><strong>Jurisdiction:</strong> Mumbai, Maharashtra, Republic of India</div>
              <div><strong>Response Window:</strong> Within 7 business days as prescribed under applicable regulations.</div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
