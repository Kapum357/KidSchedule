"use client";

import { useState } from "react";
import Link from "next/link";
import type { ParentId, ChangeRequestStatus } from "@/types";

export type RequestSummary = {
  id: string;
  title: string;
  status: ChangeRequestStatus;
  changeType: string;
  requestedBy: ParentId;
  requesterName: string;
  givingUpPeriodStart: string;
  givingUpPeriodEnd: string;
  createdAt: string;
  expiresAt?: string;
};

type Tab = "incoming" | "outgoing" | "history";

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "accepted": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "declined": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "countered": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "withdrawn": return "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300";
    default: return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pending Review",
    accepted: "Accepted",
    declined: "Declined",
    countered: "Counter-Proposed",
    withdrawn: "Withdrawn",
    expired: "Expired",
  };
  return labels[status] ?? status;
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startStr = s.toLocaleDateString("en-US", opts);
  const endStr = e.toLocaleDateString("en-US", opts);
  return start === end ? startStr : `${startStr} – ${endStr}`;
}

function isExpiringSoon(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return diff > 0 && diff < 48 * 60 * 60 * 1000; // 48 hours
}

function RequestCard({ req }: { req: RequestSummary }) {
  const expiring = isExpiringSoon(req.expiresAt);
  return (
    <Link
      href={`/calendar/change-request/${req.id}`}
      className="block p-5 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-primary/40 hover:shadow-md transition-all bg-surface-light dark:bg-surface-dark"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusBadgeClass(req.status)}`}>
          {getStatusLabel(req.status)}
        </span>
        {expiring && (
          <span className="flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
            <span className="material-symbols-outlined text-sm">schedule</span>
            Expires soon
          </span>
        )}
      </div>
      <h3 className="font-bold text-slate-900 dark:text-white mb-1 line-clamp-2">{req.title}</h3>
      <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 mb-2">
        <span className="material-symbols-outlined text-sm">calendar_today</span>
        {formatDateRange(req.givingUpPeriodStart, req.givingUpPeriodEnd)}
      </div>
      <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="material-symbols-outlined text-sm">person</span>
        Requested by {req.requesterName}
      </div>
    </Link>
  );
}

export function RequestsHubClient({
  incoming,
  outgoing,
  history,
}: {
  incoming: RequestSummary[];
  outgoing: RequestSummary[];
  history: RequestSummary[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("incoming");

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "incoming", label: "Incoming", count: incoming.length },
    { id: "outgoing", label: "Outgoing", count: outgoing.length },
    { id: "history", label: "History", count: history.length },
  ];

  const items = activeTab === "incoming" ? incoming : activeTab === "outgoing" ? outgoing : history;

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Request list */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <span className="material-symbols-outlined text-4xl mb-3 block">inbox</span>
          <p className="text-sm">No {activeTab} requests</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((req) => (
            <RequestCard key={req.id} req={req} />
          ))}
        </div>
      )}
    </div>
  );
}
