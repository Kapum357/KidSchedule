/**
 * KidSchedule – School & PTA Portal Page
 *
 * Server Component that renders the school coordination hub:
 * - Upcoming school events with urgency-based priority ordering
 * - Volunteering sync with fairness-based task assignment suggestions
 * - School contacts directory with search interface
 * - School Vault for document storage with pending-action highlighting
 * - Today's lunch menu with account balance
 *
 * Uses PTAEngine for:
 * - getUpcomingEvents(): sorts by action-required + date
 * - calculateVolunteerBalances(): tracks hour commitments per parent
 * - suggestAssignee(): recommends who should take unassigned tasks
 * - getVaultDocuments(): surfaces pending-signature docs first
 * - getDailyLunch(): retrieves today's menu
 * - formatEventDateBadge() / formatEventTimeRange(): display formatting
 *
 * Data is loaded from persistence repositories and mapped into domain types.
 */

import type {
  ContactRole,
  DocumentStatus,
  SchoolEvent,
  SchoolEventType,
  VolunteerTask,
  VolunteerStatus,
  SchoolContact,
  SchoolVaultDocument,
  LunchMenu,
  VolunteerBalance,
} from "@/types";
import {
  PTAEngine,
} from "@/lib/pta-engine";
import { ThemeToggle } from "@/app/theme-toggle";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/persistence";
import { redirect } from "next/navigation";
import Link from "next/link";

type SchoolTab = "overview" | "events" | "volunteering" | "contacts" | "vault";

type SchoolSearchParams = {
  q?: string;
  tab?: string;
};

const SCHOOL_TABS: ReadonlySet<SchoolTab> = new Set<SchoolTab>([
  "overview",
  "events",
  "volunteering",
  "contacts",
  "vault",
]);

function isSchoolTab(value: string): value is SchoolTab {
  return SCHOOL_TABS.has(value as SchoolTab);
}

function buildSchoolUrl(params: { tab?: SchoolTab; q?: string }): string {
  const next = new URLSearchParams();
  if (params.tab && params.tab !== "overview") {
    next.set("tab", params.tab);
  }
  if (params.q && params.q.trim().length > 0) {
    next.set("q", params.q.trim());
  }
  const query = next.toString();
  return query.length > 0 ? `/school?${query}` : "/school";
}

function parseJsonStringArray(input: string): string[] {
  try {
    const parsed: unknown = JSON.parse(input);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    return [];
  } catch {
    return [];
  }
}

function toSchoolEventType(value: string): SchoolEventType {
  const allowed: SchoolEventType[] = [
    "pta_meeting",
    "bake_sale",
    "conference",
    "rehearsal",
    "performance",
    "parade",
    "field_trip",
    "sports",
    "other",
  ];
  return allowed.includes(value as SchoolEventType)
    ? (value as SchoolEventType)
    : "other";
}

function toVolunteerStatus(value: string): VolunteerStatus {
  const allowed: VolunteerStatus[] = ["open", "assigned", "completed", "cancelled"];
  return allowed.includes(value as VolunteerStatus)
    ? (value as VolunteerStatus)
    : "open";
}

function toContactRole(value: string): ContactRole {
  const allowed: ContactRole[] = [
    "teacher",
    "principal",
    "vice_principal",
    "nurse",
    "counselor",
    "pta_board",
    "coach",
    "staff",
  ];
  return allowed.includes(value as ContactRole)
    ? (value as ContactRole)
    : "staff";
}

function toDocumentStatus(value: string): DocumentStatus {
  const allowed: DocumentStatus[] = ["available", "pending_signature", "signed", "expired"];
  return allowed.includes(value as DocumentStatus)
    ? (value as DocumentStatus)
    : "available";
}

function mapDbSchoolEventToDomain(dbEvent: Awaited<ReturnType<typeof db.schoolEvents.findByFamilyId>>[number]): SchoolEvent {
  return {
    id: dbEvent.id,
    familyId: dbEvent.familyId,
    title: dbEvent.title,
    description: dbEvent.description,
    eventType: toSchoolEventType(dbEvent.eventType),
    startAt: dbEvent.startAt,
    endAt: dbEvent.endAt,
    location: dbEvent.location,
    isAllDay: dbEvent.isAllDay,
    attendingParentIds: parseJsonStringArray(dbEvent.attendingParentIds),
    actionRequired: dbEvent.actionRequired,
    actionDeadline: dbEvent.actionDeadline,
    actionDescription: dbEvent.actionDescription,
    volunteerTaskIds: parseJsonStringArray(dbEvent.volunteerTaskIds),
    accentColor:
      dbEvent.accentColor === "teal" ||
      dbEvent.accentColor === "amber" ||
      dbEvent.accentColor === "blue" ||
      dbEvent.accentColor === "rose" ||
      dbEvent.accentColor === "purple"
        ? dbEvent.accentColor
        : undefined,
    icon: dbEvent.icon,
  };
}

function mapDbVolunteerTaskToDomain(dbTask: Awaited<ReturnType<typeof db.volunteerTasks.findByFamilyId>>[number]): VolunteerTask {
  return {
    id: dbTask.id,
    familyId: dbTask.familyId,
    eventId: dbTask.eventId,
    title: dbTask.title,
    description: dbTask.description,
    assignedParentId: dbTask.assignedParentId,
    status: toVolunteerStatus(dbTask.status),
    estimatedHours: dbTask.estimatedHours,
    scheduledFor: dbTask.scheduledFor,
    completedAt: dbTask.completedAt,
    icon: dbTask.icon,
    iconColor: dbTask.iconColor,
  };
}

function mapDbSchoolContactToDomain(dbContact: Awaited<ReturnType<typeof db.schoolContacts.findByFamilyId>>[number]): SchoolContact {
  return {
    id: dbContact.id,
    name: dbContact.name,
    initials: dbContact.initials,
    role: toContactRole(dbContact.role),
    roleLabel: dbContact.roleLabel,
    email: dbContact.email,
    phone: dbContact.phone,
    avatarColor: dbContact.avatarColor,
  };
}

function mapDbSchoolVaultDocumentToDomain(
  dbDocument: Awaited<ReturnType<typeof db.schoolVaultDocuments.findByFamilyId>>[number]
): SchoolVaultDocument {
  return {
    id: dbDocument.id,
    familyId: dbDocument.familyId,
    title: dbDocument.title,
    fileType:
      dbDocument.fileType === "pdf" ||
      dbDocument.fileType === "image" ||
      dbDocument.fileType === "archive" ||
      dbDocument.fileType === "document" ||
      dbDocument.fileType === "spreadsheet"
        ? dbDocument.fileType
        : "document",
    status: toDocumentStatus(dbDocument.status),
    statusLabel: dbDocument.statusLabel,
    addedAt: dbDocument.addedAt,
    addedBy: dbDocument.addedBy,
    sizeBytes: dbDocument.sizeBytes,
    url: dbDocument.url,
    actionDeadline: dbDocument.actionDeadline,
  };
}

function mapDbLunchMenuToDomain(dbMenu: Awaited<ReturnType<typeof db.lunchMenus.findByFamilyIdSince>>[number]): LunchMenu {
  return {
    date: dbMenu.date,
    mainOption: dbMenu.mainOption,
    alternativeOption: dbMenu.alternativeOption,
    side: dbMenu.side,
    accountBalance: dbMenu.accountBalance,
  };
}

// ─── Module-level constants (avoid Date.now() inside render) ──────────────────

// ─── Sub-components ────────────────────────────────────────────────────────────

// ── Event Cards ───────────────────────────────────────────────────────────────

function EventCardBadge({
  event,
  currentParentId,
  parentNames,
}: Readonly<{
  event: SchoolEvent;
  currentParentId: string;
  parentNames: Record<string, string>;
}>) {
  if (event.actionRequired) {
    return (
      <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
        Action Required
      </span>
    );
  }

  const attendingNames = event.attendingParentIds.map(
    (id) => parentNames[id] ?? id
  );
  if (attendingNames.length > 0) {
    const isCurrentParent = event.attendingParentIds.includes(currentParentId);
    return (
      <span className="text-xs text-slate-600 dark:text-slate-400">
        {isCurrentParent ? "You are volunteering" : `${attendingNames[0]} attending`}
      </span>
    );
  }

  return null;
}

function EventCard({
  event,
  engine,
  currentParentId,
  parentNames,
}: Readonly<{
  event: SchoolEvent;
  engine: PTAEngine;
  currentParentId: string;
  parentNames: Record<string, string>;
}>) {
  const isAccentTeal = event.accentColor === "teal";
  const isAccentAmber = event.accentColor === "amber";

  const cardCls = isAccentTeal
    ? "bg-teal-50 dark:bg-teal-900/10 border-teal-100 dark:border-teal-900/30"
    : isAccentAmber
    ? "bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30"
    : "bg-white dark:bg-[#1A2633] border-slate-200 dark:border-slate-700 hover:border-primary/50 cursor-pointer";

  const badgeCls = isAccentTeal
    ? "bg-white dark:bg-[#1A2633] text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-800"
    : isAccentAmber
    ? "bg-white dark:bg-[#1A2633] text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-800"
    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300";

  const iconCls = isAccentTeal
    ? "text-teal-400"
    : isAccentAmber
    ? "text-amber-400"
    : "text-slate-400";

  return (
    <div className={`flex flex-col p-4 rounded-lg border transition-colors ${cardCls}`}>
      <div className="flex justify-between items-start mb-2">
        <span className={`text-xs font-bold px-2 py-1 rounded ${badgeCls}`}>
          {engine.formatEventDateBadge(event)}
        </span>
        {event.icon && (
          <span aria-hidden="true" className={`material-symbols-outlined text-lg ${iconCls}`}>
            {event.icon}
          </span>
        )}
      </div>

      <h4 className="font-bold text-slate-900 dark:text-white text-sm">
        {event.title}
      </h4>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        {engine.formatEventTimeRange(event)}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <EventCardBadge event={event} currentParentId={currentParentId} parentNames={parentNames} />
      </div>
    </div>
  );
}

// ── Volunteer Task Row ────────────────────────────────────────────────────────

function VolunteerTaskRow({
  task,
  suggestedParentId,
  currentParentId,
  parentNames,
}: Readonly<{
  task: VolunteerTask;
  suggestedParentId: string | null;
  currentParentId: string;
  parentNames: Record<string, string>;
}>) {
  const isOpen = task.status === "open";
  const isAssignedToCurrentUser = task.assignedParentId === currentParentId;
  const assigneeName = task.assignedParentId
    ? (parentNames[task.assignedParentId] ?? task.assignedParentId)
    : "Unassigned";

  const iconBgMap: Record<string, string> = {
    teal:   "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400",
    blue:   "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400",
    purple: "bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400",
    amber:  "bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400",
  };
  const iconCls = iconBgMap[task.iconColor ?? ""] ?? "bg-white dark:bg-slate-700 text-slate-600";

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded shadow-sm ${iconCls}`}>
          <span aria-hidden="true" className="material-symbols-outlined text-xl">
            {task.icon ?? "volunteer_activism"}
          </span>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
            {task.title}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {task.estimatedHours}h · {new Date(task.scheduledFor).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isOpen ? (
          <>
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 opacity-60">
              <div className="size-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px]">
                ?
              </div>
              <span className="text-xs font-medium text-slate-500">
                {suggestedParentId
                  ? `Suggested: ${parentNames[suggestedParentId] ?? suggestedParentId}`
                  : "Unassigned"}
              </span>
            </div>
            <button className="text-xs font-bold text-primary hover:text-primary-hover uppercase tracking-wide transition-colors">
              Sign Up
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
              <div className="size-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                {(parentNames[task.assignedParentId ?? ""] ?? "?")[0]}
              </div>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {assigneeName}
              </span>
            </div>
            {isAssignedToCurrentUser && (
              <span aria-hidden="true" className="material-symbols-outlined text-green-500 text-lg">
                check_circle
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── School Contact Card ───────────────────────────────────────────────────────

function ContactCard({ contact }: Readonly<{ contact: SchoolContact }>) {
  const avatarBgMap: Record<string, string> = {
    indigo:  "bg-indigo-100 text-indigo-600",
    rose:    "bg-rose-100 text-rose-600",
    emerald: "bg-emerald-100 text-emerald-600",
    slate:   "bg-slate-100 text-slate-600",
    blue:    "bg-blue-100 text-blue-600",
    amber:   "bg-amber-100 text-amber-600",
  };
  const avatarCls = avatarBgMap[contact.avatarColor] ?? "bg-slate-100 text-slate-600";

  return (
    <div className="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700">
      <div className={`size-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${avatarCls}`}>
        {contact.initials}
      </div>
      <div className="flex-1 min-w-0">
        <h5 className="text-sm font-bold text-slate-900 dark:text-white">
          {contact.name}
        </h5>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {contact.roleLabel}
        </p>
        <div className="flex gap-3 mt-2">
          {contact.email && (
            <a
              className="text-xs text-primary hover:underline flex items-center gap-1"
              href={`mailto:${contact.email}`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-xs">mail</span>
              Email
            </a>
          )}
          {contact.phone && (
            <a
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
              href={`tel:${contact.phone}`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-xs">call</span>
              Call
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Vault Document Row ────────────────────────────────────────────────────────

function VaultDocumentRow({
  doc,
  engine,
}: Readonly<{ doc: SchoolVaultDocument; engine: PTAEngine }>) {
  const isPending = doc.status === "pending_signature";

  const colorMap: Record<string, string> = {
    red:     "bg-red-50 text-red-500",
    green:   "bg-green-50 text-green-500",
    yellow:  "bg-yellow-50 text-yellow-600",
    blue:    "bg-blue-50 text-blue-500",
    emerald: "bg-emerald-50 text-emerald-500",
    slate:   "bg-slate-50 text-slate-500",
  };
  const iconColor = engine.getDocumentIconColor(doc.fileType);
  const iconCls = colorMap[iconColor] ?? "bg-slate-50 text-slate-500";

  return (
    <div className="group flex items-center p-3 bg-white dark:bg-[#101922] rounded-lg border border-slate-100 dark:border-slate-800 hover:border-primary/30 shadow-sm transition-all cursor-pointer">
      <div className={`p-2 rounded mr-3 ${iconCls}`}>
        <span aria-hidden="true" className="material-symbols-outlined text-xl">
          {engine.getDocumentIcon(doc.fileType)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
          {doc.title}
        </h4>
        <p className="text-[10px] text-slate-500 uppercase tracking-wide">
          {doc.statusLabel}
        </p>
      </div>
      {isPending ? (
        <span className="size-2 rounded-full bg-orange-400 animate-pulse" />
      ) : (
        <span aria-hidden="true" className="material-symbols-outlined text-slate-300 group-hover:text-primary transition-colors">
          download
        </span>
      )}
    </div>
  );
}

// ── Volunteer Balance Bar ─────────────────────────────────────────────────────

function VolunteerBalanceBar({
  balances,
  currentParentId,
  parentNames,
}: Readonly<{
  balances: VolunteerBalance[];
  currentParentId: string;
  parentNames: Record<string, string>;
}>) {
  if (balances.length < 2) return null;

  const total = balances.reduce((s, b) => s + b.totalHoursCommitted, 0);
  if (total === 0) return null;

  const pct = (b: VolunteerBalance) =>
    Math.round((b.totalHoursCommitted / total) * 100);

  return (
    <div className="mb-5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
        Volunteer Balance
      </p>
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
        {balances.map((b) => (
          <div
            key={b.parentId}
            className={`h-full rounded-full transition-all ${
              b.parentId === currentParentId ? "bg-primary" : "bg-slate-300 dark:bg-slate-600"
            }`}
            style={{ width: `${pct(b)}%` }}
            title={`${parentNames[b.parentId] ?? b.parentId}: ${b.totalHoursCommitted}h`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1">
        {balances.map((b) => (
          <span key={b.parentId} className="text-[10px] text-slate-500">
            {parentNames[b.parentId] ?? b.parentId}: {b.totalHoursCommitted}h
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Lunch Widget ──────────────────────────────────────────────────────────────

function LunchWidget({
  menu,
  engine,
}: Readonly<{ menu: LunchMenu; engine: PTAEngine }>) {
  return (
    <div className="bg-white dark:bg-[#1A2633] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <h3 className="font-bold text-slate-900 dark:text-white text-sm uppercase tracking-wide mb-3">
        Today&apos;s Lunch
      </h3>
      <div className="flex items-center gap-4">
        <div className="size-12 bg-orange-100 rounded-lg flex items-center justify-center text-orange-500">
          <span aria-hidden="true" className="material-symbols-outlined text-2xl">restaurant</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {menu.mainOption.name}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {menu.mainOption.description}
            {menu.side ? ` with ${menu.side}` : ""}
          </p>
        </div>
      </div>
      {menu.alternativeOption && (
        <p className="text-xs text-slate-400 mt-2 pl-16">
          Alt: {menu.alternativeOption.name}
          {menu.alternativeOption.isVegetarian && (
            <span className="ml-1 text-green-500">(V)</span>
          )}
        </p>
      )}
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
        <span className="text-xs font-medium text-slate-500">Account Balance</span>
        <span className="text-sm font-bold text-green-600">
          {engine.formatBalance(menu.accountBalance)}
        </span>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

/**
 * School & PTA Portal – Server Component.
 *
 * Data flow:
 *
 * In production:
 *   db.schoolEvent.findMany({ where: { familyId, startAt: { gte: now } } })
 *   → PTAEngine.getUpcomingEvents()
 *   → render
 *
 * PTAEngine is instantiated once and reused across all helper calls
 * (stateless class – no side effects, safe to share across renders).
 */
export default async function SchoolPortalPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<SchoolSearchParams> }>) {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const user = await requireAuth();
  const currentParent = await db.parents.findByUserId(user.userId);
  if (!currentParent) {
    redirect("/calendar/wizard?onboarding=1");
  }
  const activeParent = currentParent as NonNullable<typeof currentParent>;

  let dbFamilyParents: Awaited<ReturnType<typeof db.parents.findByFamilyId>> = [];
  let dbSchoolEvents: Awaited<ReturnType<typeof db.schoolEvents.findUpcoming>> = [];
  let dbVolunteerTasks: Awaited<ReturnType<typeof db.volunteerTasks.findByFamilyId>> = [];
  let dbSchoolContacts: Awaited<ReturnType<typeof db.schoolContacts.findByFamilyId>> = [];
  let dbSchoolVaultDocuments: Awaited<ReturnType<typeof db.schoolVaultDocuments.findByFamilyId>> = [];
  let dbLunchMenus: Awaited<ReturnType<typeof db.lunchMenus.findByFamilyIdSince>> = [];

  try {
    [
      dbFamilyParents,
      dbSchoolEvents,
      dbVolunteerTasks,
      dbSchoolContacts,
      dbSchoolVaultDocuments,
      dbLunchMenus,
    ] = await Promise.all([
      db.parents.findByFamilyId(activeParent.familyId),
      db.schoolEvents.findUpcoming(activeParent.familyId, now.toISOString()),
      db.volunteerTasks.findByFamilyId(activeParent.familyId),
      db.schoolContacts.findByFamilyId(activeParent.familyId),
      db.schoolVaultDocuments.findByFamilyId(activeParent.familyId),
      db.lunchMenus.findByFamilyIdSince(activeParent.familyId, todayStr),
    ]);
  } catch (error) {
    console.error("[School] Failed to load school portal data", error);
  }

  const allEvents = dbSchoolEvents.map(mapDbSchoolEventToDomain);
  const allTasks = dbVolunteerTasks.map(mapDbVolunteerTaskToDomain);
  const allContacts = dbSchoolContacts.map(mapDbSchoolContactToDomain);
  const allDocs = dbSchoolVaultDocuments.map(mapDbSchoolVaultDocumentToDomain);
  const allMenus = dbLunchMenus.map(mapDbLunchMenuToDomain);

  const parentNames: Record<string, string> = dbFamilyParents.reduce<Record<string, string>>(
    (acc, parent) => {
      acc[parent.id] = parent.id === activeParent.id ? `${parent.name} (Me)` : parent.name;
      return acc;
    },
    {}
  );

  if (!parentNames[activeParent.id]) {
    parentNames[activeParent.id] = `${activeParent.name} (Me)`;
  }

  const parentIdsForBalances =
    dbFamilyParents.length > 0
      ? dbFamilyParents.map((parent) => parent.id)
      : [activeParent.id];

  const engine = new PTAEngine();
  const params = await searchParams;
  const searchQuery = (params?.q ?? "").trim();

  let activeTab: SchoolTab = "overview";
  const rawTab = params?.tab;
  if (rawTab !== undefined) {
    if (!isSchoolTab(rawTab)) {
      redirect(buildSchoolUrl({ q: searchQuery }));
    }
    activeTab = rawTab as SchoolTab;
  }

  // Sorted events: action-required first, then chronological
  const upcomingEvents = engine.getUpcomingEvents(allEvents, allTasks, now);

  // Volunteer balances across family parents
  const balances = engine.calculateVolunteerBalances(allTasks, parentIdsForBalances);

  // Pre-compute suggested assignee for each open task
  const taskSuggestions = new Map<string, string | null>(
    allTasks.map((t) => [
      t.id,
      t.status === "open" ? engine.suggestAssignee(t, balances) : null,
    ])
  );

  // Vault: pending-signature docs first, then newest
  const sortedDocs = engine.getVaultDocuments(allDocs);

  // Today's lunch
  const todayLunch = engine.getDailyLunch(allMenus, todayStr);

  // Pending action count for notification badge
  const pendingCount = engine.getPendingActionCount(allEvents, allDocs, now);

  const contactResults = engine.searchContacts(allContacts, searchQuery);
  const visibleContacts = searchQuery
    ? contactResults.map((result) => result.contact)
    : allContacts;

  const showEvents = activeTab === "overview" || activeTab === "events";
  const showVolunteering =
    activeTab === "overview" || activeTab === "volunteering";
  const showContacts = activeTab === "overview" || activeTab === "contacts";
  const showVault = activeTab === "overview" || activeTab === "vault";
  const showRightRail = showVault;

  return (
    <>
      <div className="relative flex min-h-screen w-full flex-row overflow-hidden">
        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <nav aria-label="Primary school sidebar" className="w-72 bg-white dark:bg-[#1A2633] border-r border-slate-200 dark:border-slate-800 flex-col justify-between hidden lg:flex sticky top-0 h-screen z-20">
        <div className="flex flex-col gap-6 p-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex items-center justify-center rounded-lg size-10 text-primary">
              <span aria-hidden="true" className="material-symbols-outlined text-2xl">school</span>
            </div>
            <div className="flex flex-col">
              <h1 className="text-slate-900 dark:text-white text-base font-bold leading-none">
                KidSchedule
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium leading-normal mt-1">
                School &amp; PTA Portal
              </p>
            </div>
          </div>

          {/* Nav */}
          <nav aria-label="School portal sections" className="flex flex-col gap-2">
            {[
              { icon: "dashboard", label: "Dashboard", href: "/dashboard" },
              { icon: "school", label: "School Portal", href: "/school", active: true },
              { icon: "calendar_month", label: "Calendar", href: "/calendar" },
              { icon: "payments", label: "Expenses", href: "/expenses" },
              { icon: "description", label: "Vault", href: "/vault" },
            ].map((item) => (
              <a
                key={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  item.active
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                }`}
                href={item.href}
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined"
                  style={item.active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {item.icon}
                </span>
                <span className={`text-sm ${item.active ? "font-semibold" : "font-medium"}`}>
                  {item.label}
                </span>
              </a>
            ))}

            {/* Messages with badge */}
            <a
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              href="/messages"
            >
              <span aria-hidden="true" className="material-symbols-outlined">chat_bubble</span>
              <span className="text-sm font-medium">Messages</span>
              <span className="ml-auto bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 text-xs font-bold px-2 py-0.5 rounded-full">
                1
              </span>
            </a>
          </nav>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 p-6 border-t border-slate-200 dark:border-slate-800">
          <a
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            href="/settings"
          >
            <span aria-hidden="true" className="material-symbols-outlined">settings</span>
            <span className="text-sm font-medium">Settings</span>
          </a>
          <div className="flex items-center gap-3 px-4 py-3 mt-2">
            <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm border-2 border-slate-100 dark:border-slate-700">
              AM
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                Alex M.
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Log Out
              </span>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main id="main-content" className="flex-1 flex flex-col h-screen overflow-y-auto">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-[#1A2633] border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="material-symbols-outlined text-primary text-3xl">school</span>
            <h1 className="font-bold text-lg">KidSchedule</h1>
          </div>
          <button 
            className="p-2.5 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" 
            aria-label="Open menu"
          >
            <span aria-hidden="true" className="material-symbols-outlined">menu</span>
          </button>
        </header>

        {/* Desktop page header */}
        <div className="hidden lg:flex items-center justify-between px-8 py-6 bg-background-light dark:bg-background-dark">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              School Coordination
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Manage PTA events, volunteering, and school documents.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button aria-label="Sync school calendar" className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-lg shadow-sm font-medium transition-all text-sm group">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px] group-hover:rotate-180 transition-transform duration-500">
                sync
              </span>
              <span>Sync School Calendar</span>
            </button>
            <button
              className="relative p-2.5 bg-white dark:bg-[#1A2633] text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
              aria-label={`${pendingCount} pending notifications`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[24px]">notifications</span>
              {pendingCount > 0 && (
                <span className="absolute top-2 right-2.5 size-2 bg-red-500 rounded-full ring-2 ring-white dark:ring-[#1A2633]" />
              )}
            </button>
            <ThemeToggle />
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────────── */}
        <div className="px-4 lg:px-8 pb-10 flex flex-col gap-6 max-w-7xl mx-auto w-full">

          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: "overview", label: "Overview" },
              { key: "events", label: "Events" },
              { key: "volunteering", label: "Volunteering" },
              { key: "contacts", label: "Contacts" },
              { key: "vault", label: "Vault" },
            ] as const).map((tab) => (
              <Link
                key={tab.key}
                href={buildSchoolUrl({ tab: tab.key, q: searchQuery })}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  activeTab === tab.key
                    ? "bg-primary text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-primary hover:text-primary"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>

          {/*── Upcoming Events ─────────────────────────────────────────────── */}
          {showEvents && (
          <section
            aria-label="School Calendar"
            className="bg-white dark:bg-[#1A2633] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-primary">event_note</span>
                <h3 className="font-bold text-slate-900 dark:text-white text-lg">
                  Upcoming School Events
                </h3>
              </div>
              <div className="flex gap-2 items-center">
                <button
                  aria-label="Previous month"
                  className="text-slate-500 hover:text-primary transition-colors"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-base">chevron_left</span>
                </button>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </span>
                <button
                  aria-label="Next month"
                  className="text-slate-500 hover:text-primary transition-colors"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-base">chevron_right</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {upcomingEvents.slice(0, 4).map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  engine={engine}
                  currentParentId={activeParent.id}
                  parentNames={parentNames}
                />
              ))}
            </div>
          </section>
          )}

          {/* ── Two-column layout ───────────────────────────────────────────── */}
          <div className={`grid grid-cols-1 ${showRightRail ? "lg:grid-cols-3" : "lg:grid-cols-1"} gap-6`}>
            <div className={`${showRightRail ? "lg:col-span-2" : ""} flex flex-col gap-6`}>

              {/* ── Volunteering Sync ──────────────────────────────────────── */}
              {showVolunteering && (
              <div className="bg-white dark:bg-[#1A2633] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-900 dark:text-white text-lg">
                    Volunteering Sync
                  </h3>
                  <button className="text-sm text-primary font-medium hover:underline flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded">
                    <span aria-hidden="true" className="material-symbols-outlined text-base">add_circle</span>{" "}
                    Add Task
                  </button>
                </div>

                {/* Fairness balance bar */}
                <VolunteerBalanceBar
                  balances={balances}
                  currentParentId={activeParent.id}
                  parentNames={parentNames}
                />

                <div className="space-y-3">
                  {allTasks.map((task) => (
                    <VolunteerTaskRow
                      key={task.id}
                      task={task}
                      suggestedParentId={taskSuggestions.get(task.id) ?? null}
                      currentParentId={activeParent.id}
                      parentNames={parentNames}
                    />
                  ))}
                </div>
              </div>
              )}

              {/* ── School Contacts ─────────────────────────────────────────── */}
              {showContacts && (
              <div className="bg-white dark:bg-[#1A2633] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-900 dark:text-white text-lg">
                    School Contacts
                  </h3>
                  {/* Search is a UI affordance; wiring requires Client Component */}
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-slate-400">
                      <span aria-hidden="true" className="material-symbols-outlined text-lg">search</span>
                    </span>
                    <input
                      aria-label="Search school contacts"
                      className="pl-8 pr-4 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border-none rounded-md w-40 focus:ring-1 focus:ring-primary text-slate-700 dark:text-slate-300"
                      placeholder="Use ?q=name"
                      value={searchQuery}
                      readOnly
                      type="text"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visibleContacts.map((contact) => (
                    <ContactCard key={contact.id} contact={contact} />
                  ))}
                </div>
              </div>
              )}
            </div>

            {/* ── Right sidebar ──────────────────────────────────────────────── */}
            {showRightRail && (
            <div className="lg:col-span-1 flex flex-col gap-6">

              {/* ── School Vault ───────────────────────────────────────────── */}
              {showVault && (
              <div className="bg-gradient-to-br from-primary-light/50 to-white dark:from-primary/10 dark:to-[#1A2633] p-6 rounded-xl border border-primary-light dark:border-primary/20 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-primary">folder_open</span>
                    <h3 className="font-bold text-slate-900 dark:text-white text-lg">
                      School Vault
                    </h3>
                  </div>
                  <button 
                    className="bg-white dark:bg-slate-800 p-2.5 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 text-slate-600 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    aria-label="Upload document"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-lg">upload</span>
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  {sortedDocs.map((doc) => (
                    <VaultDocumentRow key={doc.id} doc={doc} engine={engine} />
                  ))}
                </div>

                <button className="w-full mt-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-primary hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 rounded transition-all">
                  View All Documents
                </button>
              </div>
              )}

              {/* ── Today's Lunch ─────────────────────────────────────────── */}
              {todayLunch ? (
                <LunchWidget menu={todayLunch} engine={engine} />
              ) : (
                <div className="bg-white dark:bg-[#1A2633] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-center text-sm text-slate-400">
                  No lunch menu available for today.
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      </main>
      </div>
    </>
  );
}
