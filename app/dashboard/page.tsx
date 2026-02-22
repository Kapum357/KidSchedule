/**
 * KidSchedule – Parent Dashboard
 *
 * This is a Next.js Server Component.  All data is assembled at render time
 * via aggregateDashboard() + createMockInput().  When a real database layer is
 * added, replace createMockInput() with actual DB queries fetched in parallel
 * via Promise.all, then pass the results into aggregateDashboard().
 *
 * Sub-components are co-located in this file as plain functions to keep the
 * first iteration simple.  Extract them into separate files once they grow.
 */

import { aggregateDashboard, createMockInput } from "@/lib/dashboard-aggregator";
import { getThemeScriptProps } from "@/lib/theme-config";
import { ThemeToggle } from "@/app/theme-toggle";
import type {
  ActivityItem,
  CalendarEvent,
  ClimateLevel,
  ConflictClimate,
  CustodyStatus,
  DashboardData,
  Moment,
  Parent,
  Reminder,
  ScheduleChangeRequest,
} from "@/types";

// ─── Formatting Helpers ───────────────────────────────────────────────────────

/**
 * Returns a short relative-time string without importing a heavy library.
 * Example outputs: "just now", "2 hrs ago", "Yesterday", "3 days ago"
 */
function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 2) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr > 1 ? "s" : ""} ago`;
  if (diffHr < 48) return "Yesterday";
  return `${Math.floor(diffHr / 24)} days ago`;
}

/**
 * Formats the next transition as "Today, 5:00 PM" or "Tue, Jul 8 · 5:00 PM".
 */
function formatTransition(periodEnd: Date): string {
  const now = new Date();
  const isToday =
    periodEnd.toDateString() === now.toDateString();
  const time = periodEnd.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (isToday) return `Today, ${time}`;
  const date = periodEnd.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${date} · ${time}`;
}

/**
 * Returns months since a date, shown as "Since [Weekday], [time]".
 */
function formatSince(periodStart: Date): string {
  const weekday = periodStart.toLocaleDateString([], { weekday: "long" });
  const time = periodStart.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return `Since ${weekday}, ${time}`;
}

/**
 * Converts a tension score to the SVG stroke-dasharray for the donut arc.
 * The donut circumference uses r=16 → C = 2π×16 ≈ 100.5 (we normalise to 100).
 * A tension of 0 → green arc length 100; tension of 100 → arc length 0.
 */
function tensionToDashArray(tensionScore: number): string {
  const arcLength = Math.max(0, Math.round(tensionScore * -1 + 100));
  return `${arcLength} 100`;
}

/** Returns a Tailwind stroke colour class for the gauge arc. */
function climateColor(level: ClimateLevel): string {
  if (level === "low") return "stroke-emerald-500";
  if (level === "medium") return "stroke-amber-400";
  return "stroke-red-500";
}

/** Returns a human label for each activity type. */
function activityLabel(type: ActivityItem["type"]): string {
  const labels: Record<ActivityItem["type"], string> = {
    expense_added: "Expense Added",
    expense_paid: "Expense Paid",
    message_received: "New Message",
    schedule_change_requested: "Schedule Change Request",
    schedule_change_accepted: "Change Accepted",
    schedule_change_declined: "Change Declined",
    moment_uploaded: "Moment Shared",
    event_added: "Event Added",
    event_confirmed: "Event Confirmed",
  };
  return labels[type] ?? "Activity";
}

/** Returns icon + colour for each activity type. */
function activityIcon(
  type: ActivityItem["type"]
): { icon: string; bg: string; text: string } {
  if (type.startsWith("expense"))
    return { icon: "receipt_long", bg: "bg-blue-50 dark:bg-blue-900/20", text: "text-blue-600 dark:text-blue-400" };
  if (type === "message_received")
    return { icon: "forum", bg: "bg-purple-50 dark:bg-purple-900/20", text: "text-purple-600 dark:text-purple-400" };
  if (type.startsWith("schedule"))
    return { icon: "edit_calendar", bg: "bg-orange-50 dark:bg-orange-900/20", text: "text-orange-600 dark:text-orange-400" };
  if (type === "moment_uploaded")
    return { icon: "photo_camera", bg: "bg-pink-50 dark:bg-pink-900/20", text: "text-pink-600 dark:text-pink-400" };
  return { icon: "event", bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-400" };
}

// ─── Section Components ───────────────────────────────────────────────────────

function CustodyCard({ custody }: Readonly<{ custody: CustodyStatus }>) {
  return (
    <div className="bg-white dark:bg-[#1A2633] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between relative overflow-hidden group">
      <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <span aria-hidden="true" className="material-symbols-outlined text-[96px] text-[#6BCABD]">home</span>
      </div>
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-[#6BCABD] font-semibold text-sm mb-1 uppercase tracking-wider">
          <span className="size-2 rounded-full bg-[#6BCABD] animate-pulse" />
          Current Custody
        </div>
        <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
          With {custody.currentParent.name.split(" ")[0]}
        </h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          {formatSince(custody.periodStart)}
        </p>
      </div>
      <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-700 relative z-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase">Next Transition</p>
            <p className="text-slate-900 dark:text-white font-medium mt-1">
              {formatTransition(custody.periodEnd)}
            </p>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              {custody.minutesUntilTransition < 120
                ? `${custody.minutesUntilTransition} min`
                : `${Math.floor(custody.minutesUntilTransition / 60)} hr`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function UpcomingCard({ events, changeRequests }: Readonly<{
  events: CalendarEvent[];
  changeRequests: ScheduleChangeRequest[];
}>) {
  const pendingIds = new Set(changeRequests.map((r) => r.id));

  return (
    <div className="bg-white dark:bg-[#1A2633] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900 dark:text-white text-lg">Upcoming</h3>
        <a className="text-[#6BCABD] text-sm font-medium hover:underline" href="/calendar">
          View Calendar
        </a>
      </div>
      <div className="flex flex-col gap-4">
        {events.length === 0 && (
          <p className="text-sm text-slate-400">No upcoming events.</p>
        )}
        {events.map((event) => {
          const start = new Date(event.startAt);
          const month = start.toLocaleDateString([], { month: "short" }).toUpperCase();
          const day = start.getDate();
          const isPending =
            event.confirmationStatus === "pending" ||
            changeRequests.some((r) => r.title.includes(event.title) && pendingIds.has(r.id));
          const time = event.allDay
            ? "Full Day"
            : `${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${event.endAt ? " – " + new Date(event.endAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}`;

          return (
            <div key={event.id} className="flex gap-4 items-start">
              <div className="flex flex-col items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-2 min-w-[60px]">
                <span className="text-xs font-bold text-slate-500 uppercase">{month}</span>
                <span className="text-xl font-bold text-slate-900 dark:text-white">{day}</span>
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{event.title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {event.category.charAt(0).toUpperCase() + event.category.slice(1)} Schedule
                  {event.location ? ` • ${event.location}` : ""} • {time}
                </p>
                {isPending && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-300 px-2 py-0.5 rounded mt-1">
                    <span aria-hidden="true" className="material-symbols-outlined text-[12px]">pending</span>
                    Pending Confirmation
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClimateCard({ climate }: Readonly<{ climate: ConflictClimate }>) {
  const levelLabel =
    climate.level === "low" ? "Low" : climate.level === "medium" ? "Medium" : "High";
  const tensionLabel =
    climate.level === "low" ? "Tension" : climate.level === "medium" ? "Tension" : "Tension";

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-[#1E293B] dark:to-[#1A2633] p-6 rounded-xl border border-indigo-100 dark:border-indigo-900/30 shadow-sm flex flex-col relative">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-purple-600">psychology</span>
          <h3 className="font-bold text-slate-900 dark:text-white text-lg">Conflict Climate</h3>
        </div>
        <span
          aria-hidden="true"
          className="cursor-help text-slate-400 hover:text-slate-600 material-symbols-outlined text-lg"
          title={`Based on ${climate.sampleSize} messages in the last 30 days. Private to you.`}
        >
          info
        </span>
      </div>
      <div className="flex-1 flex flex-col justify-center items-center py-2">
        <div className="relative size-32">
          <svg
            className="size-full -rotate-90"
            viewBox="0 0 36 36"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              className="stroke-slate-200 dark:stroke-slate-700"
              cx="18"
              cy="18"
              fill="none"
              r="16"
              strokeWidth="3"
            />
            <circle
              className={climateColor(climate.level)}
              cx="18"
              cy="18"
              fill="none"
              r="16"
              strokeDasharray={tensionToDashArray(climate.tensionScore)}
              strokeWidth="3"
            />
          </svg>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <span className="block text-2xl font-bold text-slate-900 dark:text-white">
              {levelLabel}
            </span>
            <span className="block text-[10px] text-slate-500 uppercase tracking-wide">
              {tensionLabel}
            </span>
          </div>
        </div>
        <p className="text-center text-sm text-slate-600 dark:text-slate-300 mt-2 font-medium">
          {climate.level === "low"
            ? "Communication is stable."
            : climate.level === "medium"
            ? "Some tension detected."
            : "High tension — consider mediation."}
        </p>
      </div>
      <div className="mt-2 bg-white/60 dark:bg-black/20 p-3 rounded-lg backdrop-blur-sm">
        <div className="flex gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-purple-500 text-sm mt-0.5">
            auto_awesome
          </span>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            <span className="font-semibold text-purple-600 dark:text-purple-400">AI Tip:</span>{" "}
            {climate.tip}
          </p>
        </div>
      </div>
    </div>
  );
}

function ActivityFeed({ items }: Readonly<{
  items: ActivityItem[];
}>) {
  return (
    <div className="lg:col-span-2 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Recent Activity</h2>
        <button className="text-sm text-[#6BCABD] font-medium hover:underline">View All</button>
      </div>
      <div className="flex flex-col gap-3">
        {items.length === 0 && (
          <p className="text-sm text-slate-400">No recent activity.</p>
        )}
        {items.map((item) => {
          const { icon, bg, text } = activityIcon(item.type);
          const isPending = item.type === "schedule_change_requested";
          const isExpense = item.type === "expense_added";

          return (
            <div
              key={item.id}
              className="group flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white dark:bg-[#1A2633] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-[#6BCABD]/30 transition-colors"
            >
              <div
                className={`size-10 rounded-full ${bg} ${text} flex items-center justify-center shrink-0`}
              >
                <span aria-hidden="true" className="material-symbols-outlined">{icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {activityLabel(item.type)}
                  </h4>
                  <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {relativeTime(item.occurredAt)}
                  </span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {item.summary}
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                {isExpense && (
                  <>
                    <button className="flex-1 sm:flex-none px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                      Details
                    </button>
                    <button className="flex-1 sm:flex-none px-4 py-2 text-xs font-bold text-white bg-[#6BCABD] hover:opacity-90 rounded-lg transition-colors">
                      Pay Now
                    </button>
                  </>
                )}
                {item.type === "message_received" && (
                  <button className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                    Reply
                  </button>
                )}
                {isPending && (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 text-xs font-bold">
                    Pending Review
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SharedMoments({ moments }: Readonly<{ moments: Moment[] }>) {
  const display = moments.slice(0, 3);
  const hasMore = moments.length > 3;

  return (
    <div className="bg-white dark:bg-[#1A2633] p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">
          Shared Moments
        </h3>
        <button
          aria-label="Add shared moment"
          className="size-6 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
          title="Add Moment"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-lg">add_a_photo</span>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {display.map((moment) => (
          <button
            key={moment.id}
            className="aspect-square rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label={`View photo moment from ${moment.createdAt}`}
          >
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
              style={{ backgroundImage: `url('${moment.mediaUrl}')` }}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            {moment.reactions.length > 0 && (
              <div className="absolute bottom-1 right-1 text-xs bg-black/40 text-white rounded-full px-1.5 py-0.5">
                {moment.reactions[0].emoji}
              </div>
            )}
          </button>
        ))}
        <button 
          className="aspect-square rounded-lg bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 hover:text-[#6BCABD] hover:border-[#6BCABD]/50 hover:bg-[#6BCABD]/5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={hasMore ? "View all photo moments" : "Add new photo moment"}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-2xl mb-1">add</span>
          <span className="text-[10px] font-bold">{hasMore ? "View All" : "New"}</span>
        </button>
      </div>
      <p className="text-xs text-center text-slate-400 mt-3">Visible to both parents</p>
    </div>
  );
}

function RemindersWidget({ reminders }: Readonly<{ reminders: Reminder[] }>) {
  return (
    <div className="bg-white dark:bg-[#1A2633] p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide mb-4">
        Reminders
      </h3>
      <ul className="flex flex-col gap-3">
        {reminders.map((rem) => (
          <li key={rem.id} className="flex items-start gap-3">
            <div className="mt-0.5">
              <input
                readOnly
                checked={rem.completed}
                className="rounded border-slate-300 text-[#6BCABD] focus:ring-[#6BCABD]/20 size-4 cursor-pointer"
                type="checkbox"
              />
            </div>
            <span
              className={`text-sm ${
                rem.completed
                  ? "text-slate-400 line-through"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {rem.text}
            </span>
          </li>
        ))}
        {reminders.length === 0 && (
          <li className="text-sm text-slate-400">No pending reminders.</li>
        )}
      </ul>
    </div>
  );
}

function Sidebar({
  currentParent,
  unreadCount,
}: Readonly<{
  currentParent: Parent;
  unreadCount: number;
}>) {
  return (
    <nav aria-label="Primary dashboard sidebar" className="w-72 bg-white dark:bg-[#1A2633] border-r border-slate-200 dark:border-slate-800 flex-col justify-between hidden lg:flex sticky top-0 h-screen z-20">
      <div className="flex flex-col gap-6 p-6">
        {/* Branding */}
        <div className="flex items-center gap-3">
          <div className="bg-[#6BCABD]/10 flex items-center justify-center rounded-lg size-10 text-[#6BCABD]">
            <span aria-hidden="true" className="material-symbols-outlined text-2xl">family_restroom</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-slate-900 dark:text-white text-base font-bold leading-none">
              KidSchedule
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium leading-normal mt-1">
              Co-Parenting Platform
            </p>
          </div>
        </div>
        {/* Nav */}
        <nav aria-label="Dashboard sections" className="flex flex-col gap-2">
          {[
            { href: "/dashboard", icon: "dashboard", label: "Dashboard", active: true, fill: true },
            { href: "/calendar", icon: "calendar_month", label: "Calendar" },
            { href: "/expenses", icon: "payments", label: "Expenses" },
            {
              href: "/messages",
              icon: "chat_bubble",
              label: "Messages",
              badge: unreadCount > 0 ? String(unreadCount) : undefined,
            },
            { href: "/vault", icon: "description", label: "Vault" },
            { href: "/mediator", icon: "smart_toy", label: "AI Mediator", purple: true },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                link.active
                  ? "bg-[#6BCABD]/10 text-[#6BCABD]"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 group"
              }`}
            >
              <span
                aria-hidden="true"
                className={`material-symbols-outlined ${link.purple ? "text-purple-500" : ""}`}
                style={link.fill ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {link.icon}
              </span>
              <span className="text-sm font-semibold">{link.label}</span>
              {link.badge && (
                <span className="ml-auto bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">
                  {link.badge}
                </span>
              )}
            </a>
          ))}
        </nav>
      </div>
      {/* User */}
      <div className="flex flex-col gap-2 p-6 border-t border-slate-200 dark:border-slate-800">
        <a
          href="/settings"
          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
        >
          <span aria-hidden="true" className="material-symbols-outlined">settings</span>
          <span className="text-sm font-medium">Settings</span>
        </a>
        <div className="flex items-center gap-3 px-4 py-3 mt-2">
          {currentParent.avatarUrl ? (
            <div
              className="size-10 rounded-full bg-cover bg-center border-2 border-slate-100 dark:border-slate-700"
              style={{ backgroundImage: `url('${currentParent.avatarUrl}')` }}
            />
          ) : (
            <div className="size-10 rounded-full bg-[#6BCABD]/20 flex items-center justify-center text-[#6BCABD] font-bold">
              {currentParent.name.charAt(0)}
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {currentParent.name}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Log Out</span>
          </div>
        </div>
      </div>
    </nav>
  );
}

// ─── Page Entry Point ─────────────────────────────────────────────────────────

/**
 * Dashboard Server Component.
 *
 * Replace `createMockInput()` with real database fetches once the data layer
 * is implemented.  The aggregateDashboard() call and all JSX below remain
 * unchanged – only the input source changes.
 */
export default function DashboardPage() {
  // ── Data assembly (runs server-side at request time) ──────────────────────
  const input = createMockInput();
  const data: DashboardData = aggregateDashboard(input);


  return (
    <>
      <script {...getThemeScriptProps()} />
      <div className="relative flex min-h-screen w-full flex-row overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        currentParent={data.currentParent}
        unreadCount={data.unreadMessageCount}
      />

      {/* Main */}
      <main id="main-content" className="flex-1 flex flex-col h-screen overflow-y-auto">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-[#1A2633] border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="material-symbols-outlined text-[#6BCABD] text-3xl">
              family_restroom
            </span>
            <h1 className="font-bold text-lg">KidSchedule</h1>
          </div>
          <button 
            className="p-2.5 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label="Open menu"
          >
            <span aria-hidden="true" className="material-symbols-outlined">menu</span>
          </button>
        </header>

        {/* Desktop top bar */}
        <div className="hidden lg:flex items-center justify-between px-8 py-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Welcome back, {data.currentParent.name.split(" ")[0]}. Here is what is happening
              with the kids today.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button aria-label="Open quick actions" className="flex items-center gap-2 bg-[#6BCABD] hover:opacity-90 text-white px-5 py-2.5 rounded-lg shadow-sm font-medium transition-all text-sm">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">add</span>
              <span>Quick Actions</span>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">expand_more</span>
            </button>
            <button aria-label="View notifications" className="relative p-2.5 bg-white dark:bg-[#1A2633] text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors">
              <span aria-hidden="true" className="material-symbols-outlined text-[24px]">notifications</span>
              {data.unreadMessageCount > 0 && (
                <span className="absolute top-2 right-2.5 size-2 bg-red-500 rounded-full ring-2 ring-white dark:ring-[#1A2633]" />
              )}
            </button>
            <ThemeToggle />
          </div>
        </div>

        {/* Content */}
        <div className="px-4 lg:px-8 pb-10 flex flex-col gap-6 max-w-7xl mx-auto w-full">
          {/* Family at a Glance */}
          <section
            aria-label="Family at a Glance"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6"
          >
            <CustodyCard custody={data.custody} />
            <UpcomingCard
              events={data.upcomingEvents}
              changeRequests={data.pendingChangeRequests}
            />
            <ClimateCard climate={data.climate} />
          </section>

          {/* Activity + Side Widgets */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ActivityFeed items={data.recentActivity} />
            <div className="flex flex-col gap-6">
              <SharedMoments moments={data.moments} />
              <RemindersWidget reminders={data.reminders} />
            </div>
          </div>
        </div>
      </main>
      </div>
    </>
  );
}
