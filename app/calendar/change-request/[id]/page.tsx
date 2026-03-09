/**
 * KidSchedule – Change Request Detail Page
 *
 * A Next.js Server Component for viewing a single schedule change request with
 * full discussion thread, original vs proposed schedule comparison, and real-time
 * AI tone analysis for replies.
 */

import { db } from "@/lib/persistence";
import { ensureParentExists } from "@/lib/parent-setup-engine";
import { requireAuth } from "@/lib";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/app/theme-toggle";
import type { Parent, ScheduleChangeRequest } from "@/types";
import type { DbParent } from "@/lib/persistence/types";
import { ActionButtons } from "./action-buttons";
import { DiscussionThread } from "./discussion-thread";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleBlock {
  date: string;
  dayOfWeek: string;
  dayOfMonth: number;
  parentName: string;
  parentColor: "blue" | "purple";
  custody: string;
  time?: string;
}

interface TimelineStep {
  step: number;
  label: string;
  status: "complete" | "active" | "pending";
  timestamp?: string;
}

// ─── Labels (centralized to avoid duplicated string literals) ───────────────
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
  accepted: "Accepted",
  declined: "Declined",
  countered: "Counter-Proposed",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

const TIMELINE_LABELS = {
  submitted: "Submitted",
  created: "Created",
  pendingReview: "Pending Review",
  reviewed: "Reviewed",
  finalized: "Finalized",
  accepted: "Accepted",
  declined: "Declined",
} as const;

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

function generateScheduleBlocks(
  startDate: string,
  endDate: string,
  parentName: string,
  parentColor: "blue" | "purple",
  custody: string,
): ScheduleBlock[] {
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  const blocks: ScheduleBlock[] = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Generate blocks for each day in range
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    blocks.push({
      date: dateStr,
      dayOfWeek: dayNames[d.getUTCDay()],
      dayOfMonth: d.getUTCDate(),
      parentName,
      parentColor,
      custody,
    });
  }

  return blocks;
}

function getTimelineSteps(
  status: ScheduleChangeRequest["status"],
  respondedAt?: string,
): TimelineStep[] {
  const isResolved = status !== "pending";
  const isAccepted = status === "accepted";

  const steps: TimelineStep[] = [
    {
      step: 1,
      label: TIMELINE_LABELS.submitted,
      status: "complete",
      timestamp: TIMELINE_LABELS.created,
    },
    {
      step: 2,
      label: TIMELINE_LABELS.pendingReview,
      status: isResolved ? "complete" : "active",
      timestamp: respondedAt ? TIMELINE_LABELS.reviewed : undefined,
    },
    {
      step: 3,
      label: TIMELINE_LABELS.finalized,
      status: isResolved ? "complete" : "pending",
      timestamp: isAccepted ? TIMELINE_LABELS.accepted : TIMELINE_LABELS.declined,
    },
  ];

  return steps;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString + "T00:00:00Z");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getStatusBadgeClass(status: ScheduleChangeRequest["status"]): string {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "accepted":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "declined":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "countered":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    default:
      return "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300";
  }
}

function getStatusLabel(status: ScheduleChangeRequest["status"]): string {
  return STATUS_LABELS[status] ?? String(status);
}

function getPendingTimelinePercent(steps: TimelineStep[]): number {
  const pendingIdx = steps.findIndex((s) => s.status === "pending");
  if (pendingIdx <= 0) {
    return 100;
  }
  return (pendingIdx / (steps.length - 1)) * 100;
}

function getTimelineStepDotClasses(step: TimelineStep): string {
  const baseClasses = "w-8 h-8 rounded-full flex items-center justify-center text-white ring-4";

  if (step.status === "complete") {
    return `${baseClasses} bg-primary ring-white dark:ring-surface-dark`;
  }

  if (step.status === "active") {
    return `${baseClasses} bg-primary ring-white dark:ring-surface-dark shadow-md`;
  }

  return `${baseClasses} bg-slate-200 dark:bg-slate-700 ring-white dark:ring-surface-dark text-slate-500`;
}

// ─── Timeline Step Dot Component ──────────────────────────────────────────────

function TimelineStepDot({ step }: Readonly<{ step: TimelineStep }>) {
  return (
    <div className={getTimelineStepDotClasses(step)}>
      {step.status === "complete" ? (
        <span className="material-symbols-outlined text-sm font-bold">
          check
        </span>
      ) : (
        <span className="text-xs font-bold">{step.step}</span>
      )}
    </div>
  );
}

// ─── Request Sidebar Component ─────────────────────────────────────────────────

function RequestSidebar({
  requests,
  currentId,
}: Readonly<{
  requests: Array<{
    id: string;
    title: string;
    status: ScheduleChangeRequest["status"];
    submitter: string;
    createdAt: string;
  }>;
  currentId: string;
}>) {
  return (
    <aside className="hidden lg:flex lg:w-80 lg:flex-col border-r border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark">
      {/* Search Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-black/20 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Requests
          </h2>
          <button className="text-primary hover:text-primary-hover p-1 rounded hover:bg-primary/10 transition-colors">
            <span className="material-symbols-outlined">filter_list</span>
          </button>
        </div>
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">
            search
          </span>
          <input
            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary"
            placeholder="Search requests..."
            type="text"
          />
        </div>
      </div>

      {/* Request List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {requests.map((req) => (
          <Link
            key={req.id}
            href={`/calendar/change-request/${req.id}`}
            className={`p-4 border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-l-4 ${
              currentId === req.id
                ? "border-l-primary bg-primary/5"
                : "border-l-transparent"
            }`}
          >
            <div className="flex justify-between items-start mb-1">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded ${getStatusBadgeClass(req.status)}`}
              >
                {getStatusLabel(req.status)}
              </span>
              <span className="text-xs text-slate-500">
                {formatDateTime(req.createdAt)}
              </span>
            </div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1 line-clamp-1">
              {req.title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-2">
              {/* Would display description here */}
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="material-symbols-outlined text-sm">person</span>
              Requested by {req.submitter}
            </div>
          </Link>
        ))}
      </div>

      {/* New Request Button */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <Link
          href="/calendar/change-request"
          className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white py-2.5 rounded-lg font-semibold transition-colors shadow-sm"
        >
          <span className="material-symbols-outlined text-lg">add_circle</span>
          New Request
        </Link>
      </div>
    </aside>
  );
}

// ─── Page Entry Point ──────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export default async function ChangeRequestDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  // ── Auth & Get Request ──────────────────────────────────────────────────────
  const user = await requireAuth();
  const parentResult = await ensureParentExists(user.userId);
  const activeParent = parentResult.parent;

  const resolvedParams = await params;
  const requestId = resolvedParams.id;

  const [dbRequest, dbParents, dbOtherRequests, dbMessages] = await Promise.all([
    db.scheduleChangeRequests.findById(requestId),
    db.parents.findByFamilyId(activeParent.familyId),
    db.scheduleChangeRequests.findByFamilyId(activeParent.familyId),
    db.changeRequestMessages.findByRequestId(requestId),
  ]);

  if (!dbRequest) {
    redirect("/calendar/change-request");
  }

  if (dbRequest.familyId !== activeParent.familyId) {
    redirect("/calendar/change-request");
  }

  if (dbParents.length < 2) {
    console.error(`Not enough parents found for familyId ${activeParent.familyId}`);
  }

  const mappedParents = dbParents.map(mapParent);

  const threadMessages = dbMessages.map((m) => ({
    id: m.id,
    senderName: mappedParents.find((p) => p.id === m.senderParentId)?.name ?? "Parent",
    senderInitial: mappedParents.find((p) => p.id === m.senderParentId)?.name?.charAt(0) || "?",
    isCurrentUser: m.senderParentId === activeParent.id,
    body: m.body,
    createdAt: m.createdAt,
  }));

  const requester = mappedParents.find((p) => p.id === dbRequest.requestedBy);
  const otherParent = mappedParents.find(
    (p) => p.id !== activeParent.id
  );
  const currentParentName = mappedParents.find(
    (p) => p.id === activeParent.id
  )?.name;

  const isRequester = dbRequest.requestedBy === activeParent.id;

  // ── Build Request List for Sidebar ─────────────────────────────────────────
  const sidebarRequests = dbOtherRequests.map((req) => ({
    id: req.id,
    title: req.title,
    status: req.status as ScheduleChangeRequest["status"],
    submitter: mappedParents.find((p) => p.id === req.requestedBy)?.name.split(" ")[0] || "Co-Parent",
    createdAt: req.createdAt,
  }));

  // ── Build Schedule Blocks ──────────────────────────────────────────────────
  const originalBlocks = generateScheduleBlocks(
    dbRequest.givingUpPeriodStart,
    dbRequest.givingUpPeriodEnd,
    currentParentName || "Parent A",
    "blue",
    "Original"
  );

  const proposedBlocks = dbRequest.requestedMakeUpStart
    ? generateScheduleBlocks(
        dbRequest.requestedMakeUpStart,
        dbRequest.requestedMakeUpEnd,
        otherParent?.name || "Parent B",
        "purple",
        "Proposed"
      )
    : [];

  // ── Build Timeline ────────────────────────────────────────────────────────
  const timeline = getTimelineSteps(
    dbRequest.status as ScheduleChangeRequest["status"],
    dbRequest.respondedAt,
  );

  // ── Build Audit Log ────────────────────────────────────────────────────────
  const auditLog = `REQ-${requestId.split("-")[0].toUpperCase()}-LOG`;

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
      {/* Top Nav */}
      <nav className="hidden lg:flex absolute top-0 left-0 right-0 h-16 items-center justify-between bg-surface-light dark:bg-surface-dark border-b border-slate-200 dark:border-slate-800 px-6 z-20">
        <div className="flex items-center gap-2">
          <div className="bg-primary/20 p-1.5 rounded text-primary">
            <span className="material-symbols-outlined text-2xl">
              family_restroom
            </span>
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">
            KidSchedule
          </span>
        </div>
        <div className="flex items-center gap-4 ml-auto">
          <button className="p-2 text-slate-500 hover:text-primary transition-colors relative">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <ThemeToggle />
        </div>
      </nav>

      {/* Sidebar */}
      <RequestSidebar requests={sidebarRequests} currentId={requestId} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto pt-16 lg:pt-0">
        {/* Header */}
        <header className="bg-surface-light dark:bg-surface-dark border-b border-slate-200 dark:border-slate-800 p-6 sticky top-0 z-10 shadow-sm">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {dbRequest.title}
                </h1>
                <span className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700">
                  ID: #{requestId.slice(0, 8).toUpperCase()}
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Created on {formatDate(dbRequest.createdAt)}
              </p>
            </div>
            <ActionButtons
              requestId={requestId}
              isRequester={isRequester}
              status={dbRequest.status}
            />
          </div>

          {/* Timeline */}
          <div className="relative max-w-3xl">
            <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-200 dark:bg-slate-700 -translate-y-1/2 rounded-full"></div>
            <div
              className="absolute top-1/2 left-0 h-1 bg-primary -translate-y-1/2 rounded-full"
              style={{
                width: `${getPendingTimelinePercent(timeline)}%`,
              }}
            ></div>
            <div className="relative flex justify-between text-sm">
              {timeline.map((step) => (
                <div key={step.step} className="flex flex-col items-center gap-2">
                  <TimelineStepDot step={step} />
                  <span
                    className={`font-medium ${
                      step.status === "active" ? "text-primary font-bold" : ""
                    } ${
                      step.status === "pending"
                        ? "text-slate-500 dark:text-slate-400"
                        : ""
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-6 space-y-6 max-w-6xl mx-auto w-full">
          {/* Schedule Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Original Schedule */}
            <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                <span className="material-symbols-outlined text-slate-400">
                  calendar_today
                </span>
                <h3 className="font-bold text-slate-800 dark:text-slate-200">
                  Original Schedule
                </h3>
              </div>
              <div className="space-y-4">
                {originalBlocks.map((block) => (
                  <div key={block.date} className="flex gap-4">
                    <div className="w-16 flex-shrink-0 text-center">
                      <div className="text-xs text-slate-500 uppercase font-bold">
                        {block.dayOfWeek}
                      </div>
                      <div className="text-xl font-bold text-slate-800 dark:text-white">
                        {block.dayOfMonth}
                      </div>
                    </div>
                    <div className="flex-1 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 p-3 rounded-r text-sm">
                      <div className="font-semibold text-blue-900 dark:text-blue-100">
                        {block.parentName}
                      </div>
                      <div className="text-blue-700 dark:text-blue-300 text-xs mt-1">
                        {block.custody}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Proposed Schedule */}
            <div className="bg-surface-light dark:bg-surface-dark rounded-xl border-2 border-primary/30 p-5 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary text-white text-xs font-bold px-3 py-1 rounded-bl">
                PROPOSAL
              </div>
              <div className="flex items-center gap-2 mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                <span className="material-symbols-outlined text-primary">
                  edit_calendar
                </span>
                <h3 className="font-bold text-primary">Proposed Schedule</h3>
              </div>
              <div className="space-y-4">
                {proposedBlocks.length > 0 ? (
                  proposedBlocks.map((block) => (
                    <div key={block.date} className="flex gap-4">
                      <div className="w-16 flex-shrink-0 text-center">
                        <div className="text-xs text-slate-500 uppercase font-bold">
                          {block.dayOfWeek}
                        </div>
                        <div className="text-xl font-bold text-slate-800 dark:text-white">
                          {block.dayOfMonth}
                        </div>
                      </div>
                      <div className="flex-1 bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-400 p-3 rounded-r text-sm">
                        <div className="font-semibold text-purple-900 dark:text-purple-100">
                          {block.parentName}
                        </div>
                        <div className="text-purple-700 dark:text-purple-300 text-xs mt-1">
                          {block.custody}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No makeup period specified
                  </p>
                )}
                {dbRequest.description && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">
                      info
                    </span>
                    Note: {dbRequest.description}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Discussion Thread */}
          <DiscussionThread
            requestId={requestId}
            initialMessages={threadMessages}
            isPending={dbRequest.status === "pending"}
          />

          {/* Audit Log */}
          <div className="text-center pb-4">
            <p className="text-xs text-slate-400 font-mono">
              Audit Log: {auditLog} • Last updated {formatDateTime(dbRequest.respondedAt || dbRequest.createdAt)}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
