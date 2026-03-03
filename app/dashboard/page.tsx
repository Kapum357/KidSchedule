/**
 * KidSchedule – Parent Dashboard (v2)
 *
 * A Next.js Server Component. All data is fetched in parallel via Promise.all
 * then composed by aggregateDashboard(). Sub-components are co-located for
 * simplicity; extract them once they grow beyond this file.
 *
 * Color system: uses CSS custom properties defined in globals.css, with
 * hardcoded hex values only where a new v2 design token has no Tailwind alias.
 */

import { aggregateDashboard } from "@/lib/dashboard-aggregator";
import { requireAuth } from "@/lib";
import { db } from "@/lib/persistence";
import { SchedulePresets } from "@/lib/custody-engine";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/app/theme-toggle";
import type {
  ActivityItem,
  CalendarEvent,
  ConflictClimate,
  CustodyStatus,
  Expense,
  Family,
  Message,
  Moment,
  Parent,
  Reminder,
  ScheduleChangeRequest,
  ScheduleTransition,
} from "@/types";

// ─── Color Constants (Design v2) ──────────────────────────────────────────────

const SURFACE = "bg-white dark:bg-[#1e2928]";
const BORDER  = "border border-slate-100 dark:border-slate-800";
const CARD    = `${SURFACE} rounded-2xl shadow-sm ${BORDER}`;

// ─── Formatting Helpers ───────────────────────────────────────────────────────

/**
 * Lightweight relative-time formatter (no third-party dependency).
 * e.g. "just now", "15 min ago", "Yesterday"
 */
function relativeTime(isoString: string): string {
  const diffMs  = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 2)  return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr} hr${diffHr > 1 ? "s" : ""} ago`;
  if (diffHr < 48)  return "Yesterday";
  return `${Math.floor(diffHr / 24)} days ago`;
}

/** e.g. "Today, 5:00 PM" or "Tue, Jul 8 · 5:00 PM" */
function formatTransition(d: Date): string {
  const now     = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time    = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today, ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${time}`;
}

/** Returns true if date is tomorrow (calendar day, not 24 h window). */
function isTransitionTomorrow(d: Date): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return d.toDateString() === tomorrow.toDateString();
}

/** Extracts a readable label from an activity item's summary string. */
function expenseLabelFromSummary(summary: string): string {
  // summary pattern: "[Name] added an expense of $X.XX for [category]."
  const match = summary.match(/for (.+?)\.?$/i);
  return match ? match[1] : "expense";
}

// ─── Section Components ───────────────────────────────────────────────────────

/** Accent chip: a coloured icon pill used in card headings. */
function AccentChip({
  icon,
  bg,
  fg,
}: Readonly<{ icon: string; bg: string; fg: string }>) {
  return (
    <div className={`${bg} ${fg} p-2 rounded-lg shrink-0`}>
      <span aria-hidden="true" className="material-symbols-outlined">{icon}</span>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({
  currentParent,
  unreadCount,
}: Readonly<{ currentParent: Parent; unreadCount: number }>) {
  const navLinks = [
    { href: "/dashboard",  icon: "dashboard",            label: "Dashboard", active: true, filled: true },
    { href: "/calendar",   icon: "calendar_month",       label: "Calendar" },
    { href: "/messages",   icon: "forum",                label: "Messages", badge: unreadCount > 0 ? unreadCount : undefined },
    { href: "/expenses",   icon: "account_balance_wallet", label: "Expenses" },
    { href: "/vault",      icon: "description",          label: "Documents" },
  ] as const;

  const settingLinks = [
    { href: "/settings/profile",      icon: "manage_accounts", label: "Profile" },
    { href: "/settings/preferences",  icon: "settings",        label: "Preferences" },
  ] as const;

  return (
    <aside
      aria-label="Primary navigation"
      className="w-64 bg-white dark:bg-[#1e2928] border-r border-slate-200 dark:border-slate-800 flex-col hidden md:flex z-20 transition-all duration-300"
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-[#6BCABD]/20 p-1.5 rounded-lg text-[#6BCABD]">
            <span aria-hidden="true" className="material-symbols-outlined text-2xl">family_restroom</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-white select-none">
            KidSchedule
          </span>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        {navLinks.map((link) => {
          const isActive = "active" in link && link.active;
          const isFilled = "filled" in link && link.filled;

          return (
            <a
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                isActive
                  ? "text-[#6BCABD] bg-[#6BCABD]/10 font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5"
              }`}
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined"
                style={isFilled ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {link.icon}
              </span>
              <span className="flex-1">{link.label}</span>
              {"badge" in link && link.badge !== undefined && (
              <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                {link.badge}
              </span>
            )}
          </a>
          );
        })}

        {/* Settings section divider */}
        <div className="pt-6 pb-2 px-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Settings</p>
        </div>

        {settingLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 px-3 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg font-medium transition-colors"
          >
            <span aria-hidden="true" className="material-symbols-outlined">{link.icon}</span>
            <span>{link.label}</span>
          </a>
        ))}
      </nav>

      {/* User profile */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
        <button
          className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left"
          aria-label="Account menu"
        >
          {currentParent.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              alt={currentParent.name}
              className="w-9 h-9 rounded-full object-cover shrink-0"
              src={currentParent.avatarUrl}
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-[#6BCABD]/20 flex items-center justify-center text-[#6BCABD] font-bold text-sm shrink-0">
              {currentParent.name.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {currentParent.name}
            </p>
            <p className="text-xs text-slate-500 truncate">Free Plan</p>
          </div>
          <span aria-hidden="true" className="material-symbols-outlined text-slate-400 text-lg">
            expand_more
          </span>
        </button>
      </div>
    </aside>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function DashboardHeader({
  unreadCount,
}: Readonly<{ unreadCount: number }>) {
  return (
    <header className="h-16 bg-white dark:bg-[#1e2928] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 z-10 shrink-0">
      <div className="flex items-center gap-4">
        {/* Mobile hamburger */}
        <button
          aria-label="Open menu"
          className="md:hidden p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
        >
          <span aria-hidden="true" className="material-symbols-outlined">menu</span>
        </button>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white hidden sm:block">Dashboard</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden sm:block">
          <span
            aria-hidden="true"
            className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none"
          >
            search
          </span>
          <input
            className="pl-10 pr-4 py-2 bg-slate-50 dark:bg-white/5 border-none rounded-full text-sm w-56 lg:w-64 focus:ring-2 focus:ring-[#6BCABD]/50 outline-none text-slate-800 dark:text-white placeholder:text-slate-400"
            placeholder="Search…"
            type="search"
            aria-label="Search"
          />
        </div>
        {/* Notifications */}
        <button
          aria-label="View notifications"
          className="relative p-2 text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 rounded-full transition-colors"
        >
          <span aria-hidden="true" className="material-symbols-outlined">notifications</span>
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-[#1e2928]"
            />
          )}
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}

// ─── Custody Schedule Card ────────────────────────────────────────────────────

function CustodyScheduleCard({
  custody,
  upcomingTransitions,
  monthlyOwnership,
  family,
  isCurrentUser,
  upcomingEvents,
}: Readonly<{
  custody: CustodyStatus;
  upcomingTransitions: ScheduleTransition[];
  monthlyOwnership: { [parentId: string]: number };
  family: Family;
  isCurrentUser: boolean;
  upcomingEvents: CalendarEvent[];
}>) {
  const todayLabel = new Date().toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const dropoffTime = custody.periodEnd.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const transitionLabel = isTransitionTomorrow(custody.periodEnd)
    ? "Tomorrow"
    : formatTransition(custody.periodEnd);

  const nextEvent = upcomingEvents[0];

  // Find the co-parent (the one who doesn't currently have custody)
  const coParent = upcomingTransitions[0]?.toParent || upcomingTransitions[0]?.fromParent;

  return (
    <div className={`${CARD} p-6 md:col-span-2 xl:col-span-2`}>
      {/* Card header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <AccentChip
            icon="calendar_clock"
            bg="bg-[#E0F2FE]"
            fg="text-[#0369A1]"
          />
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">
            Custody Schedule
          </h2>
        </div>
        <a
          href="/calendar"
          className="text-sm font-medium text-[#6BCABD] hover:text-[#4FB8A9] transition-colors"
        >
          View Calendar
        </a>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Left: status + transition box */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-500 uppercase font-bold tracking-wider mb-2">
            {todayLabel}
          </p>
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            {isCurrentUser ? "With You" : `With ${custody.currentParent.name.split(" ")[0]}`}
          </h3>
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 mb-6">
            <span aria-hidden="true" className="material-symbols-outlined text-green-500 text-[20px]">
              check_circle
            </span>
            <span>
              Drop-off at{" "}
              <span className="font-bold text-slate-900 dark:text-white">{dropoffTime}</span>
              {" "}at School
            </span>
          </div>

          {/* Upcoming transition box */}
          <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 border border-slate-100 dark:border-white/5">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {nextEvent ? nextEvent.title : "Upcoming Transition"}
              </span>
              <span className="text-xs bg-white dark:bg-white/10 px-2 py-1 rounded border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300">
                {transitionLabel}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                <span aria-hidden="true" className="material-symbols-outlined text-slate-500 text-[20px]">
                  swap_horiz
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-800 dark:text-white">Handover to Co-Parent</p>
                <p className="text-sm text-slate-500">
                  {dropoffTime}
                  {custody.transitionLocation ? ` • ${custody.transitionLocation}` : " • School Pickup"}
                </p>
                {coParent && (
                  <div className="flex gap-2 mt-2">
                    {coParent.phone && (
                      <a
                        href={`tel:${coParent.phone}`}
                        className="inline-flex items-center gap-1 text-xs text-[#6BCABD] hover:text-[#4FB8A9] font-medium"
                      >
                        <span className="material-symbols-outlined text-[14px]">call</span>
                        Call
                      </a>
                    )}
                    <a
                      href="/messages"
                      className="inline-flex items-center gap-1 text-xs text-[#6BCABD] hover:text-[#4FB8A9] font-medium"
                    >
                      <span className="material-symbols-outlined text-[14px]">chat</span>
                      Message
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Monthly Ownership */}
          <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 border border-slate-100 dark:border-white/5">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              This Month's Ownership
            </h4>
            <div className="space-y-2">
              {Object.entries(monthlyOwnership).map(([parentId, percentage]) => {
                // Find parent by ID from family data
                const parent = family.parents.find(p => p.id === parentId);
                if (!parent) {
                  return null;
                }
                return (
                  <div key={parentId} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {parent.name.split(" ")[0]}
                    </span>
                    <span className="text-sm font-bold text-slate-800 dark:text-white">
                      {percentage}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upcoming Transitions */}
          <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 border border-slate-100 dark:border-white/5">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Next 5 Transitions
            </h4>
            <div className="space-y-3">
              {upcomingTransitions.slice(0, 5).map((transition) => (
                <div key={transition.at.getTime()} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                    <span aria-hidden="true" className="material-symbols-outlined text-slate-500 text-[16px]">
                      swap_horiz
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-white">
                      {transition.fromParent.name.split(" ")[0]} → {transition.toParent.name.split(" ")[0]}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatTransition(transition.at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="w-full md:w-60 bg-slate-50 dark:bg-white/5 rounded-xl p-5 border border-slate-100 dark:border-white/5 self-stretch flex flex-col justify-center shrink-0">
          <div className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-6">
            {/* Dot 1 — Now */}
            <div className="relative">
              <div className="absolute -left-[21px] top-1 w-3 h-3 bg-[#6BCABD] rounded-full ring-4 ring-white dark:ring-[#1e2928]" />
              <p className="text-xs text-slate-400">Now</p>
              <p className="font-bold text-slate-800 dark:text-white">Active Time</p>
            </div>
            {/* Dot 2 — Drop-off */}
            <div className="relative opacity-60">
              <div className="absolute -left-[21px] top-1 w-3 h-3 bg-slate-300 dark:bg-slate-600 rounded-full ring-4 ring-white dark:ring-[#1e2928]" />
              <p className="text-xs text-slate-400">{dropoffTime}</p>
              <p className="font-medium text-slate-800 dark:text-white">Drop-off</p>
            </div>
            {/* Dot 3 — Next */}
            <div className="relative opacity-40">
              <div className="absolute -left-[21px] top-1 w-3 h-3 bg-slate-300 dark:bg-slate-600 rounded-full ring-4 ring-white dark:ring-[#1e2928]" />
              <p className="text-xs text-slate-400">
                {isTransitionTomorrow(custody.periodEnd) ? "Tomorrow" : "Next"}
              </p>
              <p className="font-medium text-slate-800 dark:text-white">Start: Co-Parent</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Communication Health Card ────────────────────────────────────────────────

function CommHealthCard({ climate }: Readonly<{ climate: ConflictClimate }>) {
  // Invert tension score → health score (0 = terrible, 100 = perfect)
  const healthScore = Math.max(0, Math.round(100 - climate.tensionScore));
  const healthLabel =
    healthScore >= 85 ? "Excellent" :
    healthScore >= 70 ? "Good" :
    healthScore >= 50 ? "Fair" : "Low";

  // SVG arc: stroke-dasharray="score, 100"
  const dashArray = `${healthScore}, 100`;

  // Arc colour follows health
  const arcColor =
    healthScore >= 70 ? "text-[#6BCABD]" :
    healthScore >= 50 ? "text-amber-400" : "text-red-500";

  return (
    <div className={`${CARD} p-6 flex flex-col`}>
      {/* Card header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <AccentChip
            icon="sentiment_satisfied"
            bg="bg-[#F3E8FF]"
            fg="text-[#7E22CE]"
          />
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Comm. Health</h2>
        </div>
        <span
          aria-hidden="true"
          className="material-symbols-outlined text-slate-300 cursor-help text-xl"
          title={`Based on ${climate.sampleSize} message${climate.sampleSize !== 1 ? "s" : ""} in the last 30 days. Private to you.`}
        >
          info
        </span>
      </div>

      {/* Gauge */}
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
        <div className="relative w-32 h-32 flex items-center justify-center">
          <svg
            className="w-full h-full transform -rotate-90"
            viewBox="0 0 36 36"
            aria-hidden="true"
          >
            {/* Track */}
            <path
              className="text-slate-100 dark:text-white/10"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
            {/* Fill */}
            <path
              className={arcColor}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeDasharray={dashArray}
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          {/* Centre label */}
          <div className="absolute flex flex-col items-center">
            <span className="text-3xl font-bold text-slate-800 dark:text-white leading-none">
              {healthScore}
            </span>
            <span className="text-xs font-semibold text-[#6BCABD] uppercase mt-0.5 tracking-wide">
              {healthLabel}
            </span>
          </div>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 px-4 leading-relaxed">
          {climate.tip}
        </p>
        <p className="text-xs text-slate-400">
          Based on {climate.sampleSize} interaction{climate.sampleSize !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}

// ─── Pending Actions Card ─────────────────────────────────────────────────────

function PendingActionsCard({
  unreadCount,
  recentActivity,
  pendingChangeRequests,
}: Readonly<{
  unreadCount: number;
  recentActivity: ActivityItem[];
  pendingChangeRequests: ScheduleChangeRequest[];
}>) {
  // First unpaid expense from the activity feed
  const unpaidActivity = recentActivity.find(
    (a) => a.type === "expense_added" && a.meta?.paymentStatus === "unpaid"
  );
  const pendingRequest = pendingChangeRequests[0];
  const hasItems = unreadCount > 0 || !!unpaidActivity || !!pendingRequest;

  return (
    <div className={`${CARD} p-6 flex flex-col`}>
      {/* Card header */}
      <div className="flex items-center gap-3 mb-6">
        <AccentChip
          icon="pending_actions"
          bg="bg-[#FFF7ED]"
          fg="text-[#C2410C]"
        />
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Pending Actions</h2>
      </div>

      <div className="flex flex-col gap-3 flex-1">
        {/* Unread messages */}
        {unreadCount > 0 && (
          <a
            href="/messages"
            className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">mail</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-white truncate">New Messages</p>
                <p className="text-xs text-slate-500 truncate">
                  {unreadCount} unread from Co-Parent
                </p>
              </div>
            </div>
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-slate-300 group-hover:text-[#6BCABD] transition-colors text-sm shrink-0 ml-2"
            >
              arrow_forward_ios
            </span>
          </a>
        )}

        {/* Unpaid expense */}
        {unpaidActivity && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors group">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">receipt_long</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-white truncate">Expense Approval</p>
                <p className="text-xs text-slate-500 truncate">
                  ${((unpaidActivity.meta?.amountCents as number ?? 0) / 100).toFixed(2)} for{" "}
                  {expenseLabelFromSummary(unpaidActivity.summary)}
                </p>
              </div>
            </div>
            <a
              href="/expenses"
              className="shrink-0 ml-2 px-3 py-1 bg-white dark:bg-[#1e2928] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold shadow-sm hover:border-[#6BCABD] hover:text-[#6BCABD] transition-colors"
            >
              Review
            </a>
          </div>
        )}

        {/* Pending schedule change */}
        {pendingRequest && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors group">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">edit_calendar</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-white truncate">Schedule Change</p>
                <p className="text-xs text-slate-500 truncate">{pendingRequest.title}</p>
              </div>
            </div>
            <a
              href="/calendar/change-requests"
              className="shrink-0 ml-2 px-3 py-1 bg-white dark:bg-[#1e2928] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold shadow-sm hover:border-[#6BCABD] hover:text-[#6BCABD] transition-colors"
            >
              View
            </a>
          </div>
        )}

        {/* Empty state */}
        {!hasItems && (
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-4xl text-green-400">check_circle</span>
            <p className="text-sm font-medium text-slate-500">All caught up!</p>
            <p className="text-xs text-slate-400 text-center">No pending actions at the moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Recent Moments Card ──────────────────────────────────────────────────────

function MomentsCard({
  moments,
  parents,
}: Readonly<{ moments: Moment[]; parents: [Parent, Parent] }>) {
  const display = moments.slice(0, 3);

  function parentName(id: string): string {
    const p = parents.find((p) => p.id === id);
    return p ? p.name.split(" ")[0] : "Parent";
  }

  return (
    <div className={`${CARD} p-6 md:col-span-2 xl:col-span-2`}>
      {/* Card header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-pink-50 p-2 rounded-lg text-pink-500 shrink-0">
            <span aria-hidden="true" className="material-symbols-outlined">collections</span>
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Recent Moments</h2>
        </div>
        <div className="flex gap-2">
          <button
            aria-label="Previous moments"
            className="w-10 h-10 flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_back</span>
          </button>
          <button
            aria-label="Next moments"
            className="w-10 h-10 flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* Horizontal scroll strip */}
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x scrollbar-thin">
        {display.map((moment) => (
          <div key={moment.id} className="min-w-[180px] md:min-w-[220px] snap-start shrink-0">
            <div className="aspect-[4/3] bg-slate-200 dark:bg-slate-800 rounded-xl overflow-hidden relative group cursor-pointer">
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                style={{ backgroundImage: `url('${moment.mediaUrl}')` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                <p className="text-white text-xs font-medium truncate">
                  {moment.caption ?? "Shared Moment"}
                </p>
              </div>
              {moment.reactions.length > 0 && (
                <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-sm text-white text-xs rounded-full px-1.5 py-0.5">
                  {moment.reactions[0].emoji}
                </div>
              )}
            </div>
            <div className="mt-2">
              <p className="text-sm font-bold text-slate-800 dark:text-white truncate">
                {moment.caption ?? "Shared Moment"}
              </p>
              <p className="text-xs text-slate-500">
                {relativeTime(moment.createdAt)} · Added by {parentName(moment.uploadedBy)}
              </p>
            </div>
          </div>
        ))}

        {/* Add New tile */}
        <div className="min-w-[100px] snap-start shrink-0 flex flex-col justify-center">
          <a
            href="/moments/share"
            className="aspect-[4/3] w-full rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 hover:border-[#6BCABD] hover:text-[#6BCABD] hover:bg-[#6BCABD]/5 transition-all"
            aria-label="Add new moment"
          >
            <span aria-hidden="true" className="material-symbols-outlined mb-1">add_circle</span>
            <span className="text-xs font-bold">Add New</span>
          </a>
          {/* Spacer to align with moment tiles */}
          <div className="mt-2 h-9" />
        </div>
      </div>
    </div>
  );
}

// ─── Floating Action Button ───────────────────────────────────────────────────

/**
 * CSS-only FAB: submenu is shown on :hover of the outer group div via Tailwind
 * group-hover utilities. No client-side JS needed — works as a Server Component.
 */
function FloatingActionButton() {
  return (
    <div className="absolute bottom-8 right-8 z-50 group">
      {/* Tooltip */}
      <div
        aria-hidden="true"
        className="absolute bottom-full right-0 mb-3 px-3 py-1 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg"
      >
        Quick Actions
      </div>

      {/* Main FAB button */}
      <button
        aria-label="Quick Actions"
        aria-haspopup="true"
        className="bg-[#6BCABD] hover:bg-[#4FB8A9] text-white w-14 h-14 rounded-full shadow-lg shadow-[#6BCABD]/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-[#6BCABD]/20"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-2xl">add</span>
      </button>

      {/* Submenu — visible on group hover via CSS */}
      <div
        className="absolute bottom-16 right-0 flex flex-col gap-3 items-end invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-300 origin-bottom-right scale-90 group-hover:scale-100"
        role="menu"
        aria-label="Quick action options"
      >
        <a
          href="/expenses/add"
          role="menuitem"
          className="flex items-center gap-3 bg-white dark:bg-[#1e2928] text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-full shadow-md hover:bg-slate-50 dark:hover:bg-white/5 border border-slate-100 dark:border-slate-700 whitespace-nowrap transition-colors"
        >
          <span className="text-sm font-semibold">Log Expense</span>
          <span aria-hidden="true" className="material-symbols-outlined text-[#6BCABD] text-[18px]">attach_money</span>
        </a>
        <a
          href="/moments/share"
          role="menuitem"
          className="flex items-center gap-3 bg-white dark:bg-[#1e2928] text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-full shadow-md hover:bg-slate-50 dark:hover:bg-white/5 border border-slate-100 dark:border-slate-700 whitespace-nowrap transition-colors"
        >
          <span className="text-sm font-semibold">Add Moment</span>
          <span aria-hidden="true" className="material-symbols-outlined text-pink-500 text-[18px]">photo_camera</span>
        </a>
      </div>
    </div>
  );
}

// ─── Page Entry Point ─────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // ── Authentication ─────────────────────────────────────────────────────
  const user = await requireAuth();

  // ── Parent & family lookup ─────────────────────────────────────────────
  const parent = await db.parents.findByUserId(user.userId);
  if (!parent) redirect("/calendar/wizard?onboarding=1");

  const dbFamily = await db.families.findById(parent.familyId);
  if (!dbFamily) redirect("/calendar/wizard?onboarding=1");

  // ── Parallel data fetch ────────────────────────────────────────────────
  const [
    dbParents,
    dbChildren,
    dbEvents,
    dbChangeRequests,
    dbMessages,
    dbExpenses,
    dbMoments,
  ] = await Promise.all([
    db.parents.findByFamilyId(parent.familyId),
    db.children.findByFamilyId(parent.familyId),
    db.calendarEvents.findByFamilyId(parent.familyId),
    db.scheduleChangeRequests.findByFamilyId(parent.familyId),
    db.messages.findByFamilyId(parent.familyId),
    db.expenses.findByFamilyId(parent.familyId),
    db.moments.findByFamilyId(parent.familyId),
  ]);

  if (dbParents.length < 2) redirect("/calendar/wizard?onboarding=1");

  const mappedParents: Parent[] = dbParents.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    avatarUrl: p.avatarUrl,
    phone: p.phone,
  }));

  const [primaryParent, secondaryParent] = mappedParents as [Parent, Parent];

  // ── Schedule blocks ────────────────────────────────────────────────────
  let scheduleBlocks;
  if (dbFamily.scheduleId === "alternating-weeks") {
    scheduleBlocks = SchedulePresets.alternatingWeeks(primaryParent.id, secondaryParent.id);
  } else if (dbFamily.scheduleId === "3-4-4-3") {
    scheduleBlocks = SchedulePresets.threeFourFourThree(primaryParent.id, secondaryParent.id);
  } else {
    scheduleBlocks = SchedulePresets.twoTwoThree(primaryParent.id, secondaryParent.id);
  }

  // ── Build family object ────────────────────────────────────────────────
  const family: Family = {
    id: dbFamily.id,
    custodyAnchorDate: dbFamily.custodyAnchorDate,
    schedule: {
      id: dbFamily.scheduleId || "2-2-3",
      name: "Family Schedule",
      transitionHour: 17,
      blocks: scheduleBlocks,
    },
    parents: [primaryParent, secondaryParent],
    children: (dbChildren as unknown as Family["children"]),
  };

  const input = {
    currentParent: {
      id: parent.id,
      name: parent.name,
      email: parent.email,
      avatarUrl: parent.avatarUrl,
    },
    family,
    events:           (dbEvents          as unknown as CalendarEvent[]),
    changeRequests:   (dbChangeRequests  as unknown as ScheduleChangeRequest[]),
    messages:         (dbMessages        as unknown as Message[]),
    expenses:         (dbExpenses        as unknown as Expense[]),
    moments:          (dbMoments         as unknown as Moment[]),
    reminders:        [] as Reminder[],
  };

  const data = aggregateDashboard(input);

  // Does the logged-in user currently hold custody?
  const isCurrentUserCustody = data.custody.currentParent.id === data.currentParent.id;

  return (
    /* Full-height flex layout — no overflow at root */
    <div className="flex h-screen overflow-hidden bg-[#f6f8f7] dark:bg-[#141e1d] antialiased">
      <Sidebar
        currentParent={data.currentParent}
        unreadCount={data.unreadMessageCount}
      />

      <main
        id="main-content"
        className="flex-1 flex flex-col h-full relative overflow-hidden"
      >
        <DashboardHeader unreadCount={data.unreadMessageCount} />

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl mx-auto pb-24">
            <CustodyScheduleCard
              custody={data.custody}
              upcomingTransitions={data.upcomingTransitions}
              monthlyOwnership={data.monthlyOwnership}
              family={data.family}
              isCurrentUser={isCurrentUserCustody}
              upcomingEvents={data.upcomingEvents}
            />
            <CommHealthCard climate={data.climate} />
            <PendingActionsCard
              unreadCount={data.unreadMessageCount}
              recentActivity={data.recentActivity}
              pendingChangeRequests={data.pendingChangeRequests}
            />
            <MomentsCard
              moments={data.moments}
              parents={family.parents}
            />
          </div>
        </div>

        {/* FAB — absolute relative to main (stays fixed in viewport) */}
        <FloatingActionButton />
      </main>
    </div>
  );
}
