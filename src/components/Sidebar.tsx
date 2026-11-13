"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Calendar,
  Users,
  Settings,
  CreditCard,
  ExternalLink,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "QuoteFlow AI", href: "/quotations", icon: FileText, badge: "Quotes & Invoices" },
  { name: "ReplyPilot AI", href: "/whatsapp", icon: MessageSquare, badge: "WhatsApp" },
  { name: "SlotWise AI", href: "/appointments", icon: Calendar, badge: "Bookings" },
  { name: "Customer Hub", href: "/customers", icon: Users },
  { name: "Integrations & API", href: "/settings/integrations", icon: Settings },
  { name: "Subscription", href: "/billing", icon: CreditCard },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-navy-900 border-r border-slate-800 flex flex-col flex-shrink-0 text-slate-300 min-h-screen">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/80">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-blue via-brand-indigo to-brand-violet flex items-center justify-center text-white shadow-md shadow-brand-indigo/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
              BusinessOS <span className="text-xs px-1.5 py-0.5 rounded bg-brand-indigo/30 text-indigo-300 font-semibold border border-brand-indigo/40">AI</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">One workspace. Every customer.</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
          Core Modules
        </div>
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-indigo text-white shadow-sm shadow-brand-indigo/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className={cn("w-4 h-4", isActive ? "text-white" : "text-slate-400")} />
                <span>{item.name}</span>
              </div>
              {item.badge && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-semibold",
                    isActive ? "bg-white/20 text-white" : "bg-slate-800 text-slate-400"
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}

        <div className="pt-4 px-3 pb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
          Customer Portal
        </div>
        <Link
          href="/book/apex-digital"
          target="_blank"
          className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/40 border border-slate-800 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Public Booking Page
          </span>
          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
        </Link>
      </nav>

      {/* Hostile Audit System Health Card */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 m-2 rounded-xl border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            Security Audit
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
            Active Audit
          </span>
        </div>
        <div className="space-y-1.5 text-[11px] text-slate-400">
          <div className="flex items-center justify-between">
            <span>Database:</span>
            <span className="text-emerald-400 font-mono text-[10px]">Isolated Multi-Tenant</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Payments:</span>
            <span className="text-blue-400 font-mono text-[10px]">Razorpay HMAC Verified</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Bookings:</span>
            <span className="text-purple-400 font-mono text-[10px]">Atomic Slots (WAL)</span>
          </div>
        </div>
      </div>

      {/* Business Identity Footer */}
      <div className="p-3 border-t border-slate-800/80 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-brand-indigo/30 border border-brand-indigo/50 flex items-center justify-center font-bold text-xs text-indigo-300">
          OS
        </div>
        <div className="truncate flex-1">
          <p className="text-xs font-semibold text-white truncate">BusinessOS AI</p>
          <p className="text-[10px] text-slate-400 truncate">SaaS Platform</p>
        </div>
      </div>
    </aside>
  );
}
