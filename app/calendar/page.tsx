/**
 * KidSchedule – Calendar Page (Month View)
 *
 * A Next.js Server Component that renders a full-month custody calendar with
 * events, transitions, and request overlays.
 *
 * Once a database layer is added, replace createMockCalendarInput() with
 * real queries and uncomment the async data-fetching section.
 */

import { CalendarMonthEngine } from "@/lib/calendar-engine";
import { SettingsEngine, createMockFamilySettings } from "@/lib/settings-engine";
import { ThemeToggle } from "@/app/theme-toggle";
import { redirect } from "next/navigation";
import type { CalendarMonthData, CalendarDayState, CustodyColor, TransitionListItem } from "@/lib/calendar-engine";
import type { CalendarEvent, Family, Parent, ScheduleChangeRequest, FamilySettings } from "@/types";

// ─── Mock Data (replace with real DB queries in production) ───────────────────

interface CalendarInput {
  family: Family;
  events: CalendarEvent[];
  changeRequests: ScheduleChangeRequest[];
  familySettings: FamilySettings;
}

function createMockCalendarInput(conflictWindowMins: number, now: Date = new Date()): CalendarInput {
  const PARENT_A_ID = "parent-alex-001";
  const PARENT_B_ID = "parent-sarah-002";
  const FAMILY_ID = "family-001";
  const CHILD_ID = "child-emma-001";

  const parentAlex: Parent = {
    id: PARENT_A_ID,
    name: "Alex M.",
    email: "alex@example.com",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAMm9PKE77NmQRxRk8-lRarDuoVKfumrSvirCCC1A-bI8clVSNMQKx4ACuGOkMJh_E_4R-vkLrgaVp-DyFMt5Hk6ZGqn15tajsGHfYRzHlrqJRjiygOAoy_OQA1JOaoLQrL_RX6_PPl7SZ16RDQu9V2DPhgAAf9ioG_LAr-yCPX4bKT4-3Qn-40Q7Zem1C6pZcUwXl_7ORPkJxx2ZQLPcaOYqyOkfTVOMG8NkDh2LrTMf5Q9hZl1NwL_aLAVtgf86GlT7rJ0Cbp_mA",
  };

  const parentSarah: Parent = {
    id: PARENT_B_ID,
    name: "Sarah P.",
    email: "sarah@example.com",
  };

  // Anchor = 12 days ago at 5 PM to put us mid-cycle.
  const anchor = new Date(now);
  anchor.setDate(anchor.getDate() - 12);
  const anchorDate = anchor.toISOString().slice(0, 10);

  const family: Family = {
    id: FAMILY_ID,
    parents: [parentAlex, parentSarah] as [Parent, Parent],
    children: [
      {
        id: CHILD_ID,
        firstName: "Emma",
        lastName: "M.",
        dateOfBirth: "2018-03-14",
      },
    ],
    custodyAnchorDate: anchorDate,
    schedule: {
      id: "sched-001",
      name: "2-2-3 Rotation",
      transitionHour: 17,
      blocks: [
        { parentId: PARENT_A_ID, days: 2, label: "Mon–Tue A" },
        { parentId: PARENT_B_ID, days: 2, label: "Wed–Thu B" },
        { parentId: PARENT_A_ID, days: 3, label: "Fri–Sun A" },
        { parentId: PARENT_B_ID, days: 2, label: "Mon–Tue B" },
        { parentId: PARENT_A_ID, days: 2, label: "Wed–Thu A" },
        { parentId: PARENT_B_ID, days: 3, label: "Fri–Sun B" },
      ],
    },
  };

  const makeDT = (daysFromNow: number, hour = 12): string => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  const events: CalendarEvent[] = [
    {
      id: "evt-001",
      familyId: FAMILY_ID,
      title: "Independence Day",
      category: "holiday",
      startAt: makeDT(3, 0),
      endAt: makeDT(3, 23),
      allDay: true,
      confirmationStatus: "pending",
      createdBy: PARENT_A_ID,
    },
    {
      id: "evt-002",
      familyId: FAMILY_ID,
      title: "Soccer Practice",
      category: "activity",
      startAt: makeDT(7, 16),
      endAt: makeDT(7, 17),
      allDay: false,
      location: "West Field",
      confirmationStatus: "confirmed",
      createdBy: PARENT_B_ID,
    },
    {
      id: "evt-003",
      familyId: FAMILY_ID,
      title: "Emma's Dentist",
      category: "medical",
      startAt: makeDT(14, 10),
      endAt: makeDT(14, 11),
      allDay: false,
      location: "Cedar Dental Clinic",
      confirmationStatus: "confirmed",
      createdBy: PARENT_A_ID,
    },
  ];

  const changeRequests: ScheduleChangeRequest[] = [
    {
      id: "req-001",
      familyId: FAMILY_ID,
      requestedBy: PARENT_B_ID,
      title: "July 4th Weekend Swap",
      description: "Requesting to swap the July 4th weekend.",
      givingUpPeriodStart: makeDT(3),
      givingUpPeriodEnd: makeDT(6),
      requestedMakeUpStart: makeDT(17),
      requestedMakeUpEnd: makeDT(20),
      status: "pending",
      createdAt: makeDT(-1),
    },
  ];

  const familySettings = createMockFamilySettings(FAMILY_ID, conflictWindowMins);

  return { family, events, changeRequests, familySettings };
}

async function updateConflictWindow(formData: FormData): Promise<void> {
  "use server";

  const requestedWindowMins = Number((formData.get("conflictWindowMins") as string | null) ?? "120");
  const settingsEngine = new SettingsEngine();
  const resolved = settingsEngine.resolveFamilySettings("family-demo", {
    conflictWindow: { windowMins: requestedWindowMins },
  });

  // In production: persist resolved.conflictWindow.windowMins by authenticated familyId.
  const params = new URLSearchParams();
  params.set("conflictWindowMins", String(resolved.conflictWindow.windowMins));
  redirect(`/calendar?${params.toString()}`);
}

// ─── Helper: Custody Color to Tailwind ────────────────────────────────────────

function getCustodyBackgroundClass(color: CustodyColor): string {
  if (color === "primary") {
    return "bg-primary/5";
  }

  if (color === "secondary") {
    return "bg-secondary/5";
  }

  return ""; // split handled manually with absolute positioning
}

// ─── Sidebar Components ───────────────────────────────────────────────────────

function UpcomingTransitionItem({
  item,
  parentColor,
}: Readonly<{
  item: TransitionListItem;
  parentColor: "primary" | "secondary";
}>) {

  return (
    <div
      className={`relative pl-4 border-l-2 ${parentColor === "primary" ? "border-primary" : "border-secondary"}`}
    >
      <button
        className="bg-slate-50 dark:bg-slate-800 p-3 rounded-r-lg rounded-bl-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label={`${parentColor === "primary" ? "Drop-off" : "Pick-up"} ${item.label} at ${item.timeStr}`}
      >
        <div className="flex justify-between items-start mb-1">
          <span
            className={`text-xs font-bold ${parentColor === "primary" ? "text-primary bg-primary/10" : "text-secondary bg-secondary/10"} px-2 py-0.5 rounded`}
          >
            {item.label}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {item.timeStr}
          </span>
        </div>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {parentColor === "primary" ? "Drop-off" : "Pick-up"}
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

function PendingRequest() {
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
            Halloween Swap
          </p>
          <p className="text-xs text-slate-500">Requested by Sarah</p>
        </div>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 bg-slate-50 dark:bg-slate-800 p-2 rounded">
        &quot;Can we switch weekends so I can take Leo trick-or-treating?&quot;
      </p>
      <div className="flex gap-2">
        <button className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
          Decline
        </button>
        <button className="flex-1 bg-primary text-white text-xs font-bold py-2 rounded-lg hover:opacity-90">
          Approve
        </button>
      </div>
    </div>
  );
}

function CalendarSidebar({ data }: Readonly<{ data: CalendarMonthData }>) {
  return (
    <nav aria-label="Calendar sidebar" className="w-full md:w-80 lg:w-96 flex flex-col gap-6 bg-white dark:bg-slate-900 p-6 border-r border-slate-200 dark:border-slate-800 overflow-y-auto">
      {/* Main CTA */}
      <a href="/calendar/wizard" aria-label="Open schedule wizard" className="group flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-primary to-blue-600 p-4 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all transform hover:-translate-y-0.5">
        <div className="flex flex-col items-start gap-1">
          <span className="text-white font-bold text-lg">Schedule Wizard</span>
          <span className="text-blue-100 text-xs font-medium">
            Create recurring plan
          </span>
        </div>
        <div className="bg-white/20 rounded-lg p-2 text-white group-hover:bg-white/30 transition-colors">
          <span aria-hidden="true" className="material-symbols-outlined">magic_button</span>
        </div>
      </a>

      {/* Upcoming Transitions */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-slate-900 dark:text-slate-100 font-bold text-sm uppercase tracking-wider text-opacity-80">
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
        </div>
      </div>

      {/* Pending Requests */}
      <div className="flex flex-col gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <h3 className="text-slate-900 dark:text-slate-100 font-bold text-sm uppercase tracking-wider text-opacity-80">
            Pending Requests
          </h3>
          <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
            1 New
          </span>
        </div>
        <PendingRequest />
      </div>

      {/* Calendar Key */}
      <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">
          Custody Key
        </h4>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary"></div>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              You
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-secondary"></div>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {data.otherParent.name} (Co-Parent)
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}

// ─── Calendar Day Cell ────────────────────────────────────────────────────────

function CalendarDayCell({ day, isToday }: Readonly<{ day: CalendarDayState; isToday: boolean }>) {
  const isMuted = false; // Previous month days grayed out elsewhere
  const bgClass = getCustodyBackgroundClass(day.custodyColor);

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-xl p-3 min-h-[120px] shadow-sm border ${
        isToday
          ? "border-2 border-primary ring-4 ring-primary/10 shadow-md"
          : "border-slate-100 dark:border-slate-800"
      } relative group hover:shadow-md transition-shadow`}
    >
      {/* Custody background */}
      {day.custodyColor === "split" ? (
        <>
          <div className="absolute top-0 left-0 w-full h-1/2 bg-secondary/10 rounded-t-lg pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-full h-1/2 bg-primary/10 rounded-b-lg pointer-events-none"></div>
        </>
      ) : (
        <div className={`absolute inset-0 ${bgClass} rounded-xl pointer-events-none`}></div>
      )}

      {/* Day number */}
      <div className="flex justify-between items-start mb-2 relative z-10">
        {isToday ? (
          <span className="flex items-center justify-center w-7 h-7 bg-primary text-white rounded-full font-bold text-sm shadow-sm">
            {day.dayOfMonth}
          </span>
        ) : (
          <span className={`text-slate-700 dark:text-slate-300 font-bold ${isMuted ? "opacity-40" : ""}`}>
            {day.dayOfMonth}
          </span>
        )}

        {/* Event icons */}
        <div className="flex gap-1">
          {day.events.slice(0, 2).map((evt) => (
            <span
              key={evt.id}
              aria-hidden="true"
              className={`material-symbols-outlined text-[16px] ${evt.iconColor || "text-slate-400"}`}
              title={evt.title}
            >
              {evt.icon || "event"}
            </span>
          ))}
          {day.hasPendingRequest && (
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[16px] text-amber-500"
              title="Pending Request"
            >
              pending
            </span>
          )}
        </div>
      </div>

      {/* Event pills */}
      <div className="relative z-10 flex flex-col gap-1">
        {day.events.map((evt) => (
          <div
            key={evt.id}
            className={`${
              evt.bgColor
                ? evt.bgColor
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300'
            } text-[10px] font-bold px-1.5 py-0.5 rounded w-full truncate`}
            title={evt.title}
          >
            {evt.title}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Calendar Grid ───────────────────────────────────────────────────────────

function CalendarGrid({ data }: Readonly<{ data: CalendarMonthData }>) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const weekdayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <section
      aria-label="Monthly custody calendar grid"
      className="flex-1 overflow-auto p-8"
    >
      <div className="grid grid-cols-7 gap-4 h-full min-h-[600px]">
        {/* Weekday headers */}
        {weekdayHeaders.map((day) => (
          <div
            key={day}
            className="text-center text-sm font-bold text-slate-400 uppercase tracking-wider py-2"
          >
            {day}
          </div>
        ))}

        {/* Day cells */}
        {data.days.map((day, idx) => (
          <div
            key={day.dateStr}
            className={idx < 2 ? "opacity-40" : ""} // Gray out prev-month days
          >
            <CalendarDayCell
              day={day}
              isToday={day.dateStr === todayStr}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Main Calendar Page ───────────────────────────────────────────────────────

/**
 * Calendar Server Component.
 *
 * In production, replace createMockInput() with real database queries:
 *
 * async function loadCalendarData(userId: string, year: number, month: number) {
 *   const [family, events, requests, now] = await Promise.all([...]);
 *   return { family, events, requests, now };
 * }
 *
 * export default async function CalendarPage() {
 *   const { family, events, requests } = await loadCalendarData(...);
 *   const engine = new CalendarMonthEngine(family);
 *   const data = engine.getMonthData(year, month, events, requests);
 *   ...
 * }
 */
export default async function CalendarPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<{ conflictWindowMins?: string }> }>) {

  // ── Parse search params ───────────────────────────────────────────────────
  const resolvedParams = await searchParams;
  const conflictWindowMins = Number(resolvedParams?.conflictWindowMins ?? "120");

  // ── Get current month ─────────────────────────────────────────────────────
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // ── Load calendar data (mock for now) ─────────────────────────────────────
  const { family, events: allEvents, changeRequests, familySettings } = 
    createMockCalendarInput(conflictWindowMins, now);

  // ── Compute calendar ──────────────────────────────────────────────────────
  const engine = new CalendarMonthEngine(family);
  const data = engine.getMonthData(year, month, allEvents, changeRequests, now);
  const conflicts = engine.detectConflicts(
    allEvents,
    familySettings.conflictWindow.windowMins
  );

  const monthName = new Date(year, month - 1).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });

  return (
    <>
      {/* Top Navigation */}
      <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="size-8 text-primary">
            <svg
              className="w-full h-full"
              fill="none"
              viewBox="0 0 48 48"
              xmlns="http://www.w3.org/2000/svg"
            >
              <g clipPath="url(#clip0_6_543)">
                <path
                  d="M42.1739 20.1739L27.8261 5.82609C29.1366 7.13663 28.3989 10.1876 26.2002 13.7654C24.8538 15.9564 22.9595 18.3449 20.6522 20.6522C18.3449 22.9595 15.9564 24.8538 13.7654 26.2002C10.1876 28.3989 7.13663 29.1366 5.82609 27.8261L20.1739 42.1739C21.4845 43.4845 24.5355 42.7467 28.1133 40.548C30.3042 39.2016 32.6927 37.3073 35 35C37.3073 32.6927 39.2016 30.3042 40.548 28.1133C42.7467 24.5355 43.4845 21.4845 42.1739 20.1739Z"
                  fill="currentColor"
                />
              </g>
            </svg>
          </div>
          <h2 className="text-slate-900 dark:text-slate-100 text-lg font-bold leading-tight tracking-[-0.015em]">
            KidSchedule
          </h2>
        </div>
        <div className="flex flex-1 justify-end gap-8">
          <nav aria-label="Primary calendar navigation" className="hidden md:flex items-center gap-9">
            <a
              className="text-slate-900 dark:text-slate-100 text-sm font-medium leading-normal hover:text-primary transition-colors"
              href="/dashboard"
            >
              Dashboard
            </a>
            <a
              className="text-primary text-sm font-bold leading-normal border-b-2 border-primary pb-0.5"
              href="/calendar"
            >
              Calendar
            </a>
            <a
              className="text-slate-900 dark:text-slate-100 text-sm font-medium leading-normal hover:text-primary transition-colors"
              href="/expenses"
            >
              Expenses
            </a>
            <a
              className="text-slate-900 dark:text-slate-100 text-sm font-medium leading-normal hover:text-primary transition-colors"
              href="/messages"
            >
              Messages
            </a>
          </nav>
          <div className="flex gap-2">
            <button aria-label="View notifications" className="flex items-center justify-center rounded-lg h-10 w-10 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <span aria-hidden="true" className="material-symbols-outlined">notifications</span>
            </button>
            <button aria-label="Open settings" className="flex items-center justify-center rounded-lg h-10 w-10 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <span aria-hidden="true" className="material-symbols-outlined">settings</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main layout */}
      <main id="main-content" className="flex-1 flex flex-col md:flex-row overflow-hidden h-[calc(100vh-65px)]">
        <CalendarSidebar data={data} />

        {/* Main calendar section */}
        <section className="flex-1 flex flex-col bg-background-light dark:bg-background-dark overflow-hidden relative">
          {/* Calendar controls */}
          <div className="flex items-center justify-between px-8 py-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-10">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {monthName}
              </h1>
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                <button aria-label="Previous month" className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded-md shadow-sm transition-all text-slate-600 dark:text-slate-300">
                  <span aria-hidden="true" className="material-symbols-outlined">chevron_left</span>
                </button>
                <button aria-label="Next month" className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded-md shadow-sm transition-all text-slate-600 dark:text-slate-300">
                  <span aria-hidden="true" className="material-symbols-outlined">
                    chevron_right
                  </span>
                </button>
              </div>
              <button aria-label="Jump to current date" className="text-sm font-bold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors">
                Today
              </button>
            </div>
            <div className="flex gap-2">
              <form action={updateConflictWindow} className="flex items-center gap-2">
                <label htmlFor="conflictWindowMins" className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Conflict window
                </label>
                <select
                  id="conflictWindowMins"
                  name="conflictWindowMins"
                  defaultValue={String(familySettings.conflictWindow.windowMins)}
                  className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200"
                >
                  <option value="0">0 min</option>
                  <option value="30">30 min</option>
                  <option value="60">60 min</option>
                  <option value="120">120 min</option>
                  <option value="180">180 min</option>
                </select>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Apply
                </button>
              </form>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                <button className="px-4 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm font-bold rounded shadow-sm">
                  Month
                </button>
                <button className="px-4 py-1.5 text-slate-500 dark:text-slate-400 text-sm font-medium hover:text-slate-900 dark:hover:text-slate-200">
                  Week
                </button>
                <button className="px-4 py-1.5 text-slate-500 dark:text-slate-400 text-sm font-medium hover:text-slate-900 dark:hover:text-slate-200">
                  List
                </button>
              </div>
              <button aria-label="Create new calendar event" className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-700 text-white rounded-lg text-sm font-bold hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors">
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  add
                </span>
                {" "}
                New Event
              </button>
            </div>
          </div>

          <div className="px-8 py-3 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-900/20 text-sm text-amber-800 dark:text-amber-200">
            Detected <span className="font-bold">{conflicts.length}</span>{" "}
            potential conflict{conflicts.length === 1 ? "" : "s"} using a {familySettings.conflictWindow.windowMins}-minute window.
          </div>

          {/* Calendar grid */}
          <CalendarGrid data={data} />
        </section>
      </main>
    </>
  );
}
