import { formatCurrency } from "@/lib/expense-engine";
import Image from "next/image";

type ExpenseStatus = "pending" | "overdue" | "settled" | "approved";

type ExpenseActivity = {
  id: string;
  title: string;
  details: string;
  amountCents: number;
  amountLabel: string;
  status: ExpenseStatus;
  icon: string;
  tone: "blue" | "red" | "purple" | "teal";
  canPay?: boolean;
};

const activity: ExpenseActivity[] = [
  {
    id: "1",
    title: "School Tuition - Fall Semester",
    details: "Shared 50/50 • Added by You • Aug 24",
    amountCents: 25000,
    amountLabel: "Your share",
    status: "pending",
    icon: "school",
    tone: "blue",
  },
  {
    id: "2",
    title: "Orthodontist Visit - Emma",
    details: "Shared 60/40 • Added by Sarah • Aug 15",
    amountCents: 8550,
    amountLabel: "You owe",
    status: "overdue",
    icon: "medical_services",
    tone: "red",
    canPay: true,
  },
  {
    id: "3",
    title: "Soccer Cleats - Noah",
    details: "Shared 50/50 • Added by You • Aug 10",
    amountCents: 4500,
    amountLabel: "Paid Aug 12",
    status: "settled",
    icon: "sports_soccer",
    tone: "purple",
  },
  {
    id: "4",
    title: "Piano Lessons - September",
    details: "Shared 50/50 • Added by You • Sep 01",
    amountCents: 20000,
    amountLabel: "Your share",
    status: "approved",
    icon: "piano",
    tone: "teal",
  },
];

function statusPill(status: ExpenseStatus): string {
  if (status === "pending") {
    return "inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-900/20 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-600/20";
  }
  if (status === "overdue") {
    return "inline-flex items-center rounded-full bg-rose-50 dark:bg-rose-900/20 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400 ring-1 ring-inset ring-rose-600/20";
  }
  if (status === "settled") {
    return "inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-500/10";
  }

  return "inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/20";
}

function statusText(status: ExpenseStatus): string {
  if (status === "pending") {
    return "Pending Approval";
  }
  if (status === "overdue") {
    return "Overdue";
  }
  if (status === "settled") {
    return "Settled";
  }

  return "Approved to Pay";
}

function iconToneClass(tone: ExpenseActivity["tone"]): string {
  if (tone === "blue") {
    return "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400";
  }
  if (tone === "red") {
    return "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400";
  }
  if (tone === "purple") {
    return "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400";
  }

  return "bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400";
}

export default function ExpensesOverviewPage() {
  return (
    <div className="bg-background-light dark:bg-background-dark font-display antialiased text-text-main h-screen flex overflow-hidden">
      <aside className="w-64 bg-surface-light dark:bg-surface-dark border-r border-slate-200 dark:border-slate-800 flex flex-col flex-shrink-0 z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-lg text-primary">
            <span className="material-symbols-outlined text-2xl">family_restroom</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">KidSchedule</span>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          <a className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors" href="/calendar">
            <span className="material-symbols-outlined">calendar_month</span>
            <span>Calendar</span>
          </a>
          <a className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium bg-primary/10 text-primary rounded-lg transition-colors" href="/expenses">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance_wallet</span>
            <span>Expenses</span>
          </a>
          <a className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors" href="/messages">
            <span className="material-symbols-outlined">forum</span>
            <span>Messages</span>
          </a>
          <a className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors" href="/vault">
            <span className="material-symbols-outlined">folder_shared</span>
            <span>Documents</span>
          </a>
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Filters</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block" htmlFor="child-filter">Child</label>
                <select id="child-filter" className="block w-full rounded-lg border-slate-200 text-sm focus:border-primary focus:ring-primary bg-background-light dark:bg-background-dark dark:border-slate-700 dark:text-slate-200 py-1.5">
                  <option>All Children</option>
                  <option>Emma</option>
                  <option>Noah</option>
                </select>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500 mb-1.5 block">Category</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input defaultChecked className="rounded text-primary focus:ring-primary border-slate-300" type="checkbox" />
                    <span>Medical</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input defaultChecked className="rounded text-primary focus:ring-primary border-slate-300" type="checkbox" />
                    <span>Education</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input defaultChecked className="rounded text-primary focus:ring-primary border-slate-300" type="checkbox" />
                    <span>Extracurricular</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <a className="flex items-center gap-3 px-2 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors" href="/settings">
            <Image
              alt="User"
              className="w-8 h-8 rounded-full"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuA1w2AGns_-BQJDlkxOMJqh6JsWhXIU_LHNWK-dg02ydNsLN_1xx_Mb_UsJZ59Dns3BppYMDQjLCdaRDPEbKkPk3fODCcmyfVrE83IH1Tg61oAyPvDlSgsUqGWYaPHPXMFDihzZAFA0vpzRdn9qFb79uvxvnQWngoRpuJlf_-G-pvGJulqfbweeEJkFZhwcDU-hW9_-Nq-M_rmWZ0cycQysKCy6lqA_9o2Y2VaUEgolP2pk5hHNbtRozUq-zNxxggIXGIwXoftEimw"
              width={32}
              height={32}
              unoptimized
            />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">Alex Morgan</span>
              <span className="text-xs text-slate-500">Settings</span>
            </div>
          </a>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background-light dark:bg-background-dark relative">
        <header className="bg-surface-light dark:bg-surface-dark border-b border-slate-200 dark:border-slate-800 h-16 flex items-center justify-between px-6 flex-shrink-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Expenses Overview</h1>
          <div className="flex items-center gap-4">
            <a href="/expenses/add" className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm">
              <span className="material-symbols-outlined text-lg">add</span>
              <span>Add Expense</span>
            </a>
            <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative" aria-label="Notifications">
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-surface-dark"></span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-surface-light dark:bg-surface-dark p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between relative overflow-hidden group">
                <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-50 dark:bg-emerald-900/10 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                <div className="relative z-10">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Total Owed to You</p>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(45000)}</h2>
                  <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1 font-medium">
                    <span className="material-symbols-outlined text-sm">trending_up</span>
                    <span>+$120.00 this month</span>
                  </p>
                </div>
                <div className="h-12 w-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center text-emerald-600 dark:text-emerald-400 relative z-10">
                  <span className="material-symbols-outlined">arrow_downward</span>
                </div>
              </div>

              <div className="bg-surface-light dark:bg-surface-dark p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between relative overflow-hidden group">
                <div className="absolute right-0 top-0 w-32 h-32 bg-rose-50 dark:bg-rose-900/10 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                <div className="relative z-10">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Total You Owe</p>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(8550)}</h2>
                  <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">No overdue payments</p>
                </div>
                <div className="h-12 w-12 bg-rose-100 dark:bg-rose-900/30 rounded-lg flex items-center justify-center text-rose-600 dark:text-rose-400 relative z-10">
                  <span className="material-symbols-outlined">arrow_upward</span>
                </div>
              </div>
            </div>

            <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/20">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Recent Activity</h3>
                <button className="text-xs font-medium text-primary hover:text-primary-hover px-3 py-1 rounded hover:bg-primary/5 transition-colors">View All</button>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {activity.map((item) => {
                  const rowClasses = `p-4 sm:px-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors grid grid-cols-12 gap-4 items-center ${item.status === "overdue" ? "bg-rose-50/30 dark:bg-rose-900/5" : ""} ${item.status === "settled" ? "opacity-75" : ""}`;
                  let amountClass: string;
                  if (item.status === "overdue") {
                    amountClass = "text-rose-600 dark:text-rose-400";
                  } else if (item.status === "settled") {
                    amountClass = "text-slate-500 dark:text-slate-400 line-through decoration-slate-400";
                  } else {
                    amountClass = "text-slate-900 dark:text-white";
                  }
                  const amountHintClass = item.status === "settled" ? "text-slate-400" : "text-slate-500";

                  let actionNode: React.ReactNode;
                  if (item.canPay) {
                    actionNode = (
                      <button className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-sm flex items-center gap-1 transition-colors">
                        <span>Pay Now</span>
                        <span className="material-symbols-outlined text-sm">credit_card</span>
                      </button>
                    );
                  } else if (item.status === "settled") {
                    actionNode = (
                      <div className="w-8 flex justify-center">
                        <span className="material-symbols-outlined text-green-600 text-xl">check_circle</span>
                      </div>
                    );
                  } else {
                    actionNode = <div className="w-8"></div>;
                  }

                  return (
                    <div key={item.id} className={rowClasses}>
                      <div className="col-span-12 sm:col-span-5 flex items-start gap-4">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${iconToneClass(item.tone)}`}>
                          <span className="material-symbols-outlined text-xl">{item.icon}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p>
                          <p className="text-xs text-slate-500">{item.details}</p>
                        </div>
                      </div>

                      <div className="col-span-6 sm:col-span-3">
                        <span className={statusPill(item.status)}>{statusText(item.status)}</span>
                      </div>

                      <div className="col-span-6 sm:col-span-4 flex items-center justify-end gap-4">
                        <div className="text-right">
                          <p className={`text-sm font-bold ${amountClass}`}>{formatCurrency(item.amountCents)}</p>
                          <p className={`text-xs ${amountHintClass}`}>{item.amountLabel}</p>
                        </div>
                        {actionNode}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/20 text-center">
                <button className="text-sm text-slate-500 hover:text-primary font-medium transition-colors">Load more expenses</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
