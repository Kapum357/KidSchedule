'use client';

import type { CalendarMonthData } from '@/lib/calendar-engine';

interface CalendarListViewProps {
  readonly data: CalendarMonthData;
  readonly year: number;
  readonly month: number;
}

/**
 * Simple list view rendering events chronologically.
 * Displays all events grouped by date with category icons.
 * Basic implementation - ready for enhancement with filters.
 */
export function CalendarListView({ data, year, month }: CalendarListViewProps) {
  // Group days with events
  const daysWithEvents = data.days.filter((day) => day.events.length > 0 || day.hasPendingRequest);
  const currentMonth = new Date(year, month - 1);

  if (daysWithEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-500">
        No events scheduled for this month.
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-50 dark:bg-slate-800/50 p-6 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          Events & Schedule Changes
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {daysWithEvents.length} day(s) with events
        </p>
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto">
        {daysWithEvents.map((day) => (
          <div key={day.dateStr} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
            {/* Date header */}
            <div className="bg-slate-50 dark:bg-slate-800/30 px-6 py-3 sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-lg font-bold text-sm ${
                    day.custodyColor === 'primary'
                      ? 'bg-primary/20 text-primary'
                      : day.custodyColor === 'secondary'
                        ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {day.dayOfMonth}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {new Date(`${day.dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </div>
                  {day.custodyParent && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {day.custodyColor === 'split'
                        ? 'Transition Day'
                        : `Custody: ${day.custodyParent.name}`}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Events for this day */}
            <div className="px-6 py-4 space-y-3">
              {day.events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-primary/50 transition-colors"
                >
                  {/* Icon */}
                  {event.icon && (
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${event.bgColor || 'bg-slate-200 dark:bg-slate-700'}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`material-symbols-outlined text-sm ${event.iconColor || 'text-slate-600 dark:text-slate-400'}`}
                      >
                        {event.icon}
                      </span>
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-0.5">
                      {event.title}
                    </h4>
                    {event.time && (
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {event.time}
                      </p>
                    )}
                  </div>

                  {/* Type badge */}
                  <div className="flex-shrink-0">
                    <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/20 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400">
                      {event.type}
                    </span>
                  </div>
                </div>
              ))}

              {/* Pending request indicator */}
              {day.hasPendingRequest && day.pendingRequest && (
                <div className="flex items-start gap-4 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800/30">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-amber-200 dark:bg-amber-900/30">
                    <span aria-hidden="true" className="material-symbols-outlined text-sm text-amber-600 dark:text-amber-400">
                      edit_calendar
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-amber-900 dark:text-amber-200 text-sm mb-0.5">
                      {day.pendingRequest.title}
                    </h4>
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      Schedule change request pending response
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                    Pending
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
        Showing {daysWithEvents.length} day(s) in {new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </div>
    </div>
  );
}
