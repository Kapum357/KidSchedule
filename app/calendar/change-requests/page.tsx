import { redirect } from "next/navigation";

type RequestDirection = "incoming" | "outgoing";
type RequestStatus = "pending_review" | "awaiting_response" | "completed" | "declined";
type RequestKind = "swap" | "time_change" | "adjustment" | "extension";
type RequestTab = "pending" | "history";

type RequestAction = "accept" | "decline" | "cancel";

type ManageChangeRequestsSearchParams = {
  tab?: string;
  flash?: string;
};

type ChangeRequestItem = {
  id: string;
  direction: RequestDirection;
  status: RequestStatus;
  kind: RequestKind;
  title: string;
  submittedLabel: string;
  requestBadge: string;
  statusBadge: string;
  statusTone: "pending" | "muted" | "success" | "declined";
  accent: string;
  summary: string;
  originalPeriod?: string;
  originalHolder?: string;
  proposedPeriod?: string;
  proposedReason?: string;
  detailDate?: string;
  detailText?: string;
  detailQuote?: string;
  completionNote?: string;
  declineReason?: string;
};

const REQUESTS: readonly ChangeRequestItem[] = [
  {
    id: "req-incoming-soccer",
    direction: "incoming",
    status: "pending_review",
    kind: "swap",
    title: "Weekend Swap: Soccer Tournament",
    submittedLabel: "Received today at 9:30 AM",
    requestBadge: "Incoming Request",
    statusBadge: "Pending Review",
    statusTone: "pending",
    accent: "bg-yellow-400",
    summary: "Weekend swap proposal for tournament travel.",
    originalPeriod: "Fri, Oct 20 - Sun, Oct 22",
    originalHolder: "You",
    proposedPeriod: "Fri, Oct 27 - Sun, Oct 29",
    proposedReason: '"Sam has a soccer tournament out of town this weekend. Can we swap?"',
  },
  {
    id: "req-outgoing-late-dropoff",
    direction: "outgoing",
    status: "awaiting_response",
    kind: "time_change",
    title: "Late Drop-off Request",
    submittedLabel: "Sent Yesterday",
    requestBadge: "Outgoing Request",
    statusBadge: "Awaiting Response",
    statusTone: "muted",
    accent: "bg-slate-300 dark:bg-slate-600",
    summary: "Requested 90-minute drop-off shift.",
    detailDate: "Thursday, Oct 19",
    detailText: "Requested drop-off time change from 5:00 PM to 6:30 PM",
    detailQuote: '"Work meeting running late. I can pick up dinner on the way."',
  },
  {
    id: "req-completed-dentist",
    direction: "incoming",
    status: "completed",
    kind: "adjustment",
    title: "Dentist Appointment Adjustment",
    submittedLabel: "Oct 15",
    requestBadge: "Completed",
    statusBadge: "Applied to Calendar",
    statusTone: "success",
    accent: "bg-primary",
    summary: "Request approved and applied to calendar.",
    completionNote: "Request to pick up early for dentist appointment approved by Co-parent.",
  },
  {
    id: "req-declined-holiday",
    direction: "outgoing",
    status: "declined",
    kind: "extension",
    title: "Holiday Extension",
    submittedLabel: "Oct 10",
    requestBadge: "Past Request",
    statusBadge: "Declined",
    statusTone: "declined",
    accent: "bg-slate-400",
    summary: "Request declined due to existing travel plans.",
    declineReason: '"We already booked flights based on the original agreement for those dates. Sorry."',
  },
] as const;

function resolveTab(value: string | undefined): RequestTab {
  return value === "history" ? "history" : "pending";
}

function resolveFlashMessage(code: string | undefined): string | undefined {
  if (code === "accepted") {
    return "Request accepted (demo mode). This would update the custody calendar and notify both parents.";
  }

  if (code === "declined") {
    return "Request declined (demo mode). The sender would receive your response note.";
  }

  if (code === "cancelled") {
    return "Outgoing request cancelled (demo mode).";
  }

  return undefined;
}

function isRequestAction(value: string | undefined): value is RequestAction {
  return value === "accept" || value === "decline" || value === "cancel";
}

function isRequestId(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  return REQUESTS.some((item) => item.id === value);
}

function statusBadgeClass(tone: ChangeRequestItem["statusTone"]): string {
  if (tone === "pending") {
    return "inline-flex items-center rounded-md bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 text-xs font-medium text-yellow-700 dark:text-yellow-400 ring-1 ring-inset ring-yellow-600/20";
  }

  if (tone === "success") {
    return "inline-flex items-center gap-1 rounded-md bg-teal-50 dark:bg-teal-900/20 px-2 py-1 text-xs font-medium text-teal-700 dark:text-teal-400 ring-1 ring-inset ring-teal-600/20";
  }

  if (tone === "declined") {
    return "inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-500/10";
  }

  return "inline-flex items-center rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-500/10";
}

function requestBadgeClass(direction: RequestDirection, status: RequestStatus): string {
  if (direction === "incoming" && status === "pending_review") {
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800";
  }

  if (status === "completed") {
    return "bg-primary/10 text-primary border border-primary/20";
  }

  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700";
}

function visibleInTab(item: ChangeRequestItem, tab: RequestTab): boolean {
  if (tab === "pending") {
    return item.status === "pending_review" || item.status === "awaiting_response";
  }

  return item.status === "completed" || item.status === "declined";
}

async function submitRequestDecision(formData: FormData): Promise<void> {
  "use server";

  const requestId = ((formData.get("requestId") as string | null) ?? "").trim();
  const actionRaw = ((formData.get("action") as string | null) ?? "").trim();
  const tabRaw = ((formData.get("tab") as string | null) ?? "").trim();

  const tab = resolveTab(tabRaw);
  const action = isRequestAction(actionRaw) ? actionRaw : "decline";

  if (!isRequestId(requestId)) {
    redirect(`/calendar/change-requests?tab=${tab}`);
  }

  let flash = "declined";
  if (action === "accept") {
    flash = "accepted";
  }

  if (action === "cancel") {
    flash = "cancelled";
  }

  redirect(`/calendar/change-requests?tab=${tab}&flash=${flash}`);
}

function IncomingPendingCard({ item, tab }: Readonly<{ item: ChangeRequestItem; tab: RequestTab }>) {
  return (
    <article className="group relative overflow-hidden rounded-xl border border-slate-200 bg-surface-light shadow-sm dark:border-slate-800 dark:bg-surface-dark">
      <div className={`absolute left-0 top-0 h-full w-1 ${item.accent}`} />
      <div className="p-6">
        <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="mb-1 flex items-center gap-3">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${requestBadgeClass(item.direction, item.status)}`}>
                {item.requestBadge}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">{item.submittedLabel}</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{item.title}</h3>
          </div>
          <span className={statusBadgeClass(item.statusTone)}>{item.statusBadge}</span>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Original Schedule</p>
            <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="material-symbols-outlined text-slate-400">calendar_today</span>
              <span>{item.originalPeriod}</span>
            </div>
            <p className="ml-8 mt-1 text-sm text-slate-500 dark:text-slate-400">
              Currently with: <span className="font-medium text-slate-700 dark:text-slate-300">{item.originalHolder}</span>
            </p>
          </div>

          <div className="rounded-lg border border-primary/10 bg-primary/5 p-4 dark:bg-primary/10">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">Proposed Change</p>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
              <span className="material-symbols-outlined text-primary">edit_calendar</span>
              <span>{item.proposedPeriod}</span>
            </div>
            <p className="ml-8 mt-1 text-sm text-slate-600 dark:text-slate-300">Reason: {item.proposedReason}</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row">
          <input
            type="text"
            className="block w-full rounded-lg border-0 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary dark:bg-slate-800 dark:text-white dark:ring-slate-700 sm:w-64"
            placeholder="Add a note (optional)"
            aria-label="Response note"
          />

          <form action={submitRequestDecision}>
            <input type="hidden" name="requestId" value={item.id} />
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="action" value="decline" />
            <button
              type="submit"
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-700"
            >
              Decline
            </button>
          </form>

          <form action={submitRequestDecision}>
            <input type="hidden" name="requestId" value={item.id} />
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="action" value="accept" />
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
            >
              Accept Request
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}

function OutgoingPendingCard({ item, tab }: Readonly<{ item: ChangeRequestItem; tab: RequestTab }>) {
  return (
    <article className="relative overflow-hidden rounded-xl border border-slate-200 bg-surface-light shadow-sm dark:border-slate-800 dark:bg-surface-dark">
      <div className={`absolute left-0 top-0 h-full w-1 ${item.accent}`} />
      <div className="p-6">
        <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="mb-1 flex items-center gap-3">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${requestBadgeClass(item.direction, item.status)}`}>
                {item.requestBadge}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">{item.submittedLabel}</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{item.title}</h3>
          </div>
          <span className={statusBadgeClass(item.statusTone)}>{item.statusBadge}</span>
        </div>

        <div className="mb-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/30">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined mt-0.5 text-slate-400">schedule</span>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">{item.detailDate}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{item.detailText}</p>
              <p className="mt-1 text-sm italic text-slate-500">{item.detailQuote}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <form action={submitRequestDecision}>
            <input type="hidden" name="requestId" value={item.id} />
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="action" value="cancel" />
            <button type="submit" className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              Cancel Request
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}

function HistoryCard({ item }: Readonly<{ item: ChangeRequestItem }>) {
  const completedCardClass = item.status === "completed" ? "opacity-75 hover:opacity-100 transition-opacity" : "";

  return (
    <article className={`relative overflow-hidden rounded-xl border border-slate-200 bg-surface-light shadow-sm dark:border-slate-800 dark:bg-surface-dark ${completedCardClass}`}>
      <div className={`absolute left-0 top-0 h-full w-1 ${item.accent}`} />
      <div className="p-6">
        <div className="mb-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="mb-1 flex items-center gap-3">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${requestBadgeClass(item.direction, item.status)}`}>
                {item.requestBadge}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">{item.submittedLabel}</span>
            </div>
            <h3 className={`text-lg font-semibold ${item.status === "completed" ? "text-slate-900 line-through decoration-slate-400 dark:text-white" : "text-slate-600 dark:text-slate-300"}`}>
              {item.title}
            </h3>
          </div>

          <span className={statusBadgeClass(item.statusTone)}>
            {item.status === "completed" ? (
              <>
                <span className="material-symbols-outlined text-sm">event_available</span>
                <span>{item.statusBadge}</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">block</span>
                <span>{item.statusBadge}</span>
              </>
            )}
          </span>
        </div>

        {item.status === "completed" && (
          <p className="border-l-2 border-slate-200 pl-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
            {item.completionNote}
          </p>
        )}

        {item.status === "declined" && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined mt-0.5 text-sm text-slate-400">info</span>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Reason for Decline:</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{item.declineReason}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export default async function ManageChangeRequestsPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<ManageChangeRequestsSearchParams> }>) {
  const resolvedSearchParams = await searchParams;
  const activeTab = resolveTab(resolvedSearchParams?.tab);
  const flashMessage = resolveFlashMessage(resolvedSearchParams?.flash);

  const pendingCount = REQUESTS.filter((item) => visibleInTab(item, "pending")).length;
  const items = REQUESTS.filter((item) => visibleInTab(item, activeTab));

  return (
    <div className="flex h-screen overflow-hidden bg-background-light font-display text-text-main antialiased dark:bg-background-dark">
      <aside className="z-20 hidden w-64 flex-col border-r border-slate-200 bg-surface-light dark:border-slate-800 dark:bg-surface-dark lg:flex">
        <div className="flex items-center gap-3 p-6">
          <div className="rounded-lg bg-primary/20 p-2">
            <span className="material-symbols-outlined text-2xl text-primary">family_restroom</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">KidSchedule</span>
        </div>

        <nav className="flex-1 space-y-1 px-4">
          <a
            className="flex items-center gap-3 rounded-lg px-4 py-3 text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
            href="/calendar"
          >
            <span className="material-symbols-outlined">calendar_month</span>
            <span>Calendar</span>
          </a>

          <a
            className="flex items-center gap-3 rounded-lg bg-primary/10 px-4 py-3 font-medium text-primary transition-colors"
            href="/calendar/change-requests"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              swap_horiz
            </span>
            <span>Change Requests</span>
            <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">{pendingCount}</span>
          </a>

          <a
            className="flex items-center gap-3 rounded-lg px-4 py-3 text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
            href="/messages"
          >
            <span className="material-symbols-outlined">chat</span>
            <span>Messages</span>
          </a>

          <a
            className="flex items-center gap-3 rounded-lg px-4 py-3 text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
            href="/expenses"
          >
            <span className="material-symbols-outlined">receipt_long</span>
            <span>Expenses</span>
          </a>
        </nav>

        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <a href="/settings" className="flex items-center gap-3 p-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-slate-500 dark:bg-slate-700">
              <span className="material-symbols-outlined">person</span>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-white">Alex M.</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Settings</p>
            </div>
          </a>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-surface-light px-6 dark:border-slate-800 dark:bg-surface-dark lg:px-8">
          <div className="flex items-center gap-4 lg:hidden">
            <button className="text-slate-500 transition-colors hover:text-slate-700" aria-label="Open menu">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="text-lg font-bold text-slate-800 dark:text-white">Change Requests</span>
          </div>

          <h1 className="hidden text-2xl font-bold text-slate-800 dark:text-white lg:block">Schedule Changes</h1>

          <a
            href="/calendar/change-request"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            <span>New Request</span>
          </a>
        </header>

        <div className="flex-1 overflow-y-auto bg-background-light p-4 dark:bg-background-dark lg:p-8">
          <div className="mx-auto max-w-5xl space-y-6">
            {flashMessage && (
              <p className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
                {flashMessage}
              </p>
            )}

            <div className="border-b border-slate-200 dark:border-slate-700">
              <nav aria-label="Tabs" className="-mb-px flex space-x-8">
                <a
                  href="/calendar/change-requests?tab=pending"
                  className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium flex items-center gap-2 ${
                    activeTab === "pending"
                      ? "border-primary text-primary"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  }`}
                >
                  <span>Pending Requests</span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">{pendingCount}</span>
                </a>

                <a
                  href="/calendar/change-requests?tab=history"
                  className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
                    activeTab === "history"
                      ? "border-primary text-primary"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  }`}
                >
                  History
                </a>
              </nav>
            </div>

            <div className="space-y-4">
              {items.map((item) => {
                if (item.status === "pending_review") {
                  return <IncomingPendingCard key={item.id} item={item} tab={activeTab} />;
                }

                if (item.status === "awaiting_response") {
                  return <OutgoingPendingCard key={item.id} item={item} tab={activeTab} />;
                }

                return <HistoryCard key={item.id} item={item} />;
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
