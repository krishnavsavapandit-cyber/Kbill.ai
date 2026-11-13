"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  IndianRupee,
  Users,
  FileCheck,
  Calendar,
  ArrowUpRight,
  TrendingUp,
  Clock,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  MessageSquare,
  Activity,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insights, setInsights] = useState<any>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/dashboard/metrics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleGenerateInsights = async () => {
    try {
      setInsightsLoading(true);
      setInsightsError(null);
      const res = await fetch("/api/ai/insights", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setInsightsError(json.error || "Failed to generate AI strategic insights.");
      } else {
        setInsights(json.insights);
      }
    } catch (err: any) {
      setInsightsError(err.message || "Failed to contact AI service.");
    } finally {
      setInsightsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="w-8 h-8 text-brand-indigo animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Loading verified business metrics...</p>
      </div>
    );
  }

  const { metrics, upcomingAppointments = [], recentMessages = [], activityLogs = [], subscription } = data || {};

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner with Business Overview & AI Strategic Advisor */}
      <div className="bg-gradient-to-r from-navy-900 via-navy-850 to-slate-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-brand-indigo/30 text-indigo-300 border border-brand-indigo/40">
                Business Operating System
              </span>
              <span className="text-xs text-slate-400 font-mono">Plan: {subscription?.plan || "PRO"}</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Welcome back, Rahul 👋
            </h2>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              One unified workspace connecting your quotations, WhatsApp communications, and appointments.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateInsights}
              disabled={insightsLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-brand-indigo to-brand-violet hover:from-indigo-600 hover:to-violet-700 text-white shadow-md transition-all disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>{insightsLoading ? "Analyzing metrics..." : "Generate AI Insights"}</span>
            </button>
            <Link
              href="/settings/integrations"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Live APIs</span>
            </Link>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute right-0 top-0 w-96 h-96 bg-brand-indigo/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* AI Insights Card (if generated or error) */}
      {insightsError && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-amber-950">AI Configuration Notice</p>
            <p className="mt-0.5 text-amber-800">{insightsError}</p>
            <Link href="/settings/integrations" className="text-brand-indigo font-semibold underline mt-1 inline-block">
              Configure Google Gemini API key in Settings &rarr;
            </Link>
          </div>
        </div>
      )}

      {insights && (
        <div className="p-5 rounded-xl bg-gradient-to-br from-indigo-50/70 to-purple-50/70 border border-indigo-200 text-slate-900 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 text-xs font-bold text-brand-indigo uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-brand-violet" />
              AI Strategic Growth Analysis
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 text-indigo-700">
              {insights.summaryBadge || "Healthy Momentum"}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2 bg-white/80 p-3.5 rounded-lg border border-indigo-100">
              <p className="font-semibold text-slate-900">Revenue Assessment</p>
              <p className="text-slate-600 leading-relaxed">{insights.revenueAssessment}</p>
              <p className="font-semibold text-slate-900 pt-1">Conversion Analysis</p>
              <p className="text-slate-600 leading-relaxed">{insights.quoteConversionRateAnalysis}</p>
            </div>
            <div className="space-y-2 bg-white/80 p-3.5 rounded-lg border border-indigo-100">
              <p className="font-semibold text-slate-900">Key Recommendations</p>
              <ul className="space-y-1.5 list-disc list-inside text-slate-600">
                {insights.actionableRecommendations?.map((rec: string, idx: number) => (
                  <li key={idx} className="leading-relaxed">{rec}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Verified Database Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Verified Revenue */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Verified Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-900">
              {formatCurrency(metrics?.verifiedRevenue || 0)}
            </h3>
            <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              100% verified via Razorpay payments
            </p>
          </div>
        </div>

        {/* Metric 2: Outstanding Invoices */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Outstanding Invoices</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-900">
              {formatCurrency(metrics?.outstandingRevenue || 0)}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              {metrics?.outstandingInvoiceCount || 0} unpaid or due invoices
            </p>
          </div>
        </div>

        {/* Metric 3: Total Customers */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Shared Customers</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-brand-blue flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-900">
              {metrics?.totalCustomers || 0}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              Unified across quotes, chats & bookings
            </p>
          </div>
        </div>

        {/* Metric 4: Quotation Conversion */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Quote Conversion</span>
            <div className="w-8 h-8 rounded-lg bg-violet-50 text-brand-violet flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-900">
              {metrics?.conversionRate || 0}%
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              {metrics?.quotationCount || 0} total quotes ({formatCurrency(metrics?.quotationTotalValue || 0)} quoted)
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Split: Upcoming Appointments & ReplyPilot WhatsApp Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: SlotWise Appointments & QuoteFlow Quick View */}
        <div className="lg:col-span-2 space-y-6">
          {/* SlotWise AI Upcoming Bookings Card */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-brand-indigo flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">SlotWise AI Bookings</h3>
                  <p className="text-[11px] text-slate-500">Real-time appointments with zero double-booking</p>
                </div>
              </div>
              <Link
                href="/appointments"
                className="text-xs font-semibold text-brand-indigo hover:text-indigo-700 flex items-center gap-1"
              >
                <span>View Calendar</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100 mt-2">
              {upcomingAppointments.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No upcoming appointments scheduled.
                </div>
              ) : (
                upcomingAppointments.map((apt: any) => (
                  <div key={apt.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-700">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          {new Date(apt.startTime).toLocaleDateString("en-IN", { month: "short" })}
                        </span>
                        <span className="text-xs font-extrabold text-slate-900 leading-none">
                          {new Date(apt.startTime).getDate()}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-800">{apt.customer?.name}</h4>
                        <p className="text-[11px] text-slate-500">
                          {apt.service?.name} ({apt.service?.durationMinutes} mins)
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {apt.status}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-1 font-mono">
                        {new Date(apt.startTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Activity Log Feed */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Live Business Activity</h3>
                  <p className="text-[11px] text-slate-500">Auditable audit trail of quotations, payments, and chats</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 mt-3">
              {activityLogs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-brand-indigo mt-1.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-slate-800 font-medium">{log.description}</p>
                    <p className="text-[10px] text-slate-400">{formatDateTime(log.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: ReplyPilot AI WhatsApp Inbox Widget */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">ReplyPilot AI</h3>
                  <p className="text-[10px] text-slate-500">Meta WhatsApp Business API</p>
                </div>
              </div>
              <Link
                href="/whatsapp"
                className="text-xs font-semibold text-brand-indigo hover:text-indigo-700 flex items-center gap-1"
              >
                <span>Inbox</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Recent Messages list */}
            <div className="space-y-3 mt-3">
              {recentMessages.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  No WhatsApp messages yet.
                </div>
              ) : (
                recentMessages.map((msg: any) => (
                  <div
                    key={msg.id}
                    className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs text-slate-900">
                        {msg.conversation?.customer?.name || "Customer"}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2">{msg.body}</p>
                    {msg.status === "PENDING_APPROVAL" && (
                      <div className="mt-2 flex items-center justify-between bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        <span className="text-[10px] font-bold text-amber-800 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-600" />
                          AI Draft Ready
                        </span>
                        <Link
                          href="/whatsapp"
                          className="text-[10px] font-semibold text-brand-indigo hover:underline"
                        >
                          Review &rarr;
                        </Link>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100">
              <Link
                href="/whatsapp"
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Open WhatsApp Hub</span>
              </Link>
            </div>
          </div>

          {/* Quick Action Box */}
          <div className="bg-gradient-to-br from-indigo-900 to-navy-900 rounded-xl p-5 text-white shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300">
              Quick Customer Action
            </h4>
            <p className="text-xs text-slate-300 mt-1">
              Need to send a quote or confirm a booking?
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href="/quotations?action=ai"
                className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-brand-indigo hover:bg-indigo-600 text-white text-xs font-semibold transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>AI Quote</span>
              </Link>
              <Link
                href="/book/apex-digital"
                target="_blank"
                className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors border border-white/10"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Booking URL</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
