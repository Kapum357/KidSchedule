'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

type ViewMode = 'month' | 'week' | 'list';

interface CalendarViewSwitcherProps {
  readonly currentMode: ViewMode;
  readonly year: number;
  readonly month: number;
  readonly baseHref?: string;
}

interface ViewOption {
  mode: ViewMode;
  label: string;
  icon: string;
  description: string;
}

const VIEW_OPTIONS: readonly ViewOption[] = [
  {
    mode: 'month',
    label: 'Month',
    icon: 'calendar_month',
    description: 'Monthly overview',
  },
  {
    mode: 'week',
    label: 'Week',
    icon: 'date_range',
    description: 'Weekly view with times',
  },
  {
    mode: 'list',
    label: 'List',
    icon: 'list',
    description: 'Chronological events',
  },
];

function buildViewUrl(
  mode: ViewMode,
  year: number,
  month: number,
  baseHref: string
): string {
  const query = new URLSearchParams();
  query.set('year', String(year));
  query.set('month', String(month));
  if (mode !== 'month') {
    query.set('mode', mode);
  }
  return `${baseHref}?${query.toString()}`;
}

export function CalendarViewSwitcher({
  currentMode,
  year,
  month,
  baseHref = '/calendar',
}: CalendarViewSwitcherProps): ReactNode {
  return (
    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-1 shadow-sm">
      {VIEW_OPTIONS.map((view) => {
        const isActive = currentMode === view.mode;
        const href = buildViewUrl(view.mode, year, month, baseHref);

        return (
          <Link
            key={view.mode}
            href={href}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              isActive
                ? 'bg-primary text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
            title={view.description}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-lg">
              {view.icon}
            </span>
            <span className="hidden sm:inline">{view.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
