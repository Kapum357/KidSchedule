import { redirect } from "next/navigation";

type ChangeType = "swap" | "cancel" | "extra";

type ChangeReason =
  | "work"
  | "family"
  | "travel"
  | "medical"
  | "other";

type ChangeRequestSearchParams = {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  changeType?: string;
  reason?: string;
  notes?: string;
  success?: string;
  error?: string;
};

type ChangeRequestPageState = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  changeType: ChangeType;
  reason: ChangeReason;
  notes: string;
  successMessage?: string;
  errorMessage?: string;
};

type ChangeRequestInput = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  changeType: ChangeType;
  reason: ChangeReason;
  notes: string;
};

type CalendarCell = {
  id: string;
  day: number | null;
};

const REASON_OPTIONS: readonly { value: ChangeReason; label: string }[] = [
  { value: "work", label: "Work Commitment" },
  { value: "family", label: "Family Event" },
  { value: "travel", label: "Travel" },
  { value: "medical", label: "Medical Appointment" },
  { value: "other", label: "Other" },
] as const;

function isIsoDate(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeValue(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  return /^\d{2}:\d{2}$/.test(value);
}

function isChangeType(value: string | undefined): value is ChangeType {
  return value === "swap" || value === "cancel" || value === "extra";
}

function isChangeReason(value: string | undefined): value is ChangeReason {
  return value === "work" || value === "family" || value === "travel" || value === "medical" || value === "other";
}

function defaultIsoDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolvePageState(searchParams: ChangeRequestSearchParams | undefined): ChangeRequestPageState {
  const fallbackStart = defaultIsoDate(1);
  const fallbackEnd = defaultIsoDate(3);

  return {
    startDate: isIsoDate(searchParams?.startDate) ? searchParams.startDate : fallbackStart,
    endDate: isIsoDate(searchParams?.endDate) ? searchParams.endDate : fallbackEnd,
    startTime: isTimeValue(searchParams?.startTime) ? searchParams.startTime : "17:00",
    endTime: isTimeValue(searchParams?.endTime) ? searchParams.endTime : "17:00",
    changeType: isChangeType(searchParams?.changeType) ? searchParams.changeType : "swap",
    reason: isChangeReason(searchParams?.reason) ? searchParams.reason : "work",
    notes: (searchParams?.notes ?? "").trim(),
    successMessage:
      searchParams?.success === "1"
        ? "Request sent successfully (demo mode). This would notify your co-parent immediately."
        : undefined,
    errorMessage: searchParams?.error,
  };
}

function buildQueryStringFromInput(input: {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  changeType: ChangeType;
  reason: ChangeReason;
  notes: string;
}): string {
  const params = new URLSearchParams({
    startDate: input.startDate,
    endDate: input.endDate,
    startTime: input.startTime,
    endTime: input.endTime,
    changeType: input.changeType,
    reason: input.reason,
  });

  if (input.notes.length > 0) {
    params.set("notes", input.notes);
  }

  return params.toString();
}

function dateAtLocalMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

function isValidDateRange(startDate: string, endDate: string): boolean {
  const start = dateAtLocalMidnight(startDate).getTime();
  const end = dateAtLocalMidnight(endDate).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start <= end;
}

function parseChangeRequestFormData(formData: FormData): ChangeRequestInput {
  const startDate = ((formData.get("startDate") as string | null) ?? "").trim();
  const endDate = ((formData.get("endDate") as string | null) ?? "").trim();
  const startTime = ((formData.get("startTime") as string | null) ?? "").trim();
  const endTime = ((formData.get("endTime") as string | null) ?? "").trim();
  const changeTypeRaw = ((formData.get("changeType") as string | null) ?? "").trim();
  const reasonRaw = ((formData.get("reason") as string | null) ?? "").trim();
  const notes = ((formData.get("notes") as string | null) ?? "").trim();

  return {
    startDate,
    endDate,
    startTime,
    endTime,
    changeType: isChangeType(changeTypeRaw) ? changeTypeRaw : "swap",
    reason: isChangeReason(reasonRaw) ? reasonRaw : "work",
    notes,
  };
}

function validateChangeRequestInput(input: ChangeRequestInput): string | undefined {
  const hasValidDateTimes =
    isIsoDate(input.startDate) &&
    isIsoDate(input.endDate) &&
    isTimeValue(input.startTime) &&
    isTimeValue(input.endTime);

  if (!hasValidDateTimes) {
    return "Please enter valid dates and times.";
  }

  if (!isValidDateRange(input.startDate, input.endDate)) {
    return "End date must be the same day or after the start date.";
  }

  if (input.notes.length > 500) {
    return "Please keep notes under 500 characters.";
  }

  return undefined;
}

async function submitChangeRequest(formData: FormData): Promise<void> {
  "use server";

  const input = parseChangeRequestFormData(formData);
  const baseParams = buildQueryStringFromInput(input);
  const validationError = validateChangeRequestInput(input);

  if (validationError) {
    const params = new URLSearchParams(baseParams);
    params.set("error", validationError);
    redirect(`/calendar/change-request?${params.toString()}`);
  }

  const success = new URLSearchParams(baseParams);
  success.set("success", "1");

  // Future persistence wiring point:
  // - save ScheduleChangeRequest to lib/persistence boundary
  // - notify co-parent through provider adapters
  // - emit activity item: schedule_change_requested
  redirect(`/calendar/change-request?${success.toString()}`);
}

function monthYearLabel(date: Date): string {
  return date.toLocaleDateString([], { month: "long", year: "numeric" });
}

function isPositiveTone(notes: string): boolean {
  const normalized = notes.toLowerCase();
  return normalized.includes("please") || normalized.includes("thank") || normalized.includes("appreciate");
}

function aiConflictMessage(changeType: ChangeType, notes: string): string {
  const toneLine = isPositiveTone(notes)
    ? "Your tone reads collaborative and constructive."
    : "Your draft reads neutral and constructive.";

  if (changeType === "swap") {
    return `Great choice. Our data shows that proposing a swap instead of a direct cancellation can lead to 40% higher acceptance rates. ${toneLine}`;
  }

  if (changeType === "cancel") {
    return `Cancellation requests are less likely to be accepted on first pass. Consider offering make-up time to improve alignment. ${toneLine}`;
  }

  return `Extra-time requests are most successful when tied to a specific reason and clear boundaries. ${toneLine}`;
}

function buildCalendarCells(monthAnchor: Date): CalendarCell[] {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: CalendarCell[] = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ id: `blank-${i + 1}`, day: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ id: `day-${day}`, day });
  }

  while (cells.length % 7 !== 0 || cells.length < 35) {
    cells.push({ id: `pad-${cells.length + 1}`, day: null });
  }

  return cells;
}

function formatReasonLabel(reason: ChangeReason): string {
  return REASON_OPTIONS.find((option) => option.value === reason)?.label ?? "Work Commitment";
}

export default async function NewScheduleChangeRequestPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<ChangeRequestSearchParams> }>) {
  const resolvedSearchParams = await searchParams;
  const state = resolvePageState(resolvedSearchParams);

  const previewStart = dateAtLocalMidnight(state.startDate);
  const previewEnd = dateAtLocalMidnight(state.endDate);
  const anchor = new Date(previewStart.getFullYear(), previewStart.getMonth(), 1);
  const cells = buildCalendarCells(anchor);
  const previewMonth = anchor.getMonth();
  const previewYear = anchor.getFullYear();

  const selectedDays = new Set<number>();
  for (let date = new Date(previewStart); date.getTime() <= previewEnd.getTime(); date.setDate(date.getDate() + 1)) {
    if (date.getFullYear() === previewYear && date.getMonth() === previewMonth) {
      selectedDays.add(date.getDate());
    }
  }

  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-slate-500/50 p-4 font-display text-text-main antialiased"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-surface-light shadow-2xl dark:bg-surface-dark">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-8 py-5 dark:border-slate-800 dark:bg-surface-dark">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white">
              <span className="material-symbols-outlined text-primary">edit_calendar</span>
              <span>New Schedule Change Request</span>
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Submit a proposal for a custody exception.</p>
          </div>
          <a
            href="/calendar"
            className="text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </a>
        </header>

        <form action={submitChangeRequest} className="flex flex-1 flex-col overflow-y-auto">
          {(state.errorMessage || state.successMessage) && (
            <div className="border-b border-slate-100 px-8 py-3 dark:border-slate-800">
              {state.errorMessage && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                  {state.errorMessage}
                </p>
              )}
              {state.successMessage && (
                <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
                  {state.successMessage}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col overflow-y-auto lg:flex-row">
            <section className="w-full space-y-6 border-r border-slate-100 p-8 dark:border-slate-800 lg:w-1/2">
              <div>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-white">Proposed Change</h2>

                <div className="mb-4 grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="start-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Start Date
                    </label>
                    <input
                      id="start-date"
                      name="startDate"
                      type="date"
                      defaultValue={state.startDate}
                      className="block w-full rounded-lg border-slate-300 bg-slate-50 text-sm text-slate-900 shadow-sm focus:border-primary focus:ring-primary dark:border-slate-600 dark:bg-slate-800/50 dark:text-white"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="end-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      End Date
                    </label>
                    <input
                      id="end-date"
                      name="endDate"
                      type="date"
                      defaultValue={state.endDate}
                      className="block w-full rounded-lg border-slate-300 bg-slate-50 text-sm text-slate-900 shadow-sm focus:border-primary focus:ring-primary dark:border-slate-600 dark:bg-slate-800/50 dark:text-white"
                      required
                    />
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="start-time" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Start Time
                    </label>
                    <input
                      id="start-time"
                      name="startTime"
                      type="time"
                      defaultValue={state.startTime}
                      className="block w-full rounded-lg border-slate-300 bg-slate-50 text-sm text-slate-900 shadow-sm focus:border-primary focus:ring-primary dark:border-slate-600 dark:bg-slate-800/50 dark:text-white"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="end-time" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      End Time
                    </label>
                    <input
                      id="end-time"
                      name="endTime"
                      type="time"
                      defaultValue={state.endTime}
                      className="block w-full rounded-lg border-slate-300 bg-slate-50 text-sm text-slate-900 shadow-sm focus:border-primary focus:ring-primary dark:border-slate-600 dark:bg-slate-800/50 dark:text-white"
                      required
                    />
                  </div>
                </div>

                <fieldset className="mb-4 space-y-1">
                  <legend className="block text-sm font-medium text-slate-700 dark:text-slate-300">Change Type</legend>
                  <div className="flex gap-2">
                    {[{ id: "swap", icon: "swap_horiz", label: "Swap" }, { id: "cancel", icon: "event_busy", label: "Cancel" }, { id: "extra", icon: "add_circle", label: "Extra Time" }].map((option) => {
                      const checked = state.changeType === option.id;

                      return (
                        <label
                          key={option.id}
                          className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                            checked
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                          }`}
                        >
                          <input
                            className="sr-only"
                            type="radio"
                            name="changeType"
                            value={option.id}
                            defaultChecked={checked}
                          />
                          <span className="material-symbols-outlined text-lg">{option.icon}</span>
                          <span>{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="space-y-1">
                  <label htmlFor="reason" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Reason for Request
                  </label>
                  <select
                    id="reason"
                    name="reason"
                    defaultValue={state.reason}
                    className="block w-full rounded-lg border-slate-300 bg-slate-50 text-sm text-slate-900 shadow-sm focus:border-primary focus:ring-primary dark:border-slate-600 dark:bg-slate-800/50 dark:text-white"
                  >
                    {REASON_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="notes" className="flex justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span>Notes</span>
                  <span className="text-xs font-normal text-slate-400">Keep it neutral &amp; brief</span>
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={4}
                  defaultValue={state.notes}
                  placeholder="e.g. I have a business trip and need to switch weekends..."
                  className="block w-full rounded-lg border-slate-300 bg-slate-50 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-primary focus:ring-primary dark:border-slate-600 dark:bg-slate-800/50 dark:text-white"
                />
              </div>
            </section>

            <section className="flex w-full flex-col gap-6 bg-slate-50/50 p-8 dark:bg-background-dark/50 lg:w-1/2">
              <div>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-white">Visual Preview</h2>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-surface-dark">
                  <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-700">
                    <span className="font-bold text-slate-800 dark:text-white">{monthYearLabel(anchor)}</span>
                    <div className="flex gap-2 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-slate-200" />
                        <span>Current</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <span>Proposed</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
                      <span>S</span>
                      <span>M</span>
                      <span>T</span>
                      <span>W</span>
                      <span>T</span>
                      <span>F</span>
                      <span>S</span>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-sm">
                      {cells.map((cell) => {
                        if (cell.day === null) {
                          return <div key={cell.id} className="p-2" />;
                        }

                        const proposed = selectedDays.has(cell.day);
                        const previousDay = selectedDays.has(cell.day - 1);
                        const nextDay = selectedDays.has(cell.day + 1);
                        const roundedLeft = proposed && !previousDay;
                        const roundedRight = proposed && !nextDay;

                        const chipClasses = proposed
                          ? ["bg-primary", "text-white", "shadow-sm", "font-bold"]
                          : ["text-slate-800", "dark:text-slate-300"];

                        if (roundedLeft) {
                          chipClasses.push("rounded-l-md");
                        }

                        if (roundedRight) {
                          chipClasses.push("rounded-r-md");
                        }

                        return (
                          <div key={cell.id} className="relative p-1">
                            <div className={`flex h-full w-full items-center justify-center ${chipClasses.join(" ")}`}>
                              {cell.day}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/30">
                    <span className="material-symbols-outlined text-sm">info</span>
                    <span>Original schedule: You (Fri-Sun). Proposed: Co-parent (Fri-Sun).</span>
                  </div>
                </div>
              </div>

              <div className="relative rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 dark:border-indigo-800 dark:from-indigo-900/20 dark:to-surface-dark">
                <div className="absolute right-4 top-4 text-indigo-200 dark:text-indigo-800/40">
                  <span className="material-symbols-outlined text-4xl">psychology</span>
                </div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-indigo-900 dark:text-indigo-300">
                  <span className="material-symbols-outlined text-lg">auto_awesome</span>
                  <span>AI Conflict Check</span>
                </h3>
                <p className="pr-8 text-sm leading-relaxed text-indigo-800 dark:text-indigo-200">
                  {aiConflictMessage(state.changeType, state.notes)}
                </p>
                <p className="mt-2 text-xs text-indigo-700/80 dark:text-indigo-300/80">
                  Request type: <span className="font-semibold capitalize">{state.changeType}</span> • Reason: {formatReasonLabel(state.reason)}
                </p>
              </div>
            </section>
          </div>

          <footer className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-8 py-5 dark:border-slate-800 dark:bg-surface-dark">
            <a
              href="/calendar"
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </a>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <span>Send Request</span>
              <span className="material-symbols-outlined text-lg">send</span>
            </button>
          </footer>
        </form>
      </div>
    </main>
  );
}
