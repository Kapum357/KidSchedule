/**
 * KidSchedule – Change Requests Hub
 *
 * Shows all schedule change requests for the family organized by status.
 * Incoming: pending requests from co-parent (action required).
 * Outgoing: pending requests you submitted (awaiting response).
 * History: all resolved requests.
 */

import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/app/theme-toggle";
import { RequestsHubClient, type RequestSummary } from "./requests-hub-client";

export const dynamic = "force-dynamic";

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  count,
  icon,
  colorClass,
}: {
  label: string;
  count: number;
  icon: string;
  colorClass: string;
}) {
  return (
    <div className={`bg-surface-light dark:bg-surface-dark rounded-xl border shadow-sm p-5 border-l-4 ${colorClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
        <span className={`material-symbols-outlined text-xl ${colorClass.includes("yellow") ? "text-yellow-500" : colorClass.includes("green") ? "text-green-500" : colorClass.includes("red") ? "text-red-500" : "text-slate-400"}`}>
          {icon}
        </span>
      </div>
      <p className="text-3xl font-bold text-slate-900 dark:text-white">{count}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ChangeRequestsHubPage() {
  const user = await requireAuth();
  const parent = await db.parents.findByUserId(user.userId);
  if (!parent) redirect("/calendar/wizard?onboarding=1");

  const activeParent = parent as NonNullable<typeof parent>;

  const [allRequests, allParents] = await Promise.all([
    db.scheduleChangeRequests.findByFamilyId(activeParent.familyId),
    db.parents.findByFamilyId(activeParent.familyId),
  ]);

  // Build a name lookup map
  const parentNameMap = new Map(allParents.map((p) => [p.id, p.name]));

  // Bucket requests into tabs
  const incoming: RequestSummary[] = allRequests
    .filter((r) => r.requestedBy !== activeParent.id && r.status === "pending")
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      changeType: r.changeType,
      requestedBy: r.requestedBy,
      requesterName: parentNameMap.get(r.requestedBy)?.split(" ")[0] ?? "Co-Parent",
      givingUpPeriodStart: r.givingUpPeriodStart.slice(0, 10),
      givingUpPeriodEnd: r.givingUpPeriodEnd.slice(0, 10),
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    }));

  const outgoing: RequestSummary[] = allRequests
    .filter((r) => r.requestedBy === activeParent.id && r.status === "pending")
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      changeType: r.changeType,
      requestedBy: r.requestedBy,
      requesterName: parentNameMap.get(r.requestedBy)?.split(" ")[0] ?? "You",
      givingUpPeriodStart: r.givingUpPeriodStart.slice(0, 10),
      givingUpPeriodEnd: r.givingUpPeriodEnd.slice(0, 10),
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    }));

  const history: RequestSummary[] = allRequests
    .filter((r) => r.status !== "pending")
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      changeType: r.changeType,
      requestedBy: r.requestedBy,
      requesterName: parentNameMap.get(r.requestedBy)?.split(" ")[0] ?? "Parent",
      givingUpPeriodStart: r.givingUpPeriodStart.slice(0, 10),
      givingUpPeriodEnd: r.givingUpPeriodEnd.slice(0, 10),
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    }));

  // Stat counts
  const acceptedCount = history.filter((r) => r.status === "accepted").length;
  const declinedCount = history.filter((r) => r.status === "declined" || r.status === "withdrawn").length;

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      {/* Nav */}
      <nav className="bg-surface-light dark:bg-surface-dark border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/calendar" className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">swap_horiz</span>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Change Requests</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/calendar/change-request"
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            New Request
          </Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Incoming" count={incoming.length} icon="inbox" colorClass="border-l-yellow-400" />
          <StatCard label="Outgoing" count={outgoing.length} icon="outbox" colorClass="border-l-blue-400" />
          <StatCard label="Accepted" count={acceptedCount} icon="check_circle" colorClass="border-l-green-400" />
          <StatCard label="Declined" count={declinedCount} icon="cancel" colorClass="border-l-red-400" />
        </div>

        {/* Tab list */}
        <RequestsHubClient
          incoming={incoming}
          outgoing={outgoing}
          history={history}
        />
      </main>
    </div>
  );
}
