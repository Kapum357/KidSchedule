/**
 * KidSchedule – Calendar Page (Month View)
 *
 * A Next.js Server Component that renders a full-month custody calendar with
 * events, transitions, and request overlays. Matches the v2 reference design:
 * sidebar wizard CTA, data-driven pending requests, custody-key legend with
 * icon guide, side-by-side split custody cells, and a mobile FAB.
 */

import { CalendarMonthEngine } from "@/lib/calendar-engine";
import { CalendarWeekEngine } from "@/lib/calendar-week-engine";
import { CalendarListEngine } from "@/lib/calendar-list-engine";
import { SchedulePresets } from "@/lib/custody-engine";
import { generateCompleteSchedule } from "@/lib/schedule-generator";
import { ScheduleOverrideEngine } from "@/lib/schedule-override-engine";
import { ensureParentExists } from "@/lib/parent-setup-engine";
import { db } from "@/lib/persistence";
import { ThemeToggle } from "@/app/theme-toggle";
import { NotificationButton } from "@/components/notification-button";
import { MobileNavOverlay } from "@/components/mobile-nav-overlay";
import { AppNavSidebar } from "@/components/app-nav-sidebar";
import { CalendarFeedSubscription } from "@/app/calendar/calendar-feed-subscription";
import { CalendarDayCell } from "@/components/calendar-day-cell";
import { CalendarViewSwitcher } from "@/components/calendar-view-switcher";
import { CalendarWeekGrid } from "@/components/calendar-week-grid";
import { CalendarListView } from "@/components/calendar-list-view";
import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type {
  CalendarMonthData,
  TransitionListItem,
} from "@/lib/calendar-engine";
import type { CalendarWeekData } from "@/lib/calendar-week-engine";
import type { CalendarListData } from "@/lib/calendar-list-engine";
import type {
  CalendarEvent,
  Child,
  ConfirmationStatus,
  CustodySchedule,
  EventCategory,
  Family,
  Parent,
  ScheduleChangeRequest,
  ScheduleOverride,
} from "@/lib";
import type {
  DbCalendarEvent,
  DbChild,
  DbFamily,
  DbParent,
  DbScheduleChangeRequest,
  DbScheduleOverride,
} from "@/lib/persistence/types";
import { SchedulePattern } from "@/lib";

// ─── Search Params ───────────────────────────────────────────────────────────

type CalendarViewMode = "month" | "week" | "list";

type CalendarSearchParams = {
  year?: string;
  month?: string;
  mode?: string; // "month" | "week" | "list"
};

const EVENT_CATEGORIES = new Set<EventCategory>([
  "custody",
  "school",
  "medical",
  "activity",
  "holiday",
  "other",
]);

function parseEventCategory(raw: string): EventCategory {
  return EVENT_CATEGORIES.has(raw as EventCategory)
    ? (raw as EventCategory)
    : "other";
}

function parseConfirmationStatus(raw: string): ConfirmationStatus {
  if (raw === "confirmed" || raw === "pending" || raw === "declined") {
    return raw;
  }
  return "pending";
}

function isYearParam(value: string): value is `${number}` {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100;
}

function isMonthParam(value: string): value is `${number}` {
  if (!/^\d{1,2}$/.test(value)) return false;
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

function isViewMode(value: string | undefined): value is CalendarViewMode {
  return value === "month" || value === "week" || value === "list";
}

function buildCalendarUrl(params: {
  year: number;
  month: number;
  mode?: CalendarViewMode;
  day?: number;
}): string {
  const query = new URLSearchParams();
  query.set("year", String(params.year));
  query.set("month", String(params.month));
  if (params.mode && params.mode !== "month") {
    query.set("mode", params.mode);
  }
  if (params.day) {
    query.set("day", String(params.day));
  }
  return `/calendar?${query.toString()}`;
}

// ─── Data Mappers ─────────────────────────────────────────────────────────────

function mapParent(row: DbParent): Parent {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl ?? undefined,
    phone: row.phone ?? undefined,
  };
}

function mapChild(row: DbChild): Child {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth,
    avatarUrl: row.avatarUrl ?? undefined,
  };
}

function resolveScheduleBlocks(
  scheduleId: string | null | undefined,
  parents: [Parent, Parent]
) {
  const [primary, secondary] = parents;
  switch (scheduleId) {
    case "alternating-weeks":
      return SchedulePresets.alternatingWeeks(primary.id, secondary.id);
    case "3-4-4-3":
      return SchedulePresets.threeFourFourThree(primary.id, secondary.id);
    case "2-2-3":
    default:
      return SchedulePresets.twoTwoThree(primary.id, secondary.id);
  }
}

function formatScheduleName(scheduleId: string | null | undefined): string {
  switch (scheduleId) {
    case "alternating-weeks":
      return "Alternating Weeks";
    case "3-4-4-3":
      return "3-4-4-3 Rotation";
    case "2-2-3":
      return "2-2-3 Rotation";
    default:
      return "Family Schedule";
  }
}

function mapScheduleIdToPattern(scheduleId: string | null | undefined): SchedulePattern {
  switch (scheduleId) {
    case "alternating-weeks":
      return SchedulePattern.SEVEN_SEVEN;
    case "3-4-4-3":
      return SchedulePattern.FIVE_TWO_TWO_FIVE; // Closest match
    case "2-2-3":
    default:
      return SchedulePattern.TWO_TWO_THREE;
  }
}

function buildFamilySchedule(
  dbFamily: DbFamily,
  parents: [Parent, Parent]
): CustodySchedule {
  return {
    id: dbFamily.scheduleId || "family-schedule",
    name: formatScheduleName(dbFamily.scheduleId),
    transitionHour: 17,
    blocks: resolveScheduleBlocks(dbFamily.scheduleId, parents),
  };
}

function mapFamilyParents(rows: DbParent[]): [Parent, Parent] {
  const sorted = rows
    .slice()
    .sort((a, b) => {
      if (a.role === b.role) return a.name.localeCompare(b.name);
      if (a.role === "primary") return -1;
      if (b.role === "primary") return 1;
      return a.name.localeCompare(b.name);
    })
    .map(mapParent);

  if (sorted.length < 2) {
    throw new Error("Family must have at least two parents for calendar rendering.");
  }
  return [sorted[0], sorted[1]] as [Parent, Parent];
}

function mapCalendarEvent(row: DbCalendarEvent): CalendarEvent {
  return {
    id: row.id,
    familyId: row.familyId,
    title: row.title,
    description: row.description ?? undefined,
    category: parseEventCategory(row.category),
    startAt: row.startAt,
    endAt: row.endAt,
    allDay: row.allDay,
    location: row.location ?? undefined,
    parentId: row.parentId ?? undefined,
    confirmationStatus: parseConfirmationStatus(row.confirmationStatus),
    createdBy: row.createdBy,
  };
}

function mapChangeRequest(row: DbScheduleChangeRequest): ScheduleChangeRequest {
  return {
    id: row.id,
    familyId: row.familyId,
    requestedBy: row.requestedBy,
    title: row.title,
    description: row.description ?? undefined,
    givingUpPeriodStart: row.givingUpPeriodStart,
    givingUpPeriodEnd: row.givingUpPeriodEnd,
    requestedMakeUpStart: row.requestedMakeUpStart,
    requestedMakeUpEnd: row.requestedMakeUpEnd,
    status: row.status as ScheduleChangeRequest["status"],
    createdAt: row.createdAt,
    respondedAt: row.respondedAt ?? undefined,
    responseNote: row.responseNote ?? undefined,
  };
}

function mapScheduleOverride(row: DbScheduleOverride): ScheduleOverride {
  return {
    id: row.id,
    familyId: row.familyId,
    type: row.overrideType,
    title: row.title,
    description: row.description ?? undefined,
    effectiveStart: row.effectiveStart,
    effectiveEnd: row.effectiveEnd,
    custodianParentId: row.custodianParentId,
    sourceEventId: row.sourceEventId ?? undefined,
    sourceRequestId: row.sourceRequestId ?? undefined,
    sourceMediationId: row.sourceMediationId ?? undefined,
    priority: row.priority,
    status: row.status as ScheduleOverride["status"],
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    notes: row.notes ?? undefined,
  };
}

// ─── Sidebar: Upcoming Transition Item ────────────────────────────────────────

function UpcomingTransitionItem({
  item,
  parentColor,
}: Readonly<{
  item: TransitionListItem;
  parentColor: "primary" | "secondary";
}>) {
  const isIncoming = parentColor === "primary";
  return (
    <div
      className={`relative pl-4 border-l-2 ${
        isIncoming ? "border-primary" : "border-secondary"
      }`}
    >
      <button
        className={`bg-slate-50 dark:bg-slate-800 p-3 rounded-r-lg rounded-bl-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
          !isIncoming ? "opacity-80" : ""
        }`}
        aria-label={`${isIncoming ? "Drop-off" : "Pick-up"} on ${item.label} at ${item.timeStr}`}
      >
        <div className="flex justify-between items-start mb-1">
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${
              isIncoming
                ? "text-primary bg-primary/10"
                : "text-secondary bg-secondary/10"
            }`}
          >
            {item.label}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {item.timeStr}
          </span>
        </div>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {isIncoming ? "Drop-off" : "Pick-up"}
        </p>
        {item.transition.location && (
          <div className="flex items-center gap-1 mt-1 text-xs text-slate-500 dark:text-slate-400">
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
              location_on
            </span>
            <span>{item.transition.location}</span>
          </div>
        )}
      </button>
    </div>
  );
}

// ─── Sidebar: Pending Request Card ────────────────────────────────────────────

function PendingRequestCard({
  request,
  requesterName,
}: Readonly<{
  request: ScheduleChangeRequest;
  requesterName: string;
}>) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 rounded-xl shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full text-amber-600 dark:text-amber-400">
          <span aria-hidden="true" className="material-symbols-outlined text-lg">
            calendar_clock
          </span>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {request.title}
          </p>
          <p className="text-xs text-slate-500">Requested by {requesterName}</p>
        </div>
      </div>
      {request.description && (
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 bg-slate-50 dark:bg-slate-800 p-2 rounded italic">
          &ldquo;{request.description}&rdquo;
        </p>
      )}
      <div className="flex gap-2">
              <Link
                href="/calendar/change-request"
          className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold py-2 rounded-lg hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-900/30 dark:hover:text-rose-400 transition-colors text-center"
        >
          Decline
        </Link>
              <Link
                href="/calendar/change-request"
          className="flex-1 bg-primary text-white text-xs font-bold py-2 rounded-lg hover:opacity-90 transition-colors shadow-sm text-center"
        >
          Approve
        </Link>
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function CalendarSidebar({
  data,
  pendingRequests,
  otherParent,
  familyId,
}: Readonly<{
  data: CalendarMonthData;
  pendingRequests: ScheduleChangeRequest[];
  otherParent: Parent;
  familyId: string;
}>) {
  function requesterName(req: ScheduleChangeRequest): string {
    return req.requestedBy === otherParent.id
      ? otherParent.name.split(" ")[0]
      : "Co-Parent";
  }

  const shownRequests = pendingRequests.slice(0, 2);

  return (
    <aside
      aria-label="Calendar sidebar"
      className="w-full md:w-80 lg:w-96 flex flex-col gap-6 bg-white dark:bg-slate-900 p-6 border-r border-slate-200 dark:border-slate-800 overflow-y-auto"
    >
      {/* Schedule Wizard CTA */}
      <a
        href="/calendar/wizard"
        aria-label="Open Schedule Wizard"
        className="group flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-primary to-blue-600 p-4 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all transform hover:-translate-y-0.5"
      >
        <div className="flex flex-col items-start gap-1">
          <span className="text-white font-bold text-lg">Schedule Wizard</span>
          <span className="text-blue-100 text-xs font-medium">
            Create recurring plan
          </span>
        </div>
        <div className="bg-white/20 rounded-lg p-2 text-white group-hover:bg-white/30 transition-colors">
          <span aria-hidden="true" className="material-symbols-outlined">
            auto_fix_high
          </span>
        </div>
      </a>

      {/* Upcoming Transitions */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-slate-900 dark:text-slate-100 font-bold text-sm uppercase tracking-wider">
            Upcoming Transitions
          </h3>
          <span aria-hidden="true" className="material-symbols-outlined text-slate-400 text-sm">
            swap_driving_apps_wheel
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {data.upcomingTransitions.slice(0, 3).map((item, idx) => (
            <UpcomingTransitionItem
              key={`${item.transition.at.toISOString()}-${idx}`}
              item={item}
              parentColor={
                item.transition.toParent?.id === data.currentParent.id
                  ? "primary"
                  : "secondary"
              }
            />
          ))}
          {data.upcomingTransitions.length === 0 && (
            <p className="text-sm text-slate-400 italic">
              No transitions in the next 14 days.
            </p>
          )}
        </div>
      </div>

      {/* Pending Requests */}
      <div className="flex flex-col gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <Link
            href="/calendar/change-request"
            className="text-slate-900 dark:text-slate-100 font-bold text-sm uppercase tracking-wider hover:text-primary transition-colors"
          >
            Pending Requests
          </Link>
          {shownRequests.length > 0 ? (
            <Link
              href="/calendar/change-request"
              className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full hover:bg-amber-200 transition-colors"
            >
              {shownRequests.length} New
            </Link>
          ) : null}
        </div>
        {shownRequests.length > 0 ? (
          shownRequests.map((req) => (
            <PendingRequestCard
              key={req.id}
              request={req}
              requesterName={requesterName(req)}
            />
          ))
        ) : (
          <p className="text-sm text-slate-400 italic">No pending requests.</p>
        )}
      </div>

      {/* Calendar Feed Subscription */}
      <CalendarFeedSubscription familyId={familyId} />

      {/* Custody Key */}
      <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">
          Custody Key
        </h4>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-primary/20 border border-primary shrink-0" />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              You (Parent A)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-secondary/20 border border-secondary shrink-0" />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {otherParent.name.split(" ")[0]} (Parent B)
            </span>
          </div>
          {/* Icon guide */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <div className="flex items-center gap-1">
              <span aria-hidden="true" className="material-symbols-outlined text-xs text-slate-400">
                attach_money
              </span>
              <span className="text-xs text-slate-500">Expense</span>
            </div>
            <div className="flex items-center gap-1">
              <span aria-hidden="true" className="material-symbols-outlined text-xs text-slate-400">
                schedule
              </span>
              <span className="text-xs text-slate-500">Event</span>
            </div>
            <div className="flex items-center gap-1">
              <span aria-hidden="true" className="material-symbols-outlined text-xs text-slate-400">
                description
              </span>
              <span className="text-xs text-slate-500">Note</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}


// ─── Calendar Grid ────────────────────────────────────────────────────────────

function CalendarGrid({
  data,
  year,
  month,
}: Readonly<{
  data: CalendarMonthData;
  year: number;
  month: number;
}>) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const weekdayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Months for which a day is a "previous-month" padding cell
  const currentMonthStr = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <section
      aria-label="Monthly custody calendar grid"
      className="flex-1 overflow-auto p-8"
    >
      <div className="grid grid-cols-7 gap-4 h-full min-h-[600px]">
        {weekdayHeaders.map((day) => (
          <div
            key={day}
            className="text-center text-sm font-bold text-slate-400 uppercase tracking-wider py-2"
          >
            {day}
          </div>
        ))}

        {data.days.map((day) => (
          <CalendarDayCell
            key={day.dateStr}
            day={day}
            isToday={day.dateStr === todayStr}
            isPrevMonth={!day.dateStr.startsWith(currentMonthStr)}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Page Entry Point ─────────────────────────────────────────────────────────

export default async function CalendarPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<CalendarSearchParams> }>) {

  // ── Parse search params ────────────────────────────────────────────────────
  const resolvedParams = await searchParams;
  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1;

  let year = defaultYear;
  let month = defaultMonth;
  let viewMode: CalendarViewMode = "month";

  const rawYear = resolvedParams?.year;
  const rawMonth = resolvedParams?.month;
  const rawMode = resolvedParams?.mode;

  if (rawYear !== undefined) {
    if (!isYearParam(rawYear)) {
      redirect(buildCalendarUrl({ year: defaultYear, month: defaultMonth }));
    }
    year = Number(rawYear);
  }

  if (rawMonth !== undefined) {
    if (!isMonthParam(rawMonth)) {
      redirect(buildCalendarUrl({ year: defaultYear, month: defaultMonth }));
    }
    month = Number(rawMonth);
  }

  if (rawMode !== undefined && isViewMode(rawMode)) {
    viewMode = rawMode;
  }

  // ── Auth + DB ──────────────────────────────────────────────────────────────
  const user = await requireAuth();
  const parentResult = await ensureParentExists(user.userId);
  const activeParent = parentResult.parent;

  const [dbFamily, dbParents, dbChildren, dbEvents, dbChangeRequests, dbOverrides] =
    await Promise.all([
      db.families.findById(activeParent.familyId),
      db.parents.findByFamilyId(activeParent.familyId),
      db.children.findByFamilyId(activeParent.familyId),
      db.calendarEvents.findByFamilyId(activeParent.familyId),
      db.scheduleChangeRequests.findByFamilyId(activeParent.familyId),
      db.scheduleOverrides.findActiveByFamilyId(activeParent.familyId),
    ]);

  if (!dbFamily) {
    console.error(`No family found for familyId ${activeParent.familyId}`);
  }

  const activeFamily = dbFamily as NonNullable<typeof dbFamily>;
  
  // Ensure at least 2 parents for calendar rendering by adding a placeholder if needed
  const parentsForCalendar = dbParents.length < 2 
    ? [
        ...dbParents,
        {
          id: "secondary-placeholder",
          userId: "secondary-placeholder",
          familyId: activeFamily.id,
          name: "Co-Parent (Pending Setup)",
          email: "secondary@placeholder.local",
          role: "secondary" as const,
          createdAt: new Date().toISOString(),
        } as DbParent,
      ]
    : dbParents;

  const mappedParents = mapFamilyParents(parentsForCalendar);

  // Generate custody schedule using the new generator
  const scheduleInput = {
    family_id: activeFamily.id,
    child_id: dbChildren[0]?.id || "default-child", // Use first child or default
    pattern: mapScheduleIdToPattern(activeFamily.scheduleId),
    timezone: "America/New_York", // Default timezone, could be stored in family
    date_range: {
      start: `${year - 1}-01-01`, // Generate for a wide range to cover the month
      end: `${year + 1}-12-31`,
    },
    anchor: {
      anchor_date: activeFamily.custodyAnchorDate,
      anchor_parent_id: mappedParents[0].id, // Primary parent
      other_parent_id: mappedParents[1].id, // Secondary parent
    },
  };

  const custodyResult = await generateCompleteSchedule(scheduleInput);
  let custodyEvents = custodyResult.events;

  const family: Family = {
    id: activeFamily.id,
    parents: mappedParents,
    children: dbChildren.map(mapChild),
    custodyAnchorDate: activeFamily.custodyAnchorDate,
    schedule: buildFamilySchedule(activeFamily, mappedParents), // Keep for backward compatibility
  };

  // Apply schedule overrides
  if (dbOverrides.length > 0) {
    custodyEvents = ScheduleOverrideEngine.applyOverrides(
      custodyEvents,
      dbOverrides.map(mapScheduleOverride),
    );
  }

  const events = dbEvents.map(mapCalendarEvent);
  const changeRequests = dbChangeRequests
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map(mapChangeRequest);

  const pendingRequests = changeRequests.filter((r) => r.status === "pending");

  // ── Compute calendar ───────────────────────────────────────────────────────
  const engine = new CalendarMonthEngine(family);
  const mappedOverrides = dbOverrides.map(mapScheduleOverride);

  // Always compute month data – needed by the sidebar (transitions, currentParent)
  // and by the month grid view.
  const data: CalendarMonthData = engine.getMonthDataFromEvents(
    year,
    month,
    custodyEvents,
    events,
    changeRequests,
    mappedOverrides,
    now,
  );

  // ── Week view data ─────────────────────────────────────────────────────────
  // Use the first day of the displayed month as the anchor week.
  let weekData: CalendarWeekData | null = null;
  if (viewMode === "week") {
    const referenceDate = new Date(Date.UTC(year, month - 1, 1));
    weekData = CalendarWeekEngine.getWeekDataFromEvents(
      year,
      month,
      referenceDate,
      custodyEvents,
      events,
      changeRequests,
      mappedParents,
      mappedOverrides,
      now,
    );
  }

  // ── List view data ─────────────────────────────────────────────────────────
  let listData: CalendarListData | null = null;
  if (viewMode === "list") {
    const monthPad = String(month).padStart(2, "0");
    const lastDay = new Date(year, month, 0).getDate();
    const monthStart = `${year}-${monthPad}-01`;
    const monthEnd = `${year}-${monthPad}-${String(lastDay).padStart(2, "0")}`;

    const streamEvents = CalendarListEngine.buildEventStream(
      events,
      [],
      changeRequests,
      now,
      monthStart,
      monthEnd,
    );
    const dateGrouping = CalendarListEngine.groupEventsByDate(streamEvents);
    listData = {
      year,
      month,
      events: streamEvents,
      dateGrouping,
      filters: {},
      totalEventCount: streamEvents.length,
      filteredEventCount: streamEvents.length,
      currentParent: mappedParents[0],
      otherParent: mappedParents[1],
    };
  }

  const monthName = new Date(year, month - 1).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });

  const previousMonthDate = new Date(year, month - 2, 1);
  const nextMonthDate = new Date(year, month, 1);
  const todayDate = new Date();

  const otherParent = mappedParents[1];

  return (
    <>
      {/* ── Top Nav Header ────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <MobileNavOverlay
            navItems={[
              { href: "/dashboard", icon: "grid_view", label: "Dashboard" },
              { href: "/calendar", icon: "calendar_month", label: "Calendar", active: true },
              { href: "/expenses", icon: "receipt_long", label: "Expenses" },
              { href: "/messages", icon: "chat", label: "Messages" },
              { href: "/school", icon: "school", label: "School" },
              { href: "/vault", icon: "folder_open", label: "Vault" },
            ]}
            userName={activeParent.name}
            userInitials={activeParent.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
            avatarUrl={activeParent.avatarUrl ?? undefined}
          />
          <div className="size-8 text-primary">
            <svg
              className="w-full h-full"
              fill="none"
              viewBox="0 0 48 48"
              xmlns="http://www.w3.org/2000/svg"
            >
              <g clipPath="url(#clip0_cal)">
                <path
                  d="M42.1739 20.1739L27.8261 5.82609C29.1366 7.13663 28.3989 10.1876 26.2002 13.7654C24.8538 15.9564 22.9595 18.3449 20.6522 20.6522C18.3449 22.9595 15.9564 24.8538 13.7654 26.2002C10.1876 28.3989 7.13663 29.1366 5.82609 27.8261L20.1739 42.1739C21.4845 43.4845 24.5355 42.7467 28.1133 40.548C30.3042 39.2016 32.6927 37.3073 35 35C37.3073 32.6927 39.2016 30.3042 40.548 28.1133C42.7467 24.5355 43.4845 21.4845 42.1739 20.1739Z"
                  fill="currentColor"
                />
                <path
                  clipRule="evenodd"
                  d="M7.24189 26.4066C7.31369 26.4411 7.64204 26.5637 8.52504 26.3738C9.59462 26.1438 11.0343 25.5311 12.7183 24.4963C14.7583 23.2426 17.0256 21.4503 19.238 19.238C21.4503 17.0256 23.2426 14.7583 24.4963 12.7183C25.5311 11.0343 26.1438 9.59463 26.3738 8.52504C26.5637 7.64204 26.4411 7.31369 26.4066 7.24189C26.345 7.21246 26.143 7.14535 25.6664 7.1918C24.9745 7.25925 23.9954 7.5498 22.7699 8.14278C20.3369 9.32007 17.3369 11.4915 14.4142 14.4142C11.4915 17.3369 9.32007 20.3369 8.14278 22.7699C7.5498 23.9954 7.25925 24.9745 7.1918 25.6664C7.14534 26.143 7.21246 26.345 7.24189 26.4066ZM29.9001 10.7285C29.4519 12.0322 28.7617 13.4172 27.9042 14.8126C26.465 17.1544 24.4686 19.6641 22.0664 22.0664C19.6641 24.4686 17.1544 26.465 14.8126 27.9042C13.4172 28.7617 12.0322 29.4519 10.7285 29.9001L21.5754 40.747C21.6001 40.7606 21.8995 40.931 22.8729 40.7217C23.9424 40.4916 25.3821 39.879 27.0661 38.8441C29.1062 37.5904 31.3734 35.7982 33.5858 33.5858C35.7982 31.3734 37.5904 29.1062 38.8441 27.0661C39.879 25.3821 40.4916 23.9425 40.7216 22.8729C40.931 21.8995 40.7606 21.6001 40.747 21.5754L29.9001 10.7285ZM29.2403 4.41187L43.5881 18.7597C44.9757 20.1473 44.9743 22.1235 44.6322 23.7139C44.2714 25.3919 43.4158 27.2666 42.252 29.1604C40.8128 31.5022 38.8165 34.012 36.4142 36.4142C34.012 38.8165 31.5022 40.8128 29.1604 42.252C27.2666 43.4158 25.3919 44.2714 23.7139 44.6322C22.1235 44.9743 20.1473 44.9757 18.7597 43.5881L4.41187 29.2403C3.29027 28.1187 3.08209 26.5973 3.21067 25.2783C3.34099 23.9415 3.8369 22.4852 4.54214 21.0277C5.96129 18.0948 8.43335 14.7382 11.5858 11.5858C14.7382 8.43335 18.0948 5.9613 21.0277 4.54214C22.4852 3.8369 23.9415 3.34099 25.2783 3.21067C26.5973 3.08209 28.1187 3.29028 29.2403 4.41187Z"
                  fill="currentColor"
                  fillRule="evenodd"
                />
              </g>
              <defs>
                <clipPath id="clip0_cal">
                  <rect fill="white" height="48" width="48" />
                </clipPath>
              </defs>
            </svg>
          </div>
          <h2 className="text-slate-900 dark:text-slate-100 text-lg font-bold leading-tight tracking-[-0.015em]">
            KidSchedule
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <NotificationButton initialPendingCount={0} />
          <Link
            href="/settings"
            aria-label="Go to settings"
            className="flex items-center justify-center rounded-lg h-10 w-10 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <span aria-hidden="true" className="material-symbols-outlined">settings</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* ── Body Layout ───────────────────────────────────────────────────── */}
      <main
        id="main-content"
        className="flex-1 flex flex-col md:flex-row overflow-hidden h-[calc(100vh-65px)]"
      >
        <AppNavSidebar
          navItems={[
            { href: "/dashboard", icon: "grid_view", label: "Dashboard" },
            { href: "/calendar", icon: "calendar_month", label: "Calendar", active: true },
            { href: "/expenses", icon: "receipt_long", label: "Expenses" },
            { href: "/messages", icon: "chat", label: "Messages" },
            { href: "/school", icon: "school", label: "School" },
            { href: "/vault", icon: "folder_open", label: "Vault" },
          ]}
          userName={activeParent.name}
          userInitials={activeParent.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
          avatarUrl={activeParent.avatarUrl ?? undefined}
        />
        <CalendarSidebar
          data={data}
          pendingRequests={pendingRequests}
          otherParent={otherParent}
          familyId={activeFamily.id}
        />

        {/* ── Main calendar section ──────────────────────────────────────── */}
        <section className="flex-1 flex flex-col bg-background-light dark:bg-background-dark overflow-hidden relative">
          {/* Calendar controls bar */}
          <div className="flex items-center justify-between px-8 py-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-10">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {monthName}
              </h1>
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                <Link
                  aria-label="Previous month"
                  href={buildCalendarUrl({
                    year: previousMonthDate.getFullYear(),
                    month: previousMonthDate.getMonth() + 1,
                  })}
                  className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded-md shadow-sm transition-all text-slate-600 dark:text-slate-300"
                >
                  <span aria-hidden="true" className="material-symbols-outlined">chevron_left</span>
                </Link>
                <Link
                  aria-label="Next month"
                  href={buildCalendarUrl({
                    year: nextMonthDate.getFullYear(),
                    month: nextMonthDate.getMonth() + 1,
                  })}
                  className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded-md shadow-sm transition-all text-slate-600 dark:text-slate-300"
                >
                  <span aria-hidden="true" className="material-symbols-outlined">chevron_right</span>
                </Link>
              </div>
              <Link
                aria-label="Jump to current month"
                href={buildCalendarUrl({
                  year: todayDate.getFullYear(),
                  month: todayDate.getMonth() + 1,
                })}
                className="text-sm font-bold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
              >
                Today
              </Link>
            </div>

            <div className="flex gap-3">
              {/* View switcher */}
              <CalendarViewSwitcher currentMode={viewMode} year={year} month={month} />
              {/* Change Requests Hub */}
              <Link href="/calendar/change-request"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="material-symbols-outlined text-sm">swap_horiz</span>
                Change Requests
                {pendingRequests.length > 0 && (
                  <span className="bg-amber-100 text-amber-700 text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {pendingRequests.length}
                  </span>
                )}
              </Link>
              {/* New Event */}
              <Link
                href="/calendar/change-request"
                aria-label="Create new event"
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-700 text-white rounded-lg text-sm font-bold hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors shadow-md"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
                New Event
              </Link>
            </div>
          </div>

          {/* Calendar grid - render based on view mode */}
          {viewMode === 'month' && <CalendarGrid data={data} year={year} month={month} />}
          {viewMode === 'week' && weekData && <CalendarWeekGrid data={weekData} year={year} month={month} />}
          {viewMode === 'list' && listData && <CalendarListView data={listData} year={year} month={month} />}

          {/* Mobile FAB */}
          <Link
            href="/calendar/change-request"
            aria-label="Create new event"
            className="md:hidden absolute bottom-6 right-6 w-14 h-14 bg-primary text-white rounded-full shadow-lg flex items-center justify-center z-50 hover:bg-opacity-90 transition-colors"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-3xl">add</span>
          </Link>
        </section>
      </main>
    </>
  );
}
