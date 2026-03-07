"use client";

import { useEffect, useState } from "react";
import { type PatternConfigInput, type RotationStarter } from "@/lib/schedule-wizard-engine";

interface PatternConfigFormProps {
  readonly config: PatternConfigInput;
  readonly pickupOptions: readonly string[];
  readonly dropoffOptions: readonly string[];
  readonly templateId: string;
  readonly mode: string;
}

function getTodayIsoDate(): string {
  const today = new Date();
  return today.toISOString().slice(0, 10);
}

export function PatternConfigForm({
  config,
  pickupOptions,
  dropoffOptions,
  templateId,
  mode,
}: PatternConfigFormProps) {
  const [date, setDate] = useState(config.scheduleStartDate);
  const [startsWith, setStartsWith] = useState(config.rotationStarter);
  const [pickup, setPickup] = useState(config.pickupTime);
  const [dropoff, setDropoff] = useState(config.dropoffTime);
  const [mounted, setMounted] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [dateError, setDateError] = useState<string | undefined>();

  // Validate date helper
  const validateDate = (dateValue: string): boolean => {
    const today = getTodayIsoDate();
    if (dateValue < today) {
      setDateError("Start date must be today or in the future.");
      return false;
    }
    setDateError(undefined);
    return true;
  };

  // Hydration guard + localStorage restore
  // Only runs once on mount; safe to call setState directly
  useEffect(() => {
    const saved = localStorage.getItem("ks_wizard_draft");
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        // Restore from localStorage - user may have a draft from a previous session
        // The URL params will have some values; we restore from draft where available
        if (draft.startDate && draft.startDate !== config.scheduleStartDate) {
          setDate(draft.startDate);
        }
        if (draft.startsWith && draft.startsWith !== config.rotationStarter) {
          setStartsWith(draft.startsWith);
        }
        if (draft.pickup && draft.pickup !== config.pickupTime) {
          setPickup(draft.pickup);
        }
        if (draft.dropoff && draft.dropoff !== config.dropoffTime) {
          setDropoff(draft.dropoff);
        }
      } catch {
        // Ignore parse errors
      }
    }
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write to localStorage whenever config changes
  useEffect(() => {
    if (!mounted) return;
    const draft = (() => {
      try {
        return JSON.parse(localStorage.getItem("ks_wizard_draft") || "{}");
      } catch {
        return {};
      }
    })();
    draft.startDate = date;
    draft.startsWith = startsWith;
    draft.pickup = pickup;
    draft.dropoff = dropoff;
    localStorage.setItem("ks_wizard_draft", JSON.stringify(draft));
  }, [date, startsWith, pickup, dropoff, mounted]);

  // Date validation: update error state based on current date value
  useEffect(() => {
    const today = getTodayIsoDate();
    if (date < today) {
      setDateError("Start date must be today or in the future.");
    } else {
      setDateError(undefined);
    }
  }, [date]);

  const isDateValid = !dateError;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateDate(date)) {
      return;
    }
    // Build query string and navigate
    const query = new URLSearchParams({
      template: templateId,
      startDate: date,
      startsWith,
      pickup,
      dropoff,
      mode,
    });
    window.location.href = `/calendar/wizard/pattern?${query.toString()}`;
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="w-full lg:w-1/3 xl:w-1/4 bg-surface dark:bg-surface border-r border-slate-200 dark:border-slate-800 flex flex-col h-full overflow-y-auto z-10 shadow-lg lg:shadow-none"
      >

        {/* Mobile toggle button */}
        <div className="lg:hidden sticky top-0 bg-surface dark:bg-surface border-b border-slate-200 dark:border-slate-800 p-4 z-20">
          <button
            type="button"
            onClick={() => setConfigOpen(!configOpen)}
            className="w-full flex items-center justify-between px-4 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">settings</span>
              Configure Schedule
            </span>
            <span
              className={`material-symbols-outlined transition-transform ${configOpen ? "rotate-180" : ""}`}
            >
              expand_more
            </span>
          </button>
        </div>

        {/* Config form — visible on lg+, togglable on mobile */}
        <div className={`${configOpen ? "block" : "hidden"} lg:block p-6 space-y-8 pb-24`}>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Configuration</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Customize your {templateId} schedule details.
            </p>
          </div>

          <div className="space-y-3">
            <label
              htmlFor="startDate"
              className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              Schedule Start Date
            </label>
            <input
              id="startDate"
              className={`w-full rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-primary shadow-sm transition-colors ${
                dateError
                  ? "border-red-500 dark:border-red-500 focus:ring-red-500/50"
                  : "border-slate-300 dark:border-slate-600 focus:ring-primary/50"
              }`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {dateError && (
              <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                <span aria-hidden="true" className="material-symbols-outlined text-base flex-shrink-0 mt-0.5">
                  error
                </span>
                <span>{dateError}</span>
              </div>
            )}
            <p className="text-xs text-slate-500">The first day this schedule applies.</p>
          </div>

          <div className="h-px bg-slate-200 dark:bg-slate-700"></div>

          <div className="space-y-4">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Rotation Start
            </label>
            <div className="bg-surface-sunken dark:bg-background-dark p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <span className="text-sm font-medium">Who starts the rotation?</span>
              <div className="grid grid-cols-2 gap-3">
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="startsWith"
                    value="A"
                    checked={startsWith === "A"}
                    onChange={(e) => setStartsWith(e.target.value as RotationStarter)}
                    className="peer sr-only"
                  />
                  <span className="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-500 peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary peer-checked:font-semibold transition-all">
                    <span className="w-3 h-3 rounded-full bg-primary"></span>
                    Parent A
                  </span>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="startsWith"
                    value="B"
                    checked={startsWith === "B"}
                    onChange={(e) => setStartsWith(e.target.value as RotationStarter)}
                    className="peer sr-only"
                  />
                  <span className="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-500 peer-checked:border-parent-b peer-checked:bg-parent-b/10 peer-checked:text-parent-b peer-checked:font-semibold transition-all">
                    <span className="w-3 h-3 rounded-full bg-parent-b"></span>
                    Parent B
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Transition Times
            </label>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label htmlFor="pickup" className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1.5 block">
                  Pick-up Time
                </label>
                <select
                  id="pickup"
                  name="pickup"
                  className="w-full rounded-lg border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-primary shadow-sm"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                >
                  {pickupOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="dropoff"
                  className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1.5 block"
                >
                  Drop-off Time
                </label>
                <select
                  id="dropoff"
                  name="dropoff"
                  className="w-full rounded-lg border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-primary shadow-sm"
                  value={dropoff}
                  onChange={(e) => setDropoff(e.target.value)}
                >
                  {dropoffOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                info
              </span>
              <span>Standard exchanges occur at school/care.</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={!isDateValid}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed"
          >
            <span>Update Preview</span>
            <span aria-hidden="true" className="material-symbols-outlined text-base">
              refresh
            </span>
          </button>
        </div>
      </form>
    </>
  );
}
