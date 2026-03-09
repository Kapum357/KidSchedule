'use client';

import type { CalendarWeekData } from '@/lib/calendar-week-engine';

interface CalendarWeekGridProps {
  readonly data: CalendarWeekData;
  readonly year: number;
  readonly month: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Simple week view grid rendering.
 * Displays 7 consecutive days in a row with 24-hour time slots.
 * Basic implementation - ready for enhancement.
 */
export function CalendarWeekGrid({ data }: CalendarWeekGridProps) {
  const weekDays = data.days;

  if (weekDays.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-500">
        No days available for this week.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden">
      {/* Week header with day names and dates */}
      <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800 shrink-0 border-b border-slate-300 dark:border-slate-700">
        {weekDays.map((day) => (
          <div
            key={day.dateStr}
            className="bg-white dark:bg-slate-900 p-4 text-center border-r border-slate-200 dark:border-slate-700 last:border-r-0"
          >
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
              {WEEKDAY_LABELS[new Date(`${day.dateStr}T00:00:00Z`).getUTCDay() || 6]}
            </div>
            <div
              className={`text-xl font-bold ${
                day.custodyColor === 'primary'
                  ? 'text-primary'
                  : day.custodyColor === 'secondary'
                    ? 'text-orange-500'
                    : 'text-slate-400'
              }`}
            >
              {day.dayOfMonth}
            </div>
            {day.custodyParent && (
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                {day.custodyParent.name}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Hourly time grid */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800">
          {weekDays.map((day) => (
            <div
              key={day.dateStr}
              className="flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 last:border-r-0"
            >
              {/* All-day events section */}
              {day.allDayEvents.length > 0 && (
                <div className="border-b border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800/50">
                  {day.allDayEvents.slice(0, 2).map((event) => (
                    <div
                      key={event.id}
                      className="text-[10px] font-medium px-1 py-0.5 mb-0.5 bg-primary/20 dark:bg-primary/10 text-primary rounded truncate"
                      title={event.title}
                    >
                      {event.title}
                    </div>
                  ))}
                  {day.allDayEvents.length > 2 && (
                    <div className="text-[9px] text-slate-500 px-1">
                      +{day.allDayEvents.length - 2} more
                    </div>
                  )}
                </div>
              )}

              {/* Hourly time slots */}
              <div className="flex-1 flex flex-col relative">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="flex-1 min-h-[60px] border-b border-slate-100 dark:border-slate-800 p-1 relative group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    title={`${String(hour).padStart(2, '0')}:00`}
                  >
                    <span className="text-[8px] text-slate-400 absolute -top-3 left-1 bg-white dark:bg-slate-900 px-0.5">
                      {String(hour).padStart(2, '0')}h
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer info */}
      <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 text-xs text-slate-500 dark:text-slate-400">
        Week of {new Date(`${weekDays[0].dateStr}T00:00:00Z`).toLocaleDateString()} – Times shown in local timezone
      </div>
    </div>
  );
}
