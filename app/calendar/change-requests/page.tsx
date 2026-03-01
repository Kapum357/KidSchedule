/**
 * KidSchedule – Change Requests Hub
 *
 * A Next.js Server Component for managing schedule change requests between co-parents.
 * Provides three views: Pending (awaiting action), History (resolved), with filtering
 * by direction (incoming vs outgoing) inferred from requestedBy comparison.
 *
 * DESIGN RATIONALE:
 * ─────────────────────────────────────────────────────────────────────────────
 * Request lifecycle is simple: PENDING → (ACCEPTED | DECLINED | COUNTERED | EXPIRED)
 *
 * Three-way categorization by requestedBy comparison:
 *   • Incoming: requestedBy ≠ currentUser (from co-parent to you)
 *   • Outgoing: requestedBy = currentUser (from you to co-parent)
 *   • History: any status ≠ "pending"
 *
 * Direction inferred at render-time rather than stored in DB, reducing schema
 * complexity and preventing stale direction values if ownership changes.
 *
 * Response notes (responseNote field) kept separate from description, allowing
 * declined/countered requests to explain reasoning without mutation.
 *
 * PERFORMANCE CHARACTERISTICS:
 * ─────────────────────────────────────────────────────────────────────────────
 * • Request fetch: O(1) DB lookup by familyId (indexed query)
 * • Filtering & direction detection: O(R) where R = requests per family (~10-50)
 * • Sorting by createdAt: O(R log R) but only done once per page load
 * • Page load timing: Dominated by DB query roundtrip (5-50ms), not compute
 * • Total: O(R log R) for requests processing, negligible vs I/O
 */

import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/app/theme-toggle";
import type { Parent, ScheduleChangeRequest } from "@/types";
import type { DbParent } from "@/lib/persistence/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChangeRequestsSearchParams = {
  tab?: string;
};

interface ProcessedRequest {
  request: ScheduleChangeRequest;
  isIncoming: boolean;
  dateRangeDisplay: string;
  makeUpDisplay: string;
  submittedDisplay: string;
  statusTone: "pending" | "success" | "declined" | "muted";
  statusLabel: string;
  requesterName: string;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function mapParent(row: DbParent): Parent {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl ?? undefined,
    phone: row.phone ?? undefined,
  };
}

function formatDateRange(startStr: string, endStr: string): string {
  const start = new Date(startStr + "T00:00:00Z");
  const end = new Date(endStr + "T00:00:00Z");
  const startFormatted = start.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  const endFormatted = end.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startFormatted} – ${endFormatted}`;
}

function formatDateRelative(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const daysAgo = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo < 7) return `${daysAgo}d ago`;
  if (daysAgo < 30)
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function getStatusTone(
  status: ScheduleChangeRequest["status"]
): "pending" | "success" | "declined" | "muted" {
  switch (status) {
    case "pending":
      return "pending";
    case "accepted":
      return "success";
    case "declined":
      return "declined";
    default:
      return "muted";
  }
}

function getStatusLabel(status: ScheduleChangeRequest["status"]): string {
  switch (status) {
    case "pending":
      return "Pending Review";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "countered":
      return "Counter-Proposed";
    case "expired":
      return "Expired";
    case "draft": { throw new Error('Not implemented yet: "draft" case') }
  }
}

function resolveTab(value: string | undefined): "pending" | "history" {
  return value === "history" ? "history" : "pending";
}

// ─── Sidebar Component ─────────────────────────────────────────────────────────

function ChangeRequestsSidebar({
  pendingCount,
  currentParent,
}: Readonly<{
  pendingCount: number;
  currentParent: Parent;
}>) {
  return (
    <aside className="hidden w-64 border-r border-slate-200 bg-surface-light dark:border-slate-800 dark:bg-surface-dark lg:flex lg:flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 p-6">
        <div className="rounded-lg bg-primary/20 p-2">
          <span className="material-symbols-outlined text-2xl text-primary">
            family_restroom
          </span>
        </div>
        <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          KidSchedule
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-4">
        <Link
          href="/calendar"
          className="flex items-center gap-3 rounded-lg px-4 py-3 text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <span className="material-symbols-outlined">calendar_month</span>
          <span>Calendar</span>
        </Link>

        <Link
          href="/calendar/change-requests"
          className="flex items-center gap-3 rounded-lg bg-primary/10 px-4 py-3 font-medium text-primary"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            swap_horiz
          </span>
          <span>Requests</span>
          {pendingCount > 0 && (
            <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">
              {pendingCount}
            </span>
          )}
        </Link>

        <Link
          href="/messages"
          className="flex items-center gap-3 rounded-lg px-4 py-3 text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <span className="material-symbols-outlined">chat</span>
          <span>Messages</span>
        </Link>

        <Link
          href="/expenses"
          className="flex items-center gap-3 rounded-lg px-4 py-3 text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <span className="material-symbols-outlined">receipt_long</span>
          <span>Expenses</span>
        </Link>
      </nav>

      {/* User Profile */}
      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            <span className="material-symbols-outlined">person</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
              {currentParent.name}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              Co-Parent
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Request Cards ────────────────────────────────────────────────────────────

function PendingRequestCard({
  processed,
}: Readonly<{
  processed: ProcessedRequest;
}>) {
  const statusColorMap = {
    pending: "border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20",
    success: "border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
    declined:
      "border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20 opacity-75",
    muted: "border-l-4 border-slate-400 bg-slate-50 dark:bg-slate-800/30",
  };

  return (
    <article
      className={`rounded-xl p-6 shadow-sm ${statusColorMap[processed.statusTone]}`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {processed.isIncoming ? "Incoming" : "Outgoing"}
          </p>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {processed.request.title}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {processed.isIncoming
              ? `From ${processed.requesterName}`
              : "Awaiting response"}
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {processed.statusLabel}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-white/70 p-3 dark:bg-slate-900/30">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Giving Up
          </p>
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            {processed.dateRangeDisplay}
          </p>
        </div>

        {processed.request.requestedMakeUpStart && (
          <div className="rounded-lg bg-white/70 p-3 dark:bg-slate-900/30">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Requesting
            </p>
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {processed.makeUpDisplay}
            </p>
          </div>
        )}
      </div>

      {processed.request.description && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-sm italic text-slate-600 dark:text-slate-300">
            &quot;{processed.request.description}&quot;
          </p>
        </div>
      )}

      {processed.request.responseNote && (
        <div className="mb-4 rounded-lg border border-slate-300 bg-white p-3 dark:border-slate-600 dark:bg-slate-900/50">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Response:
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {processed.request.responseNote}
          </p>
        </div>
      )}

      {processed.request.status === "pending" && processed.isIncoming && (
        <div className="flex gap-3 border-t border-slate-300 pt-4 dark:border-slate-700">
          <button className="flex-1 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
            Decline
          </button>
          <button className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover">
            Accept Request
          </button>
        </div>
      )}
    </article>
  );
}

function HistoryRequestCard({
  processed,
}: Readonly<{
  processed: ProcessedRequest;
}>) {
  return (
    <article className="rounded-xl border border-slate-200 bg-surface-light p-6 shadow-sm dark:border-slate-800 dark:bg-surface-dark">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {processed.request.title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {processed.submittedDisplay}
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {processed.statusLabel}
        </span>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        {processed.dateRangeDisplay}
      </p>

      {processed.request.responseNote && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
            {processed.request.status === "declined" ? "Reason:" : "Response:"}
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {processed.request.responseNote}
          </p>
        </div>
      )}
    </article>
  );
}

// ─── Page Entry Point ──────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export default async function ChangeRequestsPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<ChangeRequestsSearchParams> }>) {
  // ── Auth & DB ──────────────────────────────────────────────────────────────
  const user = await requireAuth();
  const parent = await db.parents.findByUserId(user.userId);
  if (!parent) redirect("/calendar/wizard?onboarding=1");

  const activeParent = parent as NonNullable<typeof parent>;

  const [dbParents, dbChangeRequests] = await Promise.all([
    db.parents.findByFamilyId(activeParent.familyId),
    db.scheduleChangeRequests.findByFamilyId(activeParent.familyId),
  ]);

  if (dbParents.length < 2) {
    redirect("/calendar/wizard?onboarding=1");
  }

  const mappedParents = dbParents.map(mapParent);
  const otherParent = mappedParents.find((p) => p.id !== activeParent.id)!;

  // ── Process Requests ───────────────────────────────────────────────────────
  const processedRequests = dbChangeRequests.map((req): ProcessedRequest => {
    const isIncoming = req.requestedBy !== activeParent.id;
    const requestStatus = req.status as ScheduleChangeRequest["status"];

    return {
      request: {
        ...req,
        status: requestStatus,
      },
      isIncoming,
      dateRangeDisplay: formatDateRange(
        req.givingUpPeriodStart,
        req.givingUpPeriodEnd,
      ),
      makeUpDisplay: req.requestedMakeUpStart
        ? formatDateRange(req.requestedMakeUpStart, req.requestedMakeUpEnd)
        : "",
      submittedDisplay: formatDateRelative(req.createdAt),
      statusTone: getStatusTone(requestStatus),
      statusLabel: getStatusLabel(requestStatus),
      requesterName: isIncoming ? otherParent.name.split(" ")[0] : "You",
    };
  });

  const resolvedParams = await searchParams;
  const activeTab = resolveTab(resolvedParams?.tab);

  const pendingRequests = processedRequests.filter(
    (p) => p.request.status === "pending"
  );
  const historyRequests = processedRequests.filter(
    (p) => p.request.status !== "pending"
  );
  const displayRequests =
    activeTab === "pending" ? pendingRequests : historyRequests;

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      <ChangeRequestsSidebar
        pendingCount={pendingRequests.length}
        currentParent={mappedParents[0]}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-surface-light px-8 dark:border-slate-800 dark:bg-surface-dark">
          <div className="flex items-center gap-4 lg:hidden">
            <button className="text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              Requests
            </span>
          </div>

          <h1 className="hidden text-2xl font-bold text-slate-900 dark:text-white lg:block">
            Schedule Changes
          </h1>

          <div className="flex items-center gap-3">
            <Link
              href="/calendar/change-request"
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              <span className="hidden sm:inline">New Request</span>
            </Link>
            <ThemeToggle />
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-background-light p-6 dark:bg-background-dark lg:p-8">
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Tabs */}
            <div className="border-b border-slate-200 dark:border-slate-800">
              <nav className="-mb-px flex space-x-8">
                <Link
                  href="/calendar/change-requests?tab=pending"
                  className={`whitespace-nowrap border-b-2 py-4 text-sm font-medium transition-colors ${
                    activeTab === "pending"
                      ? "border-primary text-primary"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
                  }`}
                >
                  Pending
                  {pendingRequests.length > 0 && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {pendingRequests.length}
                    </span>
                  )}
                </Link>

                <Link
                  href="/calendar/change-requests?tab=history"
                  className={`whitespace-nowrap border-b-2 py-4 text-sm font-medium transition-colors ${
                    activeTab === "history"
                      ? "border-primary text-primary"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
                  }`}
                >
                  History
                </Link>
              </nav>
            </div>

            {/* Requests List */}
            <div className="space-y-4">
              {displayRequests.length === 0 ? (
                <div className="text-center py-12">
                  <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-700 mb-4 block">
                    {activeTab === "pending"
                      ? "inbox_customize"
                      : "history_toggle_off"}
                  </span>
                  <p className="text-slate-500 dark:text-slate-400">
                    {activeTab === "pending"
                      ? "No pending requests"
                      : "No request history"}
                  </p>
                </div>
              ) : (
                displayRequests.map((processed) =>
                  activeTab === "pending" ? (
                    <PendingRequestCard
                      key={processed.request.id}
                      processed={processed}
                    />
                  ) : (
                    <HistoryRequestCard
                      key={processed.request.id}
                      processed={processed}
                    />
                  )
                )
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
