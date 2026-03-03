'use client';

export function CalendarFeedSubscription({
  familyId,
}: Readonly<{
  familyId: string;
}>) {
  const feedUrl = `/api/families/${familyId}/calendar.ics`;

  const copyToClipboard = () => {
    const fullUrl = `${window.location.origin}${feedUrl}`;
    navigator.clipboard.writeText(fullUrl);
  };

  return (
    <div className="flex flex-col gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <h3 className="text-slate-900 dark:text-slate-100 font-bold text-sm uppercase tracking-wider">
          Calendar Feed
        </h3>
        <span aria-hidden="true" className="material-symbols-outlined text-slate-400 text-sm">
          link
        </span>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Subscribe to your family&apos;s calendar in Apple Calendar, Google Calendar, or Outlook.
      </p>

      <button
        onClick={copyToClipboard}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        aria-label="Copy feed URL"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-sm">
          content_copy
        </span>
        Copy Feed URL
      </button>
    </div>
  );
}
