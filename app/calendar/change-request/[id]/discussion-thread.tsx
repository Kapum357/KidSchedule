"use client";

import { useState, useTransition, useRef, useEffect } from "react";

type Message = {
  id: string;
  senderName: string;
  senderInitial: string;
  isCurrentUser: boolean;
  body: string;
  createdAt: string;
};

export function DiscussionThread({
  requestId,
  initialMessages,
  isPending,
}: {
  requestId: string;
  initialMessages: Message[];
  isPending: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sendPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const body = draft.trim();
    if (!body || body.length > 2000) return;
    setError(null);

    startTransition(async () => {
      const res = await fetch(
        `/api/calendar/change-requests/${requestId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: body }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to send message");
        return;
      }

      const newMsg = await res.json() as Message;
      setMessages((prev) => [...prev, newMsg]);
      setDraft("");
    });
  }

  return (
    <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/30">
        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-500">forum</span>
          Request Discussion
        </h3>
        <span className="text-xs text-slate-500 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2 py-1 rounded">
          Visible to: Both Parents
        </span>
      </div>

      {/* Messages */}
      <div className="p-6 space-y-6 flex-1 max-h-96 overflow-y-auto custom-scrollbar">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">
            No messages yet. Start the conversation below.
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-4 ${msg.isCurrentUser ? "" : "flex-row-reverse"}`}>
            <div className="flex-shrink-0">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                msg.isCurrentUser
                  ? "bg-primary/20 text-primary"
                  : "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
              }`}>
                {msg.senderInitial.toUpperCase()}
              </div>
            </div>
            <div className="flex-1">
              <div className={`p-4 rounded-2xl text-sm text-slate-800 dark:text-slate-200 leading-relaxed shadow-sm ${
                msg.isCurrentUser
                  ? "bg-blue-50 dark:bg-slate-800 rounded-tl-none"
                  : "bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 rounded-tr-none"
              }`}>
                <p>{msg.body}</p>
              </div>
              <div className={`mt-1 text-xs text-slate-500 ${msg.isCurrentUser ? "ml-2" : "ml-2"}`}>
                {new Date(msg.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })},{" "}
                {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply input */}
      {isPending && (
        <div className="p-4 bg-slate-50 dark:bg-slate-900/30 border-t border-slate-200 dark:border-slate-800">
          {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
          <div className="relative">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none h-24"
              placeholder="Type your reply here..."
              maxLength={2000}
            />
          </div>
          <div className="flex justify-between items-center mt-3">
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">lock</span>
              Encrypted & Auditable
            </div>
            <button
              onClick={sendMessage}
              disabled={sendPending || draft.trim().length === 0}
              className="bg-primary hover:bg-primary-hover text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {sendPending ? "Sending..." : "Send Reply"}
              <span className="material-symbols-outlined text-sm">send</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
