"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Zap, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function Header() {
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState("");

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-10 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Apex Digital Solutions</span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-600 font-mono">{currentTime || "Loading time..."}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Quick Actions */}
        <Link
          href="/quotations?action=new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-indigo hover:bg-indigo-700 text-white shadow-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Quote</span>
        </Link>

        <Link
          href="/appointments?action=new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Book Slot</span>
        </Link>

        <Link
          href="/settings/integrations"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors"
          title="View Integration Connection Status"
        >
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span className="hidden sm:inline">Integrations</span>
        </Link>

        {/* User Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center font-bold text-xs text-slate-700">
            RS
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold text-slate-800 leading-tight">Rahul Sharma</p>
            <p className="text-[10px] text-slate-500">Business Owner</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ml-1"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
