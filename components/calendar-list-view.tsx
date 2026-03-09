'use client';

import type { CalendarListData, ListViewEvent } from '@/lib/calendar-list-engine';

interface CalendarListViewProps {
  readonly data: CalendarListData;
  readonly year: number;
  readonly month: number;
}

function EventRow({ event }: Readonly<{ event: ListViewEvent }>) {
  return (
    <div className="flex items-start gap-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-primary/50 transition-colors">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-slate-200 dark:bg-slate-700">
        <span
          aria-hidden="true"
          className={`material-symbols-outlined text-sm ${event.iconColor}`}
        >
          {event.icon}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-0.5">
          {event.title}
        </h4>
        {event.timeRange && (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {event.timeRange}
          </p>
        )}
      </div>
      <div className="flex-shrink-0">
        <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/20 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400">
          {event.eventType}
        </span>
      </div>
    </div>
  );
}

/**
 * List view rendering events chronologically, grouped by date.
 * Uses CalendarListData from CalendarListEngine.buildEventStream().
 */
export function CalendarListView({ data, year, month }: CalendarListViewProps) {
  const sortedDates = Array.from(data.dateGrouping.keys()).sort();

  if (sortedDates.length === 0) {
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
          {data.filteredEventCount} event(s) across {sortedDates.length} day(s)
        </p>
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto">
        {sortedDates.map((dateStr) => {
          const dateEvents = data.dateGrouping.get(dateStr) ?? [];
          const firstEvent = dateEvents[0];
          return (
            <div
              key={dateStr}
              className="border-b border-slate-100 dark:border-slate-800 last:border-b-0"
            >
              {/* Date header */}
              <div className="bg-slate-50 dark:bg-slate-800/30 px-6 py-3 sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg font-bold text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {new Date(`${dateStr}T00:00:00Z`).getUTCDate()}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      {firstEvent?.dateLabel ?? new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        timeZone: 'UTC',
                      })}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {dateEvents.length} event{dateEvents.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              </div>

              {/* Events for this day */}
              <div className="px-6 py-4 space-y-3">
                {dateEvents.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
        Showing {data.filteredEventCount} event(s) in{' '}
        {new Date(year, month - 1).toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
        })}
      </div>
    </div>
  );
}
