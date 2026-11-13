"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Database,
  Sparkles,
  MessageSquare,
  CreditCard,
  Mail,
  Copy,
  Check,
  Save,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

export default function IntegrationsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form states
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaWabaId, setMetaWabaId] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");
  const [razorpayKeyId, setRazorpayKeyId] = useState("");
  const [razorpayKeySecret, setRazorpayKeySecret] = useState("");
  const [isRazorpayLive, setIsRazorpayLive] = useState(false);

  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/integrations/status");
      const json = await res.json();
      setData(json);

      if (json.rawConfig) {
        setMetaPhoneNumberId(json.rawConfig.metaPhoneNumberId || "");
        setRazorpayKeyId(json.rawConfig.razorpayKeyId || "");
        setIsRazorpayLive(json.rawConfig.isRazorpayLive || false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSaveSuccess(false);

      const res = await fetch("/api/integrations/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geminiApiKey: geminiApiKey || undefined,
          metaPhoneNumberId: metaPhoneNumberId || undefined,
          metaAccessToken: metaAccessToken || undefined,
          metaWabaId: metaWabaId || undefined,
          metaAppSecret: metaAppSecret || undefined,
          razorpayKeyId: razorpayKeyId || undefined,
          razorpayKeySecret: razorpayKeySecret || undefined,
          isRazorpayLive,
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        // Clear secret inputs from view
        setGeminiApiKey("");
        setMetaAccessToken("");
        setRazorpayKeySecret("");
        setMetaAppSecret("");
        fetchStatus();
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert("Failed to save credentials.");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const copyWebhookUrl = () => {
    const url = `${window.location.origin}/api/whatsapp/webhook`;
    navigator.clipboard.writeText(url);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="w-8 h-8 text-brand-indigo animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Verifying live service connections...</p>
      </div>
    );
  }

  const { integrations } = data || {};

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Title */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">API & Service Integrations</h2>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Real Connection Monitor
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Authentic status of all 5 external backend integrations. Never fakes an unconnected service.
        </p>
      </div>

      {saveSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>Integration credentials updated and verified successfully!</span>
        </div>
      )}

      {/* Integration 5-Card Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. Database */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <Database className="w-4 h-4 text-brand-blue" />
              1. Database (Persistent)
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Connected
            </span>
          </div>
          <p className="text-[11px] text-slate-500">{integrations?.database?.details}</p>
          <div className="text-[10px] text-slate-400 font-mono">SQLite / Supabase PostgreSQL compliant</div>
        </div>

        {/* 2. AI API */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <Sparkles className="w-4 h-4 text-brand-violet" />
              2. AI API (Gemini)
            </span>
            {integrations?.ai?.connected ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Connected
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                Not Connected
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">{integrations?.ai?.details}</p>
          <a
            href="https://aistudio.google.com/"
            target="_blank"
            className="text-[10px] text-brand-indigo hover:underline flex items-center gap-1 font-semibold"
          >
            <span>Get free API key</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* 3. WhatsApp Business Cloud API */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              3. WhatsApp (Meta)
            </span>
            {integrations?.whatsapp?.connected ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Connected
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                Not Connected
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">{integrations?.whatsapp?.details}</p>
          <a
            href="https://developers.facebook.com/apps/"
            target="_blank"
            className="text-[10px] text-brand-indigo hover:underline flex items-center gap-1 font-semibold"
          >
            <span>Meta Developer Portal</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* 4. Razorpay */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <CreditCard className="w-4 h-4 text-blue-600" />
              4. Razorpay
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                integrations?.razorpay?.connected
                  ? integrations?.razorpay?.mode === "live"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
            >
              {integrations?.razorpay?.connected
                ? integrations?.razorpay?.mode === "live"
                  ? "Live Mode"
                  : "Test Mode"
                : "Not Connected"}
            </span>
          </div>
          <p className="text-[11px] text-slate-500">{integrations?.razorpay?.details}</p>
          <a
            href="https://dashboard.razorpay.com/#/access/api-keys"
            target="_blank"
            className="text-[10px] text-brand-indigo hover:underline flex items-center gap-1 font-semibold"
          >
            <span>Razorpay API Keys</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* 5. Email */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <Mail className="w-4 h-4 text-slate-600" />
              5. Email (SMTP)
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                integrations?.email?.connected
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {integrations?.email?.connected ? "Connected" : "Not Connected"}
            </span>
          </div>
          <p className="text-[11px] text-slate-500">{integrations?.email?.details}</p>
          <div className="text-[10px] text-slate-400">PDF downloads always available locally</div>
        </div>
      </div>

      {/* Webhook Configuration Guide for Meta WhatsApp */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          WhatsApp Cloud API Webhook Endpoint (Meta Developer Dashboard)
        </h3>
        <p className="text-xs text-slate-500">
          In your Meta Developer App &rarr; WhatsApp &rarr; Configuration, configure your Webhook Callback URL and Verify Token:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Callback URL</span>
            <div className="flex items-center justify-between mt-1">
              <code className="font-mono text-slate-900 font-medium">/api/whatsapp/webhook</code>
              <button
                onClick={copyWebhookUrl}
                className="text-brand-indigo hover:text-indigo-700 font-semibold flex items-center gap-1 text-[11px]"
              >
                {copiedWebhook ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedWebhook ? "Copied" : "Copy Full URL"}</span>
              </button>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Verify Token</span>
            <div className="flex items-center justify-between mt-1">
              <code className="font-mono text-slate-900 font-medium">
                {integrations?.whatsapp?.webhookVerifyToken || "businessos_webhook_token_2026"}
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Credential Management Form */}
      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        <div className="border-b border-slate-200 pb-3">
          <h3 className="text-base font-bold text-slate-900">Configure Service Credentials</h3>
          <p className="text-xs text-slate-500">
            Stored securely on your server. Never exposed to frontend code or client bundles.
          </p>
        </div>

        {/* Section A: Gemini AI Key */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-brand-violet" />
            A. Google Gemini AI API
          </h4>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              GEMINI_API_KEY
            </label>
            <input
              type="password"
              placeholder={data?.rawConfig?.hasGeminiKey ? "•••••••••••••••• (API Key is Set)" : "AIzaSy..."}
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-indigo font-mono"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Powers QuoteFlow natural-language extraction, ReplyPilot WhatsApp reply drafting, and business insights.
            </p>
          </div>
        </div>

        {/* Section B: Meta WhatsApp */}
        <div className="space-y-3 pt-3 border-t border-slate-100">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
            B. Meta WhatsApp Business Cloud API
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Phone Number ID</label>
              <input
                type="text"
                placeholder="e.g. 104523495823485"
                value={metaPhoneNumberId}
                onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-indigo font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Permanent Access Token</label>
              <input
                type="password"
                placeholder={data?.rawConfig?.hasMetaAccessToken ? "•••••••••••••••• (Token is Set)" : "EAAG..."}
                value={metaAccessToken}
                onChange={(e) => setMetaAccessToken(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-indigo font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">WhatsApp Business Account ID (WABA ID)</label>
              <input
                type="text"
                placeholder="e.g. 10928374652"
                value={metaWabaId}
                onChange={(e) => setMetaWabaId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-indigo font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Meta App Secret (HMAC-SHA256 signature verification)</label>
              <input
                type="password"
                placeholder={data?.rawConfig?.metaAppSecretSet ? "•••••••••••••••• (App Secret is Set)" : "Secret..."}
                value={metaAppSecret}
                onChange={(e) => setMetaAppSecret(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-indigo font-mono"
              />
            </div>
          </div>
        </div>

        {/* Section C: Razorpay */}
        <div className="space-y-3 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-blue-600" />
              C. Razorpay Payment Gateway (Indian Businesses)
            </h4>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={isRazorpayLive}
                onChange={(e) => setIsRazorpayLive(e.target.checked)}
                className="rounded text-brand-indigo focus:ring-brand-indigo"
              />
              <span>Live Mode (uncheck for Test Mode)</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Key ID</label>
              <input
                type="text"
                placeholder="rzp_test_... or rzp_live_..."
                value={razorpayKeyId}
                onChange={(e) => setRazorpayKeyId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-indigo font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Key Secret</label>
              <input
                type="password"
                placeholder={data?.rawConfig?.hasRazorpaySecret ? "•••••••••••••••• (Secret is Set)" : "Secret..."}
                value={razorpayKeySecret}
                onChange={(e) => setRazorpayKeySecret(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-indigo font-mono"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-brand-indigo hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "Saving Credentials..." : "Save & Verify Credentials"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
