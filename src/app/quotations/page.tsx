"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  Plus,
  Sparkles,
  Download,
  CheckCircle2,
  Clock,
  ArrowRight,
  Trash2,
  CreditCard,
  AlertCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export default function QuotationsPage() {
  const [activeTab, setActiveTab] = useState<"quotations" | "invoices">("quotations");
  const [quotations, setQuotations] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New Quote Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unitPrice: 0, amount: 0 },
  ]);
  const [taxRate, setTaxRate] = useState(18);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Payment valid for 15 days from issue date.");

  // AI Prompt State
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Action Loading
  const [submitting, setSubmitting] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [qRes, invRes, cRes] = await Promise.all([
        fetch("/api/quotations"),
        fetch("/api/invoices"),
        fetch("/api/customers"),
      ]);
      const [qData, invData, cData] = await Promise.all([
        qRes.json(),
        invRes.json(),
        cRes.json(),
      ]);

      setQuotations(qData.quotations || []);
      setInvoices(invData.invoices || []);
      setCustomers(cData.customers || []);
      if (cData.customers?.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(cData.customers[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Update line item
  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    const qty = Number(updated[index].quantity) || 0;
    const price = Number(updated[index].unitPrice) || 0;
    updated[index].amount = Math.round(qty * price * 100) / 100;
    setLineItems(updated);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: "", quantity: 1, unitPrice: 0, amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  // Calculations
  const subtotal = lineItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const totalAmount = Math.max(0, Math.round((subtotal + taxAmount - discountAmount) * 100) / 100);

  // AI Quote Generation
  const handleGenerateAiQuote = async () => {
    if (!aiPrompt.trim()) return;
    try {
      setAiLoading(true);
      setAiError(null);
      const res = await fetch("/api/ai/generate-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || "Failed to generate quotation with AI.");
      } else {
        const quote = data.quotation;
        if (quote.items && quote.items.length > 0) {
          setLineItems(quote.items);
        }
        if (quote.taxRate !== undefined) setTaxRate(quote.taxRate);
        if (quote.discountAmount !== undefined) setDiscountAmount(quote.discountAmount);
        if (quote.notes) setNotes(quote.notes);
        if (quote.terms) setTerms(quote.terms);
      }
    } catch (err: any) {
      setAiError(err.message || "Failed to contact AI service.");
    } finally {
      setAiLoading(false);
    }
  };

  // Submit Quote
  const handleCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      alert("Please select a customer");
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          items: lineItems,
          taxRate,
          discountAmount,
          notes,
          terms,
        }),
      });

      if (res.ok) {
        setShowModal(false);
        fetchData();
        // Reset form
        setLineItems([{ description: "", quantity: 1, unitPrice: 0, amount: 0 }]);
        setAiPrompt("");
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create quote");
      }
    } catch (err: any) {
      alert(err.message || "Error submitting quotation");
    } finally {
      setSubmitting(false);
    }
  };

  // Convert Quotation to Invoice
  const handleConvertToInvoice = async (quoteId: string) => {
    if (!confirm("Convert this quotation into a live invoice? This will assign a formal invoice number and enable payment collection.")) {
      return;
    }
    try {
      setConvertingId(quoteId);
      const res = await fetch(`/api/quotations/${quoteId}/convert-to-invoice`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchData();
        setActiveTab("invoices");
      } else {
        const err = await res.json();
        alert(err.error || "Failed to convert quotation");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setConvertingId(null);
    }
  };

  // Razorpay Checkout for Invoices
  const handlePayInvoice = async (invoice: any) => {
    try {
      const orderRes = await fetch("/api/payments/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "INVOICE",
          invoiceId: invoice.id,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        alert(orderData.error || "Unable to initiate Razorpay payment.");
        return;
      }

      // Check if Razorpay script is loaded on window
      const win = window as any;
      if (!win.Razorpay) {
        alert("Razorpay checkout SDK is loading. Please try again in 2 seconds.");
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Apex Digital Solutions",
        description: `Payment for Invoice ${invoice.invoiceNumber}`,
        order_id: orderData.orderId,
        prefill: {
          name: invoice.customer?.name,
          email: invoice.customer?.email || "",
          contact: invoice.customer?.phone || "",
        },
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
              invoiceId: invoice.id,
            }),
          });
          const verifyData = await verifyRes.json();
          if (verifyData.verified) {
            alert(`Payment of ${formatCurrency(invoice.totalAmount)} verified successfully! Payment ID: ${response.razorpay_payment_id}`);
            fetchData();
          } else {
            alert("Payment signature verification failed. Please contact support.");
          }
        },
      };

      const rzp = new win.Razorpay(options);
      rzp.open();
    } catch (err: any) {
      alert(err.message || "Payment initiation error");
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">QuoteFlow AI</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-indigo/10 text-brand-indigo border border-brand-indigo/20">
              Quotation & Invoicing Engine
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            AI-powered line items, authentic mathematical calculations, and downloadable PDF documents.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-indigo hover:bg-indigo-700 text-white shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Quotation</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("quotations")}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "quotations"
              ? "border-brand-indigo text-brand-indigo"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Quotations ({quotations.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("invoices")}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "invoices"
              ? "border-brand-indigo text-brand-indigo"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Invoices ({invoices.length})</span>
        </button>
      </div>

      {/* Main Table: Quotations Tab */}
      {activeTab === "quotations" && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Quote #</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Issue Date</th>
                  <th className="py-3 px-4">Valid Until</th>
                  <th className="py-3 px-4 text-right">Amount (₹)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {quotations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No quotations found. Click &quot;Create Quotation&quot; to start.
                    </td>
                  </tr>
                ) : (
                  quotations.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{q.quotationNumber}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{q.customer?.name}</div>
                        <div className="text-[10px] text-slate-400">{q.customer?.phone}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(q.issueDate)}</td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(q.validUntil)}</td>
                      <td className="py-3 px-4 font-bold text-slate-900 text-right">
                        {formatCurrency(q.totalAmount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            q.status === "INVOICED"
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : q.status === "ACCEPTED"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : q.status === "SENT"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {q.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`/api/quotations/${q.id}/pdf`}
                            download
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            <span>PDF</span>
                          </a>
                          {q.status !== "INVOICED" && (
                            <button
                              onClick={() => handleConvertToInvoice(q.id)}
                              disabled={convertingId === q.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-brand-indigo hover:bg-indigo-700 text-white text-[11px] font-medium transition-colors disabled:opacity-50"
                            >
                              <span>{convertingId === q.id ? "Converting..." : "Convert to Invoice"}</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoices Tab */}
      {activeTab === "invoices" && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4 text-right">Amount Paid</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No invoices yet. Convert an accepted quotation to generate your first invoice.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{inv.customer?.name}</div>
                        <div className="text-[10px] text-slate-400">{inv.customer?.phone}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(inv.dueDate)}</td>
                      <td className="py-3 px-4 font-bold text-slate-900 text-right">
                        {formatCurrency(inv.totalAmount)}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-emerald-700">
                        {formatCurrency(inv.amountPaid)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            inv.status === "PAID"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`/api/invoices/${inv.id}/pdf`}
                            download
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            <span>PDF</span>
                          </a>
                          {inv.status !== "PAID" && (
                            <button
                              onClick={() => handlePayInvoice(inv)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-colors"
                            >
                              <CreditCard className="w-3 h-3" />
                              <span>Pay with Razorpay</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Create Quotation with AI & Editable Line Items */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Create New Quotation</h3>
                <p className="text-xs text-slate-500">
                  Generate automatically with Gemini AI or manually build line items.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {/* AI Generator Box */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-50/70 to-purple-50/70 border border-indigo-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-brand-indigo flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand-violet" />
                  AI Natural-Language Quote Generator
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 2-hour AI automation workshop with custom WhatsApp onboarding and 1 month priority support"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-brand-indigo bg-white"
                />
                <button
                  type="button"
                  onClick={handleGenerateAiQuote}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="px-3 py-2 rounded-lg bg-brand-indigo text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{aiLoading ? "Generating..." : "Generate Items"}</span>
                </button>
              </div>
              {aiError && (
                <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                  {aiError}
                </p>
              )}
            </div>

            <form onSubmit={handleCreateQuote} className="space-y-4">
              {/* Customer Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Customer *
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-indigo"
                  required
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone}) {c.company ? `— ${c.company}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Line Items Table */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">Line Items *</label>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="text-xs text-brand-indigo hover:text-indigo-700 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                        className="flex-2 px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                        required
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        min="0.1"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(idx, "quantity", e.target.value)}
                        className="w-16 px-2 py-1.5 text-xs rounded border border-slate-300 text-right focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                        required
                      />
                      <input
                        type="number"
                        placeholder="Unit Price"
                        min="0"
                        step="any"
                        value={item.unitPrice}
                        onChange={(e) => updateLineItem(idx, "unitPrice", e.target.value)}
                        className="w-24 px-2 py-1.5 text-xs rounded border border-slate-300 text-right focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                        required
                      />
                      <span className="w-24 text-xs font-mono font-bold text-slate-800 text-right pr-2">
                        ₹{item.amount.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLineItem(idx)}
                        disabled={lineItems.length === 1}
                        className="text-slate-400 hover:text-rose-500 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Calculations Box */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono font-semibold">₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <div className="flex items-center gap-2">
                    <span>Tax (GST %):</span>
                    <input
                      type="number"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                      className="w-14 px-1.5 py-0.5 text-xs border rounded text-right"
                    />
                  </div>
                  <span className="font-mono font-semibold">₹{taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <div className="flex items-center gap-2">
                    <span>Discount (₹):</span>
                    <input
                      type="number"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(Number(e.target.value))}
                      className="w-20 px-1.5 py-0.5 text-xs border rounded text-right"
                    />
                  </div>
                  <span className="font-mono font-semibold text-rose-600">-₹{discountAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Grand Total:</span>
                  <span className="font-mono text-brand-indigo">₹{totalAmount.toFixed(2)}</span>
                </div>
              </div>

              {/* Notes & Terms */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Customer instructions or deliverables..."
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Terms & Conditions</label>
                  <textarea
                    rows={2}
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="Payment terms, validity..."
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold bg-brand-indigo hover:bg-indigo-700 text-white rounded-lg shadow-xs transition-colors disabled:opacity-50"
                >
                  {submitting ? "Saving Quote..." : "Save & Create Quotation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
