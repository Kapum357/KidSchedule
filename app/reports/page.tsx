import Link from "next/link";

type TemplateTone = "blue" | "green" | "orange" | "purple";
type ExportStatus = "ready" | "archived";

type ReportTemplate = {
  id: string;
  title: string;
  description: string;
  badge: string;
  icon: string;
  tone: TemplateTone;
  href: string;
};

type RecentExport = {
  id: string;
  dateLabel: string;
  reportType: string;
  format: string;
  status: ExportStatus;
};

const TEMPLATES: readonly ReportTemplate[] = [
  {
    id: "communication-climate",
    title: "Communication Climate",
    description: "Climate scores, conflict drivers, and audited message logs.",
    badge: "Legal Ready",
    icon: "psychology",
    tone: "blue",
    href: "/reports/communication-climate",
  },
  {
    id: "financial-summary",
    title: "Financial Summary",
    description: "Categorized spending, split totals, and settlement history.",
    badge: "Financial",
    icon: "payments",
    tone: "green",
    href: "/expenses",
  },
  {
    id: "custody-transition",
    title: "Custody & Transition",
    description:
      "Documented handoffs, change requests, and planned vs. actual time.",
    badge: "Audit",
    icon: "calendar_today",
    tone: "orange",
    href: "/reports/custody-compliance",
  },
  {
    id: "school-vault",
    title: "School Academic Vault",
    description:
      "Consolidated report cards, permission slips, and medical records.",
    badge: "Documents",
    icon: "school",
    tone: "purple",
    href: "/school",
  },
] as const;

const RECENT_EXPORTS: readonly RecentExport[] = [
  {
    id: "exp-1",
    dateLabel: "Oct 24, 2023",
    reportType: "Financial Summary (Q3)",
    format: "PDF",
    status: "ready",
  },
  {
    id: "exp-2",
    dateLabel: "Oct 15, 2023",
    reportType: "Custody Audit - Lucas",
    format: "CSV",
    status: "ready",
  },
  {
    id: "exp-3",
    dateLabel: "Sep 30, 2023",
    reportType: "Climate Report (Full Year)",
    format: "PDF",
    status: "archived",
  },
  {
    id: "exp-4",
    dateLabel: "Sep 12, 2023",
    reportType: "Medical & School Vault",
    format: "PDF",
    status: "ready",
  },
  {
    id: "exp-5",
    dateLabel: "Aug 28, 2023",
    reportType: "Transition Audit - Sophie",
    format: "PDF",
    status: "ready",
  },
] as const;

function toneClasses(tone: TemplateTone): {
  iconBg: string;
  iconFg: string;
} {
  if (tone === "green") {
    return {
      iconBg: "bg-green-100 dark:bg-green-900/30",
      iconFg: "text-green-600",
    };
  }

  if (tone === "orange") {
    return {
      iconBg: "bg-orange-100 dark:bg-orange-900/30",
      iconFg: "text-orange-600",
    };
  }

  if (tone === "purple") {
    return {
      iconBg: "bg-purple-100 dark:bg-purple-900/30",
      iconFg: "text-purple-600",
    };
  }

  return {
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    iconFg: "text-blue-600",
  };
}

function statusClasses(status: ExportStatus): string {
  if (status === "archived") {
    return "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300";
  }

  return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
}

function statusLabel(status: ExportStatus): string {
  if (status === "archived") {
    return "Archived";
  }

  return "Ready";
}

export default function ReportsPage() {
  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100">
      <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden">
        <header className="flex items-center justify-between border-b border-primary/20 bg-white px-6 py-3 dark:bg-slate-900">
          <div className="flex items-center gap-4 text-slate-900 dark:text-slate-100">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
              <span className="material-symbols-outlined">family_restroom</span>
            </div>
            <h2 className="text-lg font-bold tracking-tight">KidSchedule</h2>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              aria-label="Notifications"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-slate-700 transition-colors hover:bg-primary/20 dark:text-slate-300"
            >
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button
              type="button"
              aria-label="Account"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-slate-700 transition-colors hover:bg-primary/20 dark:text-slate-300"
            >
              <span className="material-symbols-outlined">account_circle</span>
            </button>
          </div>
        </header>

        <div className="flex flex-1 flex-col lg:flex-row">
          <aside className="w-full shrink-0 border-r border-primary/10 bg-white p-4 dark:bg-slate-900 lg:w-64">
            <div className="mb-6 px-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Main Menu
              </p>
            </div>

            <nav className="space-y-1">
              <Link
                href="/dashboard"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-600 hover:bg-primary/10 dark:text-slate-400"
              >
                <span className="material-symbols-outlined">dashboard</span>
                <span className="text-sm font-medium">Dashboard</span>
              </Link>
              <Link
                href="/calendar"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-600 hover:bg-primary/10 dark:text-slate-400"
              >
                <span className="material-symbols-outlined">calendar_month</span>
                <span className="text-sm font-medium">Calendar</span>
              </Link>
              <Link
                href="/messages"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-600 hover:bg-primary/10 dark:text-slate-400"
              >
                <span className="material-symbols-outlined">chat</span>
                <span className="text-sm font-medium">Messages</span>
              </Link>
              <Link
                href="/reports"
                className="flex items-center gap-3 rounded-lg bg-primary px-3 py-2 text-white"
                aria-current="page"
              >
                <span className="material-symbols-outlined">assessment</span>
                <span className="text-sm font-medium">Reports</span>
              </Link>
            </nav>
          </aside>

          <main className="flex-1 space-y-8 p-6">
            <section className="max-w-5xl">
              <h1 className="text-3xl font-extrabold tracking-tight">
                Reports &amp; Document Exports
              </h1>
              <p className="mt-2 max-w-3xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
                Generate objective, court-admissible records and data exports
                for legal professionals, mediators, or personal record-keeping.
              </p>
            </section>

            <div className="flex flex-col gap-8 xl:flex-row">
              <div className="flex-1 space-y-6">
                <h2 className="border-b border-primary/10 pb-2 text-xl font-bold">
                  Available Report Templates
                </h2>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {TEMPLATES.map((template) => {
                    const tone = toneClasses(template.tone);

                    return (
                      <article
                        key={template.id}
                        className="group rounded-xl border border-primary/10 bg-white p-5 shadow-sm transition-all hover:border-primary dark:bg-slate-800"
                      >
                        <div className="mb-4 flex items-start justify-between">
                          <div
                            className={`rounded-lg p-2 ${tone.iconBg} ${tone.iconFg}`}
                          >
                            <span className="material-symbols-outlined">
                              {template.icon}
                            </span>
                          </div>
                          <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-700">
                            {template.badge}
                          </span>
                        </div>

                        <h3 className="mb-1 font-bold text-slate-900 dark:text-slate-100">
                          {template.title}
                        </h3>
                        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                          {template.description}
                        </p>

                        <Link
                          href={template.href}
                          className="block w-full rounded-lg bg-primary/10 py-2 text-center text-sm font-bold text-primary transition-colors hover:bg-primary hover:text-white"
                        >
                          Select Template
                        </Link>
                      </article>
                    );
                  })}
                </div>

                <section className="space-y-4 pt-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold">Recent Exports</h2>
                    <Link
                      href="/archive"
                      className="text-sm font-bold text-primary hover:underline"
                    >
                      View All History
                    </Link>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-primary/10 bg-white shadow-sm dark:bg-slate-900">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-primary/10 bg-primary/5">
                          <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">
                            Export Date
                          </th>
                          <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">
                            Report Type
                          </th>
                          <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">
                            Format
                          </th>
                          <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">
                            Status
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                            Actions
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-primary/5">
                        {RECENT_EXPORTS.map((item) => (
                          <tr
                            key={item.id}
                            className="transition-colors hover:bg-primary/5"
                          >
                            <td className="px-4 py-4 text-sm font-medium">
                              {item.dateLabel}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              {item.reportType}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-500">
                              {item.format}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClasses(item.status)}`}
                              >
                                {statusLabel(item.status)}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <button
                                type="button"
                                aria-label={`Download ${item.reportType}`}
                                className="text-primary transition-colors hover:text-primary/70"
                              >
                                <span className="material-symbols-outlined">
                                  download
                                </span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              <aside className="w-full shrink-0 xl:w-80">
                <section className="sticky top-6 rounded-xl border border-primary/20 bg-white p-6 shadow-sm dark:bg-slate-800">
                  <h2 className="mb-6 flex items-center gap-2 text-lg font-bold">
                    <span className="material-symbols-outlined text-primary">
                      tune
                    </span>
                    Generation Settings
                  </h2>

                  <form className="space-y-6">
                    <div>
                      <p className="mb-3 block text-sm font-bold text-slate-700 dark:text-slate-300">
                        Select Date Range
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        <button
                          type="button"
                          className="w-full rounded-lg border border-primary bg-primary/5 px-4 py-2 text-left text-sm font-medium text-primary"
                        >
                          Last 30 Days
                        </button>
                        <button
                          type="button"
                          className={
                            "w-full rounded-lg border border-primary/10 px-4 py-2 text-left text-sm " +
                            "text-slate-600 transition-colors hover:border-primary dark:text-slate-400"
                          }
                        >
                          Last 90 Days
                        </button>
                        <button
                          type="button"
                          className={
                            "flex w-full items-center justify-between rounded-lg border border-primary/10 " +
                            "px-4 py-2 text-left text-sm text-slate-600 transition-colors hover:border-primary " +
                            "dark:text-slate-400"
                          }
                        >
                          <span>Custom Range</span>
                          <span className="material-symbols-outlined text-sm">
                            calendar_today
                          </span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="mb-3 block text-sm font-bold text-slate-700 dark:text-slate-300">
                        Filter by Child
                      </p>
                      <div className="space-y-2">
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            defaultChecked
                            className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">All Children</span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">Sophie</span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">Lucas</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <p className="mb-3 block text-sm font-bold text-slate-700 dark:text-slate-300">
                        Export Format
                      </p>
                      <div className="flex gap-4">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="format"
                            defaultChecked
                            className="h-4 w-4 border-primary/30 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">PDF</span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="format"
                            className="h-4 w-4 border-primary/30 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">CSV / Excel</span>
                        </label>
                      </div>
                    </div>

                    <div className="border-t border-primary/10 pt-4">
                      <button
                        type="button"
                        className={
                          "flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 " +
                          "font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
                        }
                      >
                        <span className="material-symbols-outlined">
                          document_scanner
                        </span>
                        Generate Report
                      </button>
                      <p className="mt-4 text-center text-[11px] leading-tight text-slate-500">
                        All reports include a digital signature and timestamp for
                        verification.
                      </p>
                    </div>
                  </form>
                </section>

                <section className="mt-4 rounded-xl border border-primary/10 bg-primary/5 p-4">
                  <div className="mb-2 flex items-center gap-3 text-primary">
                    <span className="material-symbols-outlined">
                      verified_user
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider">
                      System Integrity
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Your data is secured with AES-256 encryption. Last audit
                    sync: Today, 08:14 AM.
                  </p>
                </section>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}