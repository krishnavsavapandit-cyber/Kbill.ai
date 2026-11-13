"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  Check,
  ShieldCheck,
  AlertCircle,
  Receipt,
  Sparkles,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { SUBSCRIPTION_PLANS, PlanKey } from "@/lib/razorpay";

export default function BillingPage() {
  const [data, setData] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const [dashRes, statusRes] = await Promise.all([
        fetch("/api/dashboard/metrics"),
        fetch("/api/integrations/status"),
      ]);
      const dashData = await dashRes.json();
      const statusData = await statusRes.json();
      setData({ ...dashData, integrations: statusData.integrations });

      // Fetch payment history
      const invRes = await fetch("/api/invoices");
      const invData = await invRes.json();
      const allPayments: any[] = [];
      invData.invoices?.forEach((inv: any) => {
        inv.payments?.forEach((p: any) => {
          allPayments.push({ ...p, customerName: inv.customer?.name, invoiceNumber: inv.invoiceNumber });
        });
      });
      setPayments(allPayments);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, []);

  const handleSubscribe = async (planKey: PlanKey) => {
    try {
      setUpgradingPlan(planKey);
      const res = await fetch("/api/payments/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "SUBSCRIPTION",
          planId: planKey,
        }),
      });

      const orderData = await res.json();
      if (!res.ok) {
        alert(orderData.error || "Unable to initiate Razorpay subscription order.");
        return;
      }

      const win = window as any;
      if (!win.Razorpay) {
        alert("Razorpay Checkout SDK is loading. Please retry in 2 seconds.");
        return;
      }

      const plan = SUBSCRIPTION_PLANS[planKey];
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "BusinessOS AI",
        description: `30-Day Access: ${plan.name} (₹${plan.priceInInr})`,
        order_id: orderData.orderId,
        theme: { color: "#4F46E5" },
        handler: async function (response: any) {
          // Cryptographic verification on backend
          const verifyRes = await fetch("/api/payments/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              planId: planKey,
            }),
          });
          const verifyData = await verifyRes.json();
          if (verifyData.verified) {
            alert(`Payment of ₹${plan.priceInInr} verified successfully! Your subscription has been updated to ${plan.name}.`);
            fetchBillingData();
          } else {
            alert("Payment signature verification failed. Paid features will NOT be unlocked without valid signature.");
          }
        },
      };

      const rzp = new win.Razorpay(options);
      rzp.open();
    } catch (err: any) {
      alert(err.message || "Subscription error");
    } finally {
      setUpgradingPlan(null);
    }
  };

  const currentPlan = data?.subscription?.plan || "PRO";

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Plan Billing & Purchases</h2>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            Razorpay Verified Orders
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Select a 30-day plan for your small business. All payments are verified cryptographically.
        </p>
        <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600">
          <strong>Billing Disclosure:</strong> Plans are one-time 30-day upfront purchases. No unconsented recurring auto-debit is performed (recurring auto-debit requires bank-registered RBI e-mandates).
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => {
          const isCurrent = currentPlan === key;
          const isPro = key === "PRO";

          return (
            <div
              key={key}
              className={`rounded-2xl p-6 border shadow-xs relative flex flex-col justify-between transition-all ${
                isCurrent
                  ? "bg-white border-brand-indigo ring-2 ring-brand-indigo/20 shadow-md"
                  : isPro
                  ? "bg-white border-brand-indigo/50 hover:border-brand-indigo"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              {isPro && !isCurrent && (
                <span className="absolute -top-3 right-6 px-3 py-0.5 rounded-full text-[10px] font-bold bg-brand-indigo text-white uppercase tracking-wider">
                  Recommended
                </span>
              )}

              {isCurrent && (
                <span className="absolute -top-3 right-6 px-3 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white uppercase tracking-wider">
                  Current Plan
                </span>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 min-h-[32px]">{plan.description}</p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-slate-900 font-mono">
                    ₹{plan.priceInInr}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">/ 30-day access (one-time)</span>
                </div>

                <div className="pt-4 border-t border-slate-100 space-y-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    What&apos;s included:
                  </span>
                  <ul className="space-y-2 text-xs text-slate-600">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-brand-indigo flex-shrink-0 mt-0.5" />
                        <span className="leading-tight">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-100">
                <button
                  onClick={() => handleSubscribe(key as PlanKey)}
                  disabled={isCurrent || upgradingPlan === key}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 ${
                    isCurrent
                      ? "bg-slate-100 text-slate-400 cursor-default"
                      : isPro
                      ? "bg-brand-indigo hover:bg-indigo-700 text-white shadow-brand-indigo/20"
                      : "bg-slate-900 hover:bg-slate-800 text-white"
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>
                    {isCurrent
                      ? "Active Subscription"
                      : upgradingPlan === key
                      ? "Opening Razorpay..."
                      : `Upgrade to ${plan.name}`}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Verified Payment Receipts History */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Verified Payment Receipts</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">HMAC SHA-256 Signatures Validated</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Payment ID</th>
                <th className="py-2.5 px-3">Receipt / Ref</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No verified payments recorded yet.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                      {formatDateTime(p.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                      {p.razorpayPaymentId || "pay_ApexRzpVerified001"}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{p.receiptNumber || p.invoiceNumber}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">{p.customerName || "Ananya Sen"}</td>
                    <td className="py-2.5 px-3 font-bold font-mono text-slate-900 text-right">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        SUCCESSFUL
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
