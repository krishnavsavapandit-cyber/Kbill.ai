"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Plus,
  Phone,
  Mail,
  Building,
  FileText,
  Calendar,
  MessageSquare,
  Search,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  // New Customer Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [gstin, setGstin] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/customers");
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    try {
      setSubmitting(true);
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          company: company.trim() || undefined,
          gstin: gstin.trim() || undefined,
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (res.ok) {
        setShowModal(false);
        setName("");
        setPhone("");
        setEmail("");
        setCompany("");
        setGstin("");
        setAddress("");
        setCity("");
        setNotes("");
        fetchCustomers();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create customer");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.company && c.company.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Shared Customer Hub</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-brand-blue border border-blue-200">
              Single Unified Database
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Every customer is interconnected across QuoteFlow AI, ReplyPilot AI, and SlotWise AI.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-indigo hover:bg-indigo-700 text-white shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Search by customer name, phone, or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-indigo"
        />
      </div>

      {/* Customers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-slate-400 bg-white rounded-xl border">
            No customers match your search criteria.
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs hover:border-slate-300 transition-all space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 flex-shrink-0">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">{c.name}</h4>
                    {c.company && (
                      <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                        <Building className="w-3 h-3 text-slate-400" />
                        {c.company}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-xs text-slate-600 pt-1">
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>{c.phone}</span>
                </div>
                {c.email && (
                  <div className="flex items-center gap-2 text-[11px] truncate">
                    <Mail className="w-3 h-3 text-slate-400" />
                    <span className="truncate">{c.email}</span>
                  </div>
                )}
                {c.city && (
                  <div className="text-[10px] text-slate-400 pl-5">
                    {c.city}
                  </div>
                )}
              </div>

              {/* Interconnected Activity Badges */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="font-bold text-slate-900 block">{c._count?.quotations || 0}</span>
                  <span className="text-slate-400">Quotes</span>
                </div>
                <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="font-bold text-slate-900 block">{c._count?.appointments || 0}</span>
                  <span className="text-slate-400">Bookings</span>
                </div>
                <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="font-bold text-slate-900 block">{c._count?.invoices || 0}</span>
                  <span className="text-slate-400">Invoices</span>
                </div>
              </div>

              {/* Direct Module Actions */}
              <div className="flex items-center justify-between pt-1 text-[11px]">
                <Link
                  href={`/whatsapp`}
                  className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
                >
                  <MessageSquare className="w-3 h-3" />
                  <span>Chat on WhatsApp</span>
                </Link>
                <Link
                  href={`/quotations?action=new`}
                  className="text-brand-indigo hover:text-indigo-700 font-semibold flex items-center gap-1"
                >
                  <FileText className="w-3 h-3" />
                  <span>New Quote</span>
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Add New Customer</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikram Malhotra"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 98123 45678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-indigo font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="vikram@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Company</label>
                  <input
                    type="text"
                    placeholder="Malhotra Retail"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">GSTIN</label>
                  <input
                    type="text"
                    placeholder="27AABCA1234F1Z8"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-indigo uppercase font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">City</label>
                  <input
                    type="text"
                    placeholder="Bengaluru"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Address</label>
                  <input
                    type="text"
                    placeholder="Brigade Road"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Internal Notes</label>
                <textarea
                  rows={2}
                  placeholder="Key background, preferred services, or budget..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 font-semibold bg-brand-indigo hover:bg-indigo-700 text-white rounded-lg shadow-xs disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
