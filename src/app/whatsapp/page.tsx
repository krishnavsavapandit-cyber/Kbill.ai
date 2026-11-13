"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Send,
  Sparkles,
  Check,
  CheckCheck,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Phone,
  User,
  Settings,
  HelpCircle,
} from "lucide-react";
import { formatDateTime, formatTime } from "@/lib/utils";

export default function WhatsAppPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // AI draft reply state
  const [draftingAi, setDraftingAi] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftEditText, setDraftEditText] = useState("");
  const [approving, setApproving] = useState(false);

  // Meta Integration status
  const [metaStatus, setMetaStatus] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = async (convId?: string) => {
    try {
      const url = convId
        ? `/api/whatsapp/messages?conversationId=${convId}`
        : "/api/whatsapp/messages";
      const res = await fetch(url);
      const data = await res.json();
      setConversations(data.conversations || []);
      setActiveConvId(data.activeConversationId || null);
      setMessages(data.messages || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchIntegrationStatus = async () => {
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      setMetaStatus(data.integrations?.whatsapp);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchIntegrationStatus();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSelectConversation = (id: string) => {
    setActiveConvId(id);
    fetchConversations(id);
    setSendError(null);
  };

  // Send Direct Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeConvId) return;

    try {
      setSending(true);
      setSendError(null);
      const res = await fetch("/api/whatsapp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId,
          text: inputText.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error || "Failed to send message via Meta WhatsApp API.");
      } else {
        setInputText("");
        fetchConversations(activeConvId);
      }
    } catch (err: any) {
      setSendError(err.message || "Failed to contact server.");
    } finally {
      setSending(false);
    }
  };

  // Draft AI Reply
  const handleGenerateAiDraft = async () => {
    if (!activeConvId) return;
    try {
      setDraftingAi(true);
      setSendError(null);
      const res = await fetch("/api/ai/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeConvId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error || "AI reply generation failed.");
      } else {
        fetchConversations(activeConvId);
      }
    } catch (err: any) {
      setSendError(err.message);
    } finally {
      setDraftingAi(false);
    }
  };

  // Approve and Send Draft
  const handleApproveDraft = async (draftId: string, text: string) => {
    try {
      setApproving(true);
      setSendError(null);
      const res = await fetch("/api/whatsapp/approve-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftMessageId: draftId,
          editedText: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error || "Failed to send approved message via Meta API.");
      } else {
        setEditingDraftId(null);
        fetchConversations(activeConvId || undefined);
      }
    } catch (err: any) {
      setSendError(err.message);
    } finally {
      setApproving(false);
    }
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);

  return (
    <div className="space-y-4 max-w-7xl mx-auto h-[calc(100vh-6rem)] flex flex-col">
      {/* Top Banner: Real WhatsApp Integration Status */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-xs">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">ReplyPilot AI</h2>
              <span className="text-slate-400">•</span>
              <span className="text-xs text-slate-600 font-medium">Meta WhatsApp Business Cloud API</span>
              {metaStatus?.connected ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Connected Live
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  Not Connected
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {metaStatus?.connected
                ? `Phone Number ID: ${metaStatus.phoneNumberId} • Verified Webhooks Active`
                : "Official Meta credentials needed to transmit live WhatsApp messages. Human-in-the-loop review enabled."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!metaStatus?.connected && (
            <Link
              href="/settings/integrations"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-indigo hover:bg-indigo-700 text-white shadow-xs transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Connect Meta Account</span>
            </Link>
          )}
          <button
            onClick={handleGenerateAiDraft}
            disabled={draftingAi || !activeConvId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-xs transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{draftingAi ? "Drafting..." : "AI Reply Suggestion"}</span>
          </button>
        </div>
      </div>

      {/* Main Split Screen Inbox */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex overflow-hidden min-h-0">
        {/* Left: Conversations List */}
        <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/50">
          <div className="p-3 border-b border-slate-200 bg-white">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Conversations ({conversations.length})
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No active WhatsApp conversations.
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectConversation(c.id)}
                  className={`w-full p-3.5 text-left flex items-start gap-3 transition-colors ${
                    activeConvId === c.id
                      ? "bg-indigo-50/80 border-l-4 border-brand-indigo"
                      : "hover:bg-slate-100/60"
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 flex-shrink-0">
                    {c.customer?.name?.slice(0, 2).toUpperCase() || "WA"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{c.customer?.name}</h4>
                      <span className="text-[10px] text-slate-400">
                        {formatTime(c.lastMessageAt)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">
                      {c.lastMessageText || "No messages yet"}
                    </p>
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-brand-indigo text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-1">
                      {c.unreadCount}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Message Thread */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50/30">
          {activeConv ? (
            <>
              {/* Conversation Header */}
              <div className="h-14 bg-white border-b border-slate-200 px-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-indigo/10 text-brand-indigo flex items-center justify-center font-bold text-xs">
                    {activeConv.customer?.name?.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">
                      {activeConv.customer?.name}
                    </h4>
                    <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                      <Phone className="w-2.5 h-2.5 text-slate-400" />
                      {activeConv.customer?.phone}
                      {activeConv.customer?.company && ` • ${activeConv.customer.company}`}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
                    WhatsApp Official Channel
                  </span>
                </div>
              </div>

              {/* Error banner if send failed */}
              {sendError && (
                <div className="bg-amber-50 border-b border-amber-200 p-3 text-xs text-amber-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-amber-950">Message Transmission Notice</p>
                    <p className="text-[11px] text-amber-800">{sendError}</p>
                  </div>
                </div>
              )}

              {/* Messages Area */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {messages.map((msg) => {
                  const isInbound = msg.direction === "INBOUND";
                  const isPendingDraft = msg.status === "PENDING_APPROVAL";

                  if (isPendingDraft) {
                    return (
                      <div
                        key={msg.id}
                        className="bg-gradient-to-br from-amber-50/90 to-indigo-50/90 border border-amber-200 rounded-xl p-4 shadow-xs space-y-2 max-w-lg mx-auto"
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                            <Sparkles className="w-3.5 h-3.5 text-brand-indigo" />
                            AI Reply Draft (Requires Business Owner Approval)
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                            Confidence: {Math.round((msg.aiConfidence || 0.9) * 100)}%
                          </span>
                        </div>

                        {editingDraftId === msg.id ? (
                          <textarea
                            rows={3}
                            value={draftEditText}
                            onChange={(e) => setDraftEditText(e.target.value)}
                            className="w-full p-2 text-xs rounded border border-amber-300 focus:outline-none focus:ring-1 focus:ring-brand-indigo bg-white"
                          />
                        ) : (
                          <p className="text-xs text-slate-800 bg-white/80 p-2.5 rounded border border-amber-100 leading-relaxed whitespace-pre-wrap">
                            {msg.body}
                          </p>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                          {editingDraftId === msg.id ? (
                            <button
                              onClick={() => {
                                handleApproveDraft(msg.id, draftEditText);
                              }}
                              disabled={approving}
                              className="px-3 py-1.5 rounded bg-brand-indigo hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                            >
                              {approving ? "Sending..." : "Approve & Send Live"}
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingDraftId(msg.id);
                                  setDraftEditText(msg.body);
                                }}
                                className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200"
                              >
                                Edit Text
                              </button>
                              <button
                                onClick={() => handleApproveDraft(msg.id, msg.body)}
                                disabled={approving}
                                className="px-3 py-1 rounded bg-brand-indigo hover:bg-indigo-700 text-white text-[11px] font-semibold shadow-xs disabled:opacity-50 flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                <span>{approving ? "Sending..." : "Approve & Send via WhatsApp"}</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isInbound ? "items-start" : "items-end"}`}
                    >
                      <div
                        className={`max-w-md px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                          isInbound
                            ? "bg-white text-slate-900 border border-slate-200/80 rounded-tl-sm"
                            : "bg-brand-indigo text-white rounded-tr-sm"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.body}</p>
                      </div>

                      <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1 px-1">
                        <span>{formatTime(msg.createdAt)}</span>
                        {!isInbound && (
                          <span>
                            {msg.status === "READ" ? (
                              <CheckCheck className="w-3 h-3 text-blue-500 inline" />
                            ) : msg.status === "DELIVERED" ? (
                              <CheckCheck className="w-3 h-3 text-slate-400 inline" />
                            ) : (
                              <Check className="w-3 h-3 text-slate-400 inline" />
                            )}
                          </span>
                        )}
                        {!isInbound && (
                          <span className="text-[9px] text-slate-400 font-mono">
                            {msg.senderType === "AI_ASSISTANT" ? "• AI Sent" : "• Owner"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Bottom Input Area */}
              <form
                onSubmit={handleSendMessage}
                className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="Type official WhatsApp message..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-indigo bg-slate-50/50"
                />
                <button
                  type="submit"
                  disabled={sending || !inputText.trim()}
                  className="p-2.5 rounded-xl bg-brand-indigo hover:bg-indigo-700 text-white shadow-xs transition-colors disabled:opacity-50 flex-shrink-0"
                  title="Send via official Meta WhatsApp API"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs">
              <MessageSquare className="w-10 h-10 text-slate-300 mb-2" />
              <p>Select a conversation from the left to view messages.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
