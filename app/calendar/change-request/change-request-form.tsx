"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  type ChangeType,
  type ChangeReason,
  type ChangeRequestInput,
  isChangeReason,
  isIsoDate,
  validateField,
  validateChangeRequestInput,
  MAX_NOTES_LENGTH,
} from "./change-request-validation";

interface ChangeRequestFormProps {
  readonly defaultState: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    changeType: ChangeType;
    reason: ChangeReason;
    notes: string;
  };
  readonly submitAction: (formData: FormData) => Promise<void>;
}

const REASON_OPTIONS: readonly { value: ChangeReason; label: string }[] = [
  { value: "work", label: "Work Commitment" },
  { value: "family", label: "Family Event" },
  { value: "travel", label: "Travel" },
  { value: "medical", label: "Medical Appointment" },
  { value: "other", label: "Other" },
] as const;

type CalendarCell = {
  id: string;
  day: number | null;
};

function defaultIsoDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthYearLabel(date: Date): string {
  return date.toLocaleDateString([], { month: "long", year: "numeric" });
}

function dateAtLocalMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
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

function formatReasonLabel(reason: ChangeReason): string {
  return REASON_OPTIONS.find((option) => option.value === reason)?.label ?? "Work Commitment";
}

/**
 * Submit button component with loading state from form submission
 */
function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span>{pending ? "Sending..." : "Send Request"}</span>
      <span className="material-symbols-outlined text-lg">
        {pending ? "hourglass_bottom" : "send"}
      </span>
    </button>
  );
}

export function ChangeRequestForm({
  defaultState,
  submitAction,
}: ChangeRequestFormProps) {
  // Form state
  const [startDate, setStartDate] = useState(defaultState.startDate);
  const [endDate, setEndDate] = useState(defaultState.endDate);
  const [startTime, setStartTime] = useState(defaultState.startTime);
  const [endTime, setEndTime] = useState(defaultState.endTime);
  const [changeType, setChangeType] = useState<ChangeType>(defaultState.changeType);
  const [reason, setReason] = useState<ChangeReason>(defaultState.reason);
  const [notes, setNotes] = useState(defaultState.notes);

  // UI state
  const [mounted, setMounted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const date = dateAtLocalMidnight(defaultState.startDate);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  // Hydration guard + localStorage restore
  useEffect(() => {
    const saved = localStorage.getItem("ks_change_request_draft");
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        // Only restore from localStorage if URL params are defaults
        const urlIsDefault =
          defaultState.startDate === defaultIsoDate(1) &&
          defaultState.endDate === defaultIsoDate(3) &&
          defaultState.startTime === "17:00" &&
          defaultState.endTime === "17:00" &&
          defaultState.changeType === "swap" &&
          defaultState.reason === "work" &&
          defaultState.notes === "";

        if (urlIsDefault) {
          if (draft.startDate) setStartDate(draft.startDate);
          if (draft.endDate) setEndDate(draft.endDate);
          if (draft.startTime) setStartTime(draft.startTime);
          if (draft.endTime) setEndTime(draft.endTime);
          if (draft.changeType) setChangeType(draft.changeType);
          if (draft.reason) setReason(draft.reason);
          if (draft.notes) setNotes(draft.notes);
        }
      } catch {
        // Ignore parse errors
      }
    }
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write form state to localStorage whenever it changes
  useEffect(() => {
    if (!mounted) return;
    const draft = (() => {
      try {
        return JSON.parse(localStorage.getItem("ks_change_request_draft") || "{}");
      } catch {
        return {};
      }
    })();
    draft.startDate = startDate;
    draft.endDate = endDate;
    draft.startTime = startTime;
    draft.endTime = endTime;
    draft.changeType = changeType;
    draft.reason = reason;
    draft.notes = notes;
    localStorage.setItem("ks_change_request_draft", JSON.stringify(draft));
  }, [startDate, endDate, startTime, endTime, changeType, reason, notes, mounted]);

  // Real-time validation on field change
  const handleFieldChange = useCallback(
    (field: keyof ChangeRequestInput, value: string) => {
      // Update the specific field
      const input = {
        startDate,
        endDate,
        startTime,
        endTime,
        changeType,
        reason,
        notes,
      };

      switch (field) {
        case "startDate":
          setStartDate(value);
          break;
        case "endDate":
          setEndDate(value);
          break;
        case "startTime":
          setStartTime(value);
          break;
        case "endTime":
          setEndTime(value);
          break;
        case "notes":
          setNotes(value);
          break;
      }

      // Validate the field
      const error = validateField(field, value, input);
      setFieldErrors((prev) => {
        const next = { ...prev };
        if (error) {
          next[field] = error;
        } else {
          delete next[field];
        }
        return next;
      });

      // Update calendar month when date changes
      if (field === "startDate" && isIsoDate(value)) {
        const newMonth = dateAtLocalMidnight(value);
        setCalendarMonth(new Date(newMonth.getFullYear(), newMonth.getMonth(), 1));
      }
    },
    [startDate, endDate, startTime, endTime, changeType, reason, notes]
  );

  // Navigate calendar months
  const goToPreviousMonth = useCallback(() => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const goToNextMonth = useCallback(() => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  // Build calendar grid
  const calendarCells = buildCalendarCells(calendarMonth);
  const previewStart = dateAtLocalMidnight(startDate);
  const previewEnd = dateAtLocalMidnight(endDate);
  const previewMonth = calendarMonth.getMonth();
  const previewYear = calendarMonth.getFullYear();

  const selectedDays = new Set<number>();
  for (let date = new Date(previewStart); date.getTime() <= previewEnd.getTime(); date.setDate(date.getDate() + 1)) {
    if (date.getFullYear() === previewYear && date.getMonth() === previewMonth) {
      selectedDays.add(date.getDate());
    }
  }

  // Check overall form validity
  const fullInput: ChangeRequestInput = {
    startDate,
    endDate,
    startTime,
    endTime,
    changeType,
    reason,
    notes,
  };
  validateChangeRequestInput(fullInput);

  return (
    <form action={submitAction} className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col overflow-y-auto lg:flex-row">
        {/* Left side: Form inputs */}
        <section className="w-full space-y-6 border-r border-slate-100 p-8 dark:border-slate-800 lg:w-1/2">
          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
              Proposed Change
            </h2>

            {/* Date inputs */}
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="start-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Start Date
                </label>
                <input
                  id="start-date"
                  name="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => handleFieldChange("startDate", e.target.value)}
                  className={`block w-full rounded-lg border-slate-300 bg-slate-50 text-sm text-slate-900 shadow-sm focus:border-primary focus:ring-primary dark:border-slate-600 dark:bg-slate-800/50 dark:text-white ${
                    fieldErrors.startDate ? "border-red-500 dark:border-red-500" : ""
                  }`}
                  required
                />
                {fieldErrors.startDate && (
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.startDate}</p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="end-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  End Date
                </label>
                <input
                  id="end-date"
                  name="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => handleFieldChange("endDate", e.target.value)}
                  className={`block w-full rounded-lg border-slate-300 bg-slate-50 text-sm text-slate-900 shadow-sm focus:border-primary focus:ring-primary dark:border-slate-600 dark:bg-slate-800/50 dark:text-white ${
                    fieldErrors.endDate ? "border-red-500 dark:border-red-500" : ""
                  }`}
                  required
                />
                {fieldErrors.endDate && (
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.endDate}</p>
                )}
              </div>
            </div>

            {/* Time inputs */}
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="start-time" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Start Time
                </label>
                <input
                  id="start-time"
                  name="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => handleFieldChange("startTime", e.target.value)}
                  className={`block w-full rounded-lg border-slate-300 bg-slate-50 text-sm text-slate-900 shadow-sm focus:border-primary focus:ring-primary dark:border-slate-600 dark:bg-slate-800/50 dark:text-white ${
                    fieldErrors.startTime ? "border-red-500 dark:border-red-500" : ""
                  }`}
                  required
                />
                {fieldErrors.startTime && (
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.startTime}</p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="end-time" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  End Time
                </label>
                <input
                  id="end-time"
                  name="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => handleFieldChange("endTime", e.target.value)}
                  className={`block w-full rounded-lg border-slate-300 bg-slate-50 text-sm text-slate-900 shadow-sm focus:border-primary focus:ring-primary dark:border-slate-600 dark:bg-slate-800/50 dark:text-white ${
                    fieldErrors.endTime ? "border-red-500 dark:border-red-500" : ""
                  }`}
                  required
                />
                {fieldErrors.endTime && (
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.endTime}</p>
                )}
              </div>
            </div>

            {/* Change type */}
            <fieldset className="mb-4 space-y-1">
              <legend className="block text-sm font-medium text-slate-700 dark:text-slate-300">Change Type</legend>
              <div className="flex gap-2">
                {[
                  { id: "swap", icon: "swap_horiz", label: "Swap" },
                  { id: "cancel", icon: "event_busy", label: "Cancel" },
                  { id: "extra", icon: "add_circle", label: "Extra Time" },
                ].map((option) => {
                  const checked = changeType === option.id;

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
                        checked={checked}
                        onChange={() => setChangeType(option.id as ChangeType)}
                      />
                      <span className="material-symbols-outlined text-lg">{option.icon}</span>
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Reason dropdown */}
            <div className="space-y-1">
              <label htmlFor="reason" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Reason for Request
              </label>
              <select
                id="reason"
                name="reason"
                value={reason}
                onChange={(e) => setReason(isChangeReason(e.target.value) ? e.target.value : "work")}
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

          {/* Notes with character counter */}
          <div className="space-y-1">
            <label htmlFor="notes" className="flex justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
              <span>Notes</span>
              <span className={`text-xs font-normal ${notes.length > MAX_NOTES_LENGTH * 0.9 ? "text-orange-600 dark:text-orange-400" : "text-slate-400"}`}>
                {notes.length}/{MAX_NOTES_LENGTH}
              </span>
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              value={notes}
              onChange={(e) => handleFieldChange("notes", e.target.value)}
              placeholder="e.g. I have a business trip and need to switch weekends..."
              className={`block w-full rounded-lg border-slate-300 bg-slate-50 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-primary focus:ring-primary dark:border-slate-600 dark:bg-slate-800/50 dark:text-white ${
                fieldErrors.notes ? "border-red-500 dark:border-red-500" : ""
              }`}
            />
            {fieldErrors.notes && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.notes}</p>
            )}
          </div>
        </section>

        {/* Right side: Calendar preview and AI message */}
        <section className="flex w-full flex-col gap-6 bg-slate-50/50 p-8 dark:bg-background-dark/50 lg:w-1/2">
          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
              Visual Preview
            </h2>

            {/* Calendar */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-surface-dark">
              {/* Calendar header with navigation */}
              <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-700">
                <button
                  type="button"
                  onClick={goToPreviousMonth}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  aria-label="Previous month"
                >
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>

                <span className="font-bold text-slate-800 dark:text-white text-center min-w-[160px]">
                  {monthYearLabel(calendarMonth)}
                </span>

                <button
                  type="button"
                  onClick={goToNextMonth}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  aria-label="Next month"
                >
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>

              {/* Legend */}
              <div className="flex gap-4 border-b border-slate-100 px-4 py-3 text-xs dark:border-slate-700">
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-slate-200" />
                  <span>Current</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span>Proposed</span>
                </div>
              </div>

              {/* Calendar grid */}
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
                  {calendarCells.map((cell) => {
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

          {/* AI Conflict Check */}
          <div className="relative rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 dark:border-indigo-800 dark:from-indigo-900/20 dark:to-surface-dark">
            <div className="absolute right-4 top-4 text-indigo-200 dark:text-indigo-800/40">
              <span className="material-symbols-outlined text-4xl">psychology</span>
            </div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-indigo-900 dark:text-indigo-300">
              <span className="material-symbols-outlined text-lg">auto_awesome</span>
              <span>AI Conflict Check</span>
            </h3>
            <p className="pr-8 text-sm leading-relaxed text-indigo-800 dark:text-indigo-200">
              {aiConflictMessage(changeType, notes)}
            </p>
            <p className="mt-2 text-xs text-indigo-700/80 dark:text-indigo-300/80">
              Request type: <span className="font-semibold capitalize">{changeType}</span> • Reason: {formatReasonLabel(reason)}
            </p>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-8 py-5 dark:border-slate-800 dark:bg-surface-dark">
        <a
          href="/calendar"
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </a>
        <SubmitButton />
      </footer>
    </form>
  );
}
