type ReportPeriod = "last-30" | "last-90" | "ytd" | "custom";

type Sentiment = "hostile" | "neutral" | "tense" | "cooperative";

type HeatLevel = "none" | "calm" | "tension" | "conflict";

type Driver = {
  label: string;
  percent: number;
  tone: "danger" | "warning" | "muted" | "primary";
};

type Interaction = {
  id: string;
  dateTime: string;
  topic: string;
  topicIcon: string;
  initiatedBy: string;
  sentiment: Sentiment;
  responseTime: string;
  status: string;
  statusTone?: "muted" | "primary";
};

type HeatCell = {
  id: string;
  level: HeatLevel;
  title?: string;
};

const REPORT_PERIODS: readonly { value: ReportPeriod; label: string }[] = [
  { value: "last-30", label: "Last 30 Days" },
  { value: "last-90", label: "Last 90 Days" },
  { value: "ytd", label: "Year to Date" },
  { value: "custom", label: "Custom Range" },
] as const;

const DRIVERS: readonly Driver[] = [
  { label: "Scheduling Changes", percent: 42, tone: "danger" },
  { label: "Financial Disputes", percent: 28, tone: "warning" },
  { label: "Drop-off/Pick-up", percent: 15, tone: "muted" },
  { label: "Medical/Health", percent: 8, tone: "primary" },
] as const;

const INTERACTIONS: readonly Interaction[] = [
  {
    id: "1",
    dateTime: "Nov 28, 09:14 AM",
    topic: "Holiday Schedule Change",
    topicIcon: "calendar_month",
    initiatedBy: "Parent A (You)",
    sentiment: "hostile",
    responseTime: "4h 12m",
    status: "Resolved",
    statusTone: "muted",
  },
  {
    id: "2",
    dateTime: "Nov 25, 02:30 PM",
    topic: "School Supplies Reimbursement",
    topicIcon: "payments",
    initiatedBy: "Parent B",
    sentiment: "neutral",
    responseTime: "25m",
    status: "Payment Sent",
    statusTone: "primary",
  },
  {
    id: "3",
    dateTime: "Nov 22, 06:45 PM",
    topic: "Late Pickup Notice",
    topicIcon: "directions_car",
    initiatedBy: "Parent B",
    sentiment: "tense",
    responseTime: "12m",
    status: "Acknowledged",
    statusTone: "muted",
  },
  {
    id: "4",
    dateTime: "Nov 18, 10:00 AM",
    topic: "Dental Appointment",
    topicIcon: "medical_services",
    initiatedBy: "Parent A (You)",
    sentiment: "cooperative",
    responseTime: "1h 05m",
    status: "Scheduled",
    statusTone: "muted",
  },
] as const;

const HEATMAP_CELLS: readonly HeatCell[] = [
  { id: "1", level: "none" },
  { id: "2", level: "none" },
  { id: "3", level: "none" },
  { id: "4", level: "calm" },
  { id: "5", level: "calm" },
  { id: "6", level: "conflict", title: "High Conflict Detected" },
  { id: "7", level: "none" },
  { id: "8", level: "none" },
  { id: "9", level: "calm" },
  { id: "10", level: "tension" },
  { id: "11", level: "none" },
  { id: "12", level: "none" },
  { id: "13", level: "none" },
  { id: "14", level: "calm" },
  { id: "15", level: "none" },
  { id: "16", level: "none" },
  { id: "17", level: "conflict" },
  { id: "18", level: "conflict" },
  { id: "19", level: "tension" },
  { id: "20", level: "none" },
  { id: "21", level: "none" },
  { id: "22", level: "none" },
  { id: "23", level: "none" },
  { id: "24", level: "none" },
  { id: "25", level: "none" },
  { id: "26", level: "calm" },
  { id: "27", level: "calm" },
] as const;

function sentimentClasses(sentiment: Sentiment): string {
  if (sentiment === "hostile") {
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800";
  }

  if (sentiment === "neutral") {
    return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800";
  }

  if (sentiment === "tense") {
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800";
  }

  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
}

function sentimentLabel(sentiment: Sentiment): string {
  if (sentiment === "hostile") {
    return "Hostile";
  }

  if (sentiment === "neutral") {
    return "Neutral";
  }

  if (sentiment === "tense") {
    return "Tense";
  }

  return "Cooperative";
}

function driverBarColor(tone: Driver["tone"]): string {
  if (tone === "danger") {
    return "bg-red-400";
  }

  if (tone === "warning") {
    return "bg-orange-400";
  }

  if (tone === "muted") {
    return "bg-slate-400";
  }

  return "bg-primary";
}

function driverPercentColor(tone: Driver["tone"]): string {
  if (tone === "danger") {
    return "text-red-500";
  }

  if (tone === "warning") {
    return "text-orange-400";
  }

  if (tone === "muted") {
    return "text-slate-500";
  }

  return "text-primary";
}

function heatCellColor(level: HeatLevel): string {
  if (level === "calm") {
    return "bg-green-100 dark:bg-green-900/30";
  }

  if (level === "tension") {
    return "bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800";
  }

  if (level === "conflict") {
    return "bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-800";
  }

  return "bg-slate-50 dark:bg-slate-800";
}

function ToggleRow({ label, defaultChecked }: Readonly<{ label: string; defaultChecked?: boolean }>) {
  return (
    <label className="group flex cursor-pointer items-center justify-between">
      <span className="text-sm text-slate-600 transition-colors group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white">
        {label}
      </span>
      <span className="relative h-6 w-11 rounded-full bg-slate-200 transition-colors dark:bg-slate-700 has-[:checked]:bg-primary">
        <input type="checkbox" defaultChecked={defaultChecked} className="peer sr-only" />
        <span className="absolute left-[2px] top-[2px] h-5 w-5 rounded-full border border-gray-300 bg-white transition-transform peer-checked:translate-x-full" />
      </span>
    </label>
  );
}

export default function CommunicationClimateReportPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-background-light font-display text-text-main antialiased dark:bg-background-dark">
      <aside className="z-20 hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-surface-light shadow-sm dark:border-slate-800 dark:bg-surface-dark lg:flex">
        <div className="flex h-16 items-center border-b border-slate-100 px-6 dark:border-slate-800">
          <div className="flex items-center gap-2 text-primary">
            <span className="material-symbols-outlined text-2xl">family_restroom</span>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">KidSchedule</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="mb-6 text-xs font-bold uppercase tracking-wider text-slate-400">Report Settings</h3>

          <div className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="report-period" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Reporting Period
              </label>
              <select
                id="report-period"
                defaultValue="last-90"
                className="w-full rounded-lg border-slate-300 bg-white py-2.5 text-sm focus:border-primary focus:ring-primary dark:border-slate-600 dark:bg-slate-800"
              >
                {REPORT_PERIODS.map((period) => (
                  <option key={period.value} value={period.value}>
                    {period.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-4 pt-2">
              <ToggleRow label="Include Financial Records" defaultChecked />
              <ToggleRow label="Include Schedule Deviations" defaultChecked />
              <ToggleRow label="Highlight Escalations" />
            </div>

            <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">Export Format</h3>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" className="flex flex-col items-center justify-center rounded-lg border-2 border-primary bg-primary/5 p-3 text-primary transition-all">
                  <span className="material-symbols-outlined mb-1">picture_as_pdf</span>
                  <span className="text-xs font-semibold">PDF</span>
                </button>
                <button type="button" className="flex flex-col items-center justify-center rounded-lg border border-slate-200 p-3 text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                  <span className="material-symbols-outlined mb-1">table_view</span>
                  <span className="text-xs font-semibold">CSV</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-500">JD</div>
            <div className="text-sm">
              <p className="font-semibold text-slate-900 dark:text-white">John Doe</p>
              <p className="text-xs text-slate-500">Premium Plan</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex h-full flex-1 flex-col overflow-hidden bg-background-light dark:bg-background-dark">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-surface-light px-8 dark:border-slate-800 dark:bg-surface-dark">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Communication Climate Report</h1>
            <p className="text-xs text-slate-500">Generated for Case #22-FAM-0492 • Sep 1 - Nov 30, 2023</p>
          </div>

          <div className="flex items-center gap-4">
            <button type="button" className="text-slate-500 transition-colors hover:text-slate-800 dark:hover:text-white" aria-label="Print report">
              <span className="material-symbols-outlined">print</span>
            </button>
            <button type="button" className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover">
              <span className="material-symbols-outlined text-lg">download</span>
              <span>Download Court-Ready PDF</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-7xl space-y-8">
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <article className="flex flex-col items-center rounded-xl border border-slate-200 bg-surface-light p-6 shadow-sm dark:border-slate-800 dark:bg-surface-dark">
                <div className="mb-4 flex w-full items-start justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">Climate Score</h2>
                  <span className="material-symbols-outlined cursor-help text-lg text-slate-400" title="Based on AI sentiment analysis of all messages">
                    info
                  </span>
                </div>

                <div className="relative mt-2 h-24 w-48 overflow-hidden">
                  <div
                    className="absolute h-48 w-48 rounded-full"
                    style={{
                      backgroundImage:
                        "conic-gradient(from 180deg at 50% 100%, #EF4444 0deg, #F59E0B 60deg, #6BCABD 120deg, #6BCABD 180deg)",
                    }}
                  />
                  <div className="absolute left-4 top-4 h-40 w-40 rounded-full bg-surface-light dark:bg-surface-dark" />
                </div>

                <div className="relative z-10 -mt-8 text-center">
                  <span className="text-4xl font-extrabold text-primary">72</span>
                  <span className="block text-sm font-medium text-slate-400">/ 100</span>
                </div>

                <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
                  <span className="font-bold text-primary">Moderately Healthy.</span>
                  <span> Communication is generally constructive with occasional friction.</span>
                </p>
              </article>

              <article className="rounded-xl border border-slate-200 bg-surface-light p-6 shadow-sm dark:border-slate-800 dark:bg-surface-dark">
                <div className="mb-4 flex w-full items-start justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">Conflict Heatmap</h2>
                  <select defaultValue="november" className="rounded border-none bg-slate-50 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    <option value="november">November</option>
                  </select>
                </div>

                <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
                  <span>S</span>
                  <span>M</span>
                  <span>T</span>
                  <span>W</span>
                  <span>T</span>
                  <span>F</span>
                  <span>S</span>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {HEATMAP_CELLS.map((cell) => (
                    <div key={cell.id} className={`aspect-square rounded ${heatCellColor(cell.level)} ${cell.level === "conflict" ? "cursor-pointer hover:ring-2 ring-red-400 transition-all" : ""}`} title={cell.title} />
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-green-400" />
                    <span>Calm</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-yellow-400" />
                    <span>Tension</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-400" />
                    <span>Conflict</span>
                  </span>
                </div>
              </article>

              <article className="rounded-xl border border-slate-200 bg-surface-light p-6 shadow-sm dark:border-slate-800 dark:bg-surface-dark">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">Top Conflict Drivers</h2>

                <div className="space-y-4">
                  {DRIVERS.map((driver) => (
                    <div key={driver.label}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{driver.label}</span>
                        <span className={`font-bold ${driverPercentColor(driver.tone)}`}>{driver.percent}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700">
                        <div className={`h-2 rounded-full ${driverBarColor(driver.tone)}`} style={{ width: `${driver.percent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-surface-light shadow-sm dark:border-slate-800 dark:bg-surface-dark">
              <div className="flex items-center justify-between border-b border-slate-200 p-6 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Legal Export Preview</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Showing last 5 interactions</span>
                  <button type="button" className="px-2 text-sm font-semibold text-primary hover:underline">View Full Log</button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-6 py-4">Date &amp; Time</th>
                      <th className="px-6 py-4">Topic</th>
                      <th className="px-6 py-4">Initiated By</th>
                      <th className="px-6 py-4">Sentiment Analysis</th>
                      <th className="px-6 py-4">Response Time</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {INTERACTIONS.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{item.dateTime}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-base text-slate-400">{item.topicIcon}</span>
                            <span>{item.topic}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">{item.initiatedBy}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${sentimentClasses(item.sentiment)}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            <span>{sentimentLabel(item.sentiment)}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4">{item.responseTime}</td>
                        <td className={`px-6 py-4 ${item.statusTone === "primary" ? "font-medium text-primary" : "text-slate-400"}`}>{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/30">
                All communications are timestamped and unalterable. This log meets standard admissibility requirements for family court exhibits.
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
