"use client";

import type { CalendarDayState } from "@/lib/calendar-engine";
import type { ScheduleOverride } from "@/types";

function getOverrideColorClasses(override: ScheduleOverride): string {
  switch (override.type) {
    case "holiday":
      return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800";
    case "swap":
      return "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800";
    case "mediation":
      return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800";
    default:
      return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800";
  }
}

export function CalendarDayCell({
  day,
  isToday,
  isPrevMonth,
}: Readonly<{
  day: CalendarDayState;
  isToday: boolean;
  isPrevMonth: boolean;
}>) {
  if (isPrevMonth) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 opacity-40 min-h-[120px] border border-transparent">
        <span className="text-slate-400 font-medium">{day.dayOfMonth}</span>
      </div>
    );
  }

  const hasPending = day.hasPendingRequest;

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-xl p-3 min-h-[120px] relative group transition-shadow ${
        isToday
          ? "border-2 border-primary ring-4 ring-primary/10 shadow-md hover:shadow-lg"
          : hasPending
          ? "shadow-sm border border-slate-100 dark:border-slate-800 ring-2 ring-amber-300 dark:ring-amber-700/50 hover:shadow-md"
          : "shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md"
      }`}
    >
      {/* Custody background */}
      {day.custodyColor === "split" ? (
        <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none flex">
          <div className="w-1/2 h-full bg-secondary/10" />
          <div className="w-1/2 h-full bg-primary/10" />
        </div>
      ) : (
        <div
          className={`absolute inset-0 rounded-xl pointer-events-none ${
            day.custodyColor === "primary" ? "bg-primary/10" : "bg-secondary/10"
          }`}
        />
      )}

      {/* Day number + event icons */}
      <div className="flex justify-between items-start mb-2 relative z-10">
        {isToday ? (
          <span className="flex items-center justify-center w-7 h-7 bg-primary text-white rounded-full font-bold text-sm shadow-sm">
            {day.dayOfMonth}
          </span>
        ) : (
          <span className="text-slate-700 dark:text-slate-300 font-bold">
            {day.dayOfMonth}
          </span>
        )}

        <div className="flex gap-1">
          {day.events.slice(0, 2).map((evt) => (
            <span
              key={evt.id}
              aria-hidden="true"
              className={`material-symbols-outlined text-[16px] ${evt.iconColor ?? "text-slate-500"}`}
              title={evt.title}
            >
              {evt.icon ?? "event"}
            </span>
          ))}
          {hasPending && (
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[16px] text-amber-500"
              title="Pending request"
            >
              pending
            </span>
          )}
        </div>
      </div>

      {/* Event pills */}
      <div className="relative z-10 flex flex-col gap-1">
        {day.events.map((evt) => {
          if (evt.type === "transition") {
            return (
              <div
                key={evt.id}
                className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold px-1.5 py-1 rounded w-max shadow-sm"
              >
                {evt.title}
              </div>
            );
          }
          if (evt.type === "note") {
            return (
              <div key={evt.id} className="mt-1 space-y-1">
                <div className="w-full h-1 bg-blue-200 dark:bg-blue-800 rounded-full" />
                <div className="w-2/3 h-1 bg-blue-200 dark:bg-blue-800 rounded-full" />
              </div>
            );
          }
          return (
            <div
              key={evt.id}
              className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 font-medium bg-white/60 dark:bg-slate-800/60 rounded px-1 truncate"
              title={evt.title}
            >
              {evt.title}
            </div>
          );
        })}

        {day.affectingOverrides && day.affectingOverrides.length > 0 && (
          <div className="flex flex-col gap-1">
            {day.affectingOverrides.map((override) => (
              <div
                key={override.id}
                className={`text-[10px] font-bold px-1.5 py-1 rounded w-max shadow-sm truncate ${getOverrideColorClasses(override)}`}
                title={override.description || override.title}
              >
                {override.title}
              </div>
            ))}
          </div>
        )}

        {hasPending && day.pendingRequest && (
          <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-900/20 p-1 rounded">
            Swap Request
          </div>
        )}
      </div>
    </div>
  );
}
