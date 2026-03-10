/**
 * KidSchedule – Expenses & Settlement Page
 *
 * A Next.js Server Component that displays shared child-related expenses,
 * settlement balances, and transaction history. Features filtering by child,
 * date range, payer; summary cards for balances; and a paginated transactions
 * table with category badges and receipt links.
 *
 */

import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib/auth";
import { ensureParentExists } from "@/lib/parent-setup-engine";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/app/theme-toggle";
import { SettleBalanceButton } from "@/components/settle-balance-button";
import type { Expense, Parent, Child } from " @/lib";
import type { DbExpense, DbParent, DbChild } from "@/lib/persistence/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpenseSearchParams = {
  child?: string;
  dateRange?: string;
  paidBy?: string;
  page?: string;
};

type CategoryOption = {
  value: Exclude<Expense["category"], never>;
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
};

interface SettlementBalance {
  youOweThem: number;
  theyOweYou: number;
  netBalance: number;
}

const CATEGORY_MAP: Record<Expense["category"], CategoryOption> = {
  medical: {
    value: "medical",
    label: "Medical",
    color: "#3B82F6",
    bgColor: "bg-blue-50 dark:bg-blue-900/30",
    textColor: "text-blue-700 dark:text-blue-300",
  },
  education: {
    value: "education",
    label: "Education",
    color: "#10B981",
    bgColor: "bg-green-50 dark:bg-green-900/30",
    textColor: "text-green-700 dark:text-green-300",
  },
  clothing: {
    value: "clothing",
    label: "Clothing",
    color: "#F59E0B",
    bgColor: "bg-amber-50 dark:bg-amber-900/30",
    textColor: "text-amber-700 dark:text-amber-300",
  },
  activity: {
    value: "activity",
    label: "Activities",
    color: "#EC4899",
    bgColor: "bg-pink-50 dark:bg-pink-900/30",
    textColor: "text-pink-700 dark:text-pink-300",
  },
  childcare: {
    value: "childcare",
    label: "Childcare",
    color: "#8B5CF6",
    bgColor: "bg-purple-50 dark:bg-purple-900/30",
    textColor: "text-purple-700 dark:text-purple-300",
  },
  other: {
    value: "other",
    label: "Other",
    color: "#6B7280",
    bgColor: "bg-gray-50 dark:bg-gray-900/30",
    textColor: "text-gray-700 dark:text-gray-300",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function mapParent(row: DbParent): Parent {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl ?? undefined,
    phone: row.phone ?? undefined,
  };
}

function mapChild(row: DbChild): Child {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth,
    avatarUrl: row.avatarUrl ?? undefined,
  };
}

function mapExpense(row: DbExpense): Expense {
  return {
    id: row.id,
    familyId: row.familyId,
    title: row.title,
    description: row.description,
    category: row.category as Expense["category"],
    totalAmount: row.totalAmount,
    currency: row.currency,
    splitMethod: row.splitMethod as Expense["splitMethod"],
    splitRatio: row.splitRatio,
    paidBy: row.paidBy,
    paymentStatus: row.paymentStatus as Expense["paymentStatus"],
    receiptUrl: row.receiptUrl,
    date: row.date,
    createdAt: row.createdAt,
  };
}

// ─── Settlement Calculation ────────────────────────────────────────────────────

/**
 * Calculate bidirectional settlement balance between two parents.
 *
 * Algorithm:
 *   For each expense, determine how much you owe (yourShare).
 *   If you paid it: the other parent owes you their share.
 *   If they paid it: you owe them your share.
 *   Net balance = theyOweYou - youOweThem (positive = they owe you)
 *
 * Complexity: O(E) where E = number of expenses
 */
function calculateSettlement(
  expenses: Expense[],
  currentParentId: string,
  otherParentId: string
): SettlementBalance {
  let youOweThem = 0;
  let theyOweYou = 0;

  for (const exp of expenses) {
    const yourShare = calculateYourShare(exp, currentParentId);

    if (exp.paidBy === currentParentId) {
      const theirShare = exp.totalAmount - yourShare;
      theyOweYou += theirShare;
    } else if (exp.paidBy === otherParentId) {
      youOweThem += yourShare;
    }
  }

  return {
    youOweThem,
    theyOweYou,
    netBalance: theyOweYou - youOweThem,
  };
}

/**
 * Calculate your share of an expense based on split method.
 *
 * Three split methods:
 *   1. "50-50": You pay half the total
 *   2. "custom": You pay splitRatio[yourParentId] * totalAmount
 *   3. "one-parent": You pay full if you're paidBy, otherwise 0
 *
 * Uses integer cents and rounding to avoid floating-point precision errors.
 */
function calculateYourShare(expense: Expense, yourParentId: string): number {
  if (expense.splitMethod === "50-50") {
    return Math.round(expense.totalAmount / 2);
  }

  if (expense.splitMethod === "custom" && expense.splitRatio) {
    const ratio = expense.splitRatio[yourParentId] ?? 0;
    return Math.round(expense.totalAmount * ratio);
  }

  if (expense.splitMethod === "one-parent") {
    return expense.paidBy === yourParentId ? expense.totalAmount : 0;
  }

  return 0;
}

function getStatusBadgeColor(status: Expense["paymentStatus"]): string {
  switch (status) {
    case "paid":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "unpaid":
      return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "disputed":
      return "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  }
}

function getStatusLabel(status: Expense["paymentStatus"]): string {
  const labels: Record<Expense["paymentStatus"], string> = {
    paid: "Settled",
    unpaid: "Pending",
    disputed: "Disputed",
  };
  return labels[status];
}

// ─── Component: Sidebar ────────────────────────────────────────────────────────

function ExpensesSidebar({
  childList,
  parents,
}: Readonly<{
  childList: Child[];
  parents: [Parent, Parent];
}>) {
  return (
    <aside className="w-64 bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark flex-shrink-0 flex flex-col z-20 hidden lg:flex">
      {/* Header */}
      <div className="h-16 flex items-center px-6 border-b border-border-light dark:border-border-dark">
        <div className="flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined text-3xl">family_restroom</span>
          <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            KidSchedule
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 flex-1 overflow-y-auto">
        {/* Navigation */}
        <div className="mb-8">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
            Navigation
          </h3>
          <nav className="space-y-1">
            <a
              href="/calendar"
              className="flex items-center gap-3 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">calendar_month</span>
              Calendar
            </a>
            <a
              href="/expenses"
              className="flex items-center gap-3 px-3 py-2 text-primary bg-primary/10 rounded-lg font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                account_balance_wallet
              </span>
              Expenses
            </a>
            <a
              href="/messages"
              className="flex items-center gap-3 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">chat</span>
              Messages
            </a>
            <a
              href="/vault"
              className="flex items-center gap-3 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">folder_shared</span>
              Documents
            </a>
          </nav>
        </div>

        {/* Filters */}
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
            Filters
          </h3>
          <div className="space-y-6">
            {/* Child Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Child
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked
                    className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                    disabled
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    All Children
                  </span>
                </label>
                {childList.map((child) => (
                  <label key={child.id} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                      disabled
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200">
                      {child.firstName}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Date Range Filter */}
            <div className="space-y-2">
              <label htmlFor="dateRange" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Date Range
              </label>
              <select
                id="dateRange"
                className="w-full rounded-lg border-slate-300 dark:border-slate-600 text-sm py-2 px-3 bg-white dark:bg-slate-800 focus:border-primary focus:ring-primary shadow-sm"
                disabled
              >
                <option value="thisMonth">This Month</option>
                <option value="lastMonth">Last Month</option>
                <option value="last3Months">Last 3 Months</option>
                <option value="thisYear">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {/* Paid By Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Paid By
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="radio"
                    name="payer"
                    value="anyone"
                    defaultChecked
                    className="border-slate-300 text-primary focus:ring-primary h-4 w-4"
                    disabled
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200">
                    Anyone
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="radio"
                    name="payer"
                    value="me"
                    className="border-slate-300 text-primary focus:ring-primary h-4 w-4"
                    disabled
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200">
                    Me
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="radio"
                    name="payer"
                    value="coParent"
                    className="border-slate-300 text-primary focus:ring-primary h-4 w-4"
                    disabled
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200">
                    Co-Parent
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-border-light dark:border-border-dark">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
            {parents[0].name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
              {parents[0].name}
            </p>
            <p className="text-xs text-slate-500 truncate">{parents[0].email}</p>
          </div>
          <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Component: Summary Card ───────────────────────────────────────────────────

function SummaryCard({
  title,
  amount,
  badge,
  subtitle,
  icon,
  iconColor,
}: Readonly<{
  title: string;
  amount: string;
  badge?: string;
  subtitle: string;
  icon: string;
  iconColor: string;
}>) {
  return (
    <div className="bg-surface-light dark:bg-surface-dark p-6 rounded-xl border border-border-light dark:border-border-dark shadow-sm relative overflow-hidden group">
      <div className={`absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity ${iconColor}`}>
        <span className="material-symbols-outlined text-6xl">{icon}</span>
      </div>
      <p className="text-sm font-medium text-text-muted mb-1">{title}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-slate-900 dark:text-white">{amount}</span>
        {badge && (
          <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-2">{subtitle}</p>
    </div>
  );
}

// ─── Component: Transactions Table ────────────────────────────────────────────

function TransactionsTable({
  expenses,
  currentParentId,
  page,
}: Readonly<{
  expenses: Expense[];
  currentParentId: string;
  page: number;
}>) {
  const pageSize = 5;
  const totalPages = Math.ceil(expenses.length / pageSize);
  const start = (page - 1) * pageSize;
  const paginatedExpenses = expenses.slice(start, start + pageSize);

  return (
    <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border-light dark:border-border-dark flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Recent Transactions
        </h2>
        <div className="flex items-center gap-2">
          <button
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            title="Export CSV"
            aria-label="Download expenses as CSV"
          >
            <span className="material-symbols-outlined">download</span>
          </button>
          <button
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            title="Print"
            aria-label="Print expense report"
          >
            <span className="material-symbols-outlined">print</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-6 py-4 font-semibold" scope="col">
                Date
              </th>
              <th className="px-6 py-4 font-semibold" scope="col">
                Description
              </th>
              <th className="px-6 py-4 font-semibold" scope="col">
                Category
              </th>
              <th className="px-6 py-4 font-semibold text-right" scope="col">
                Total
              </th>
              <th className="px-6 py-4 font-semibold text-center" scope="col">
                Split
              </th>
              <th className="px-6 py-4 font-semibold text-right" scope="col">
                Your Share
              </th>
              <th className="px-6 py-4 font-semibold text-center" scope="col">
                Status
              </th>
              <th className="px-6 py-4 font-semibold text-center" scope="col">
                Receipt
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light dark:divide-border-dark bg-surface-light dark:bg-surface-dark">
            {paginatedExpenses.map((exp) => {
              const yourShare = calculateYourShare(exp, currentParentId);
              const yourSharePercent =
                exp.totalAmount > 0
                  ? Math.round((yourShare / exp.totalAmount) * 100)
                  : 0;

              return (
                <tr key={exp.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                    {formatDate(exp.date)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900 dark:text-white">
                      {exp.title}
                    </div>
                    {exp.description && (
                      <div className="text-xs text-slate-500">{exp.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${CATEGORY_MAP[exp.category].bgColor} ${CATEGORY_MAP[exp.category].textColor}`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: CATEGORY_MAP[exp.category].color }}
                      />
                      {CATEGORY_MAP[exp.category].label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-900 dark:text-white font-medium">
                    {formatCurrency(exp.totalAmount)}
                  </td>
                  <td className="px-6 py-4 text-center text-slate-500">
                    {yourSharePercent} / {100 - yourSharePercent}
                  </td>
                  <td className="px-6 py-4 text-right text-emerald-600 font-bold">
                    {formatCurrency(yourShare)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(exp.paymentStatus)}`}
                    >
                      {getStatusLabel(exp.paymentStatus)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {exp.receiptUrl ? (
                      <a
                        href={exp.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-primary transition-colors"
                        aria-label={`View receipt for ${exp.title}`}
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          receipt_long
                        </span>
                      </a>
                    ) : (
                      <span className="text-slate-400 text-[20px]">−</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer with Pagination */}
      <div className="px-6 py-4 border-t border-border-light dark:border-border-dark flex items-center justify-between">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Showing <span className="font-medium text-slate-900 dark:text-white">{start + 1}</span>{" "}
          to{" "}
          <span className="font-medium text-slate-900 dark:text-white">
            {Math.min(start + pageSize, expenses.length)}
          </span>{" "}
          of{" "}
          <span className="font-medium text-slate-900 dark:text-white">
            {expenses.length}
          </span>{" "}
          results
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`p-1 rounded-md transition-colors ${
              page === 1
                ? "text-slate-400 disabled:opacity-50"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            disabled={page === 1}
            aria-label="Previous page"
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <button
            className={`p-1 rounded-md transition-colors ${
              page === totalPages
                ? "text-slate-400 disabled:opacity-50"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            disabled={page === totalPages}
            aria-label="Next page"
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page Entry Point ──────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<ExpenseSearchParams> }>) {
  // ── Auth & DB ──────────────────────────────────────────────────────────────
  const user = await requireAuth();
  const parentResult = await ensureParentExists(user.userId);
  const activeParent = parentResult.parent;

  const [dbFamily, dbParents, dbChildren, dbExpenses] = await Promise.all([
    db.families.findById(activeParent.familyId),
    db.parents.findByFamilyId(activeParent.familyId),
    db.children.findByFamilyId(activeParent.familyId),
    db.expenses.findByFamilyId(activeParent.familyId),
  ]);

  if (!dbFamily) {
    redirect("/dashboard");
  }

  // Ensure at least 2 parents for expenses rendering by adding a placeholder if needed
  const parentsForExpenses = dbParents.length < 2
    ? [
        ...dbParents,
        {
          id: "secondary-placeholder",
          userId: "secondary-placeholder",
          familyId: dbFamily.id,
          name: "Co-Parent (Pending Setup)",
          email: "secondary@placeholder.local",
          role: "secondary" as const,
          createdAt: new Date().toISOString(),
        } as DbParent,
      ]
    : dbParents;

  const mappedParents = parentsForExpenses
    .slice()
    .sort((a, b) => {
      if (a.role === "primary") return -1;
      if (b.role === "primary") return 1;
      return a.name.localeCompare(b.name);
    })
    .map(mapParent) as [Parent, Parent];

  const children = dbChildren.map(mapChild);
  const expenses = dbExpenses.map(mapExpense);

  // ── Parse Params ───────────────────────────────────────────────────────────
  const resolvedParams = await searchParams;
  const page = Math.max(1, Number(resolvedParams?.page ?? "1"));

  // ── Calculate Settlements ──────────────────────────────────────────────────
  const settlement = calculateSettlement(expenses, activeParent.id, mappedParents[1].id);
  const netDisplay = settlement.netBalance;

  // Monthly spending
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const monthlyExpenses = expenses.filter((e) => {
    const expDate = new Date(e.date + "T00:00:00Z");
    return expDate >= monthStart && expDate < monthEnd;
  });

  const monthlyTotal = monthlyExpenses.reduce((sum, e) => sum + e.totalAmount, 0);

  // Sort by date descending
  const sortedExpenses = [...expenses].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="h-screen flex overflow-hidden bg-background-light dark:bg-background-dark">
      {/* Sidebar */}
      <ExpensesSidebar childList={children} parents={mappedParents} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background-light dark:bg-background-dark overflow-hidden">
        {/* Header */}
        <header className="bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark h-16 flex items-center justify-between px-4 sm:px-8 shadow-sm z-10">
          <div className="flex items-center gap-4 lg:hidden">
            <button
              className="text-slate-500 hover:text-slate-700"
              aria-label="Open sidebar menu"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <div className="flex items-center gap-2 text-primary">
              <span className="material-symbols-outlined text-2xl">family_restroom</span>
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                KidSchedule
              </span>
            </div>
          </div>

          <h1 className="text-xl font-bold text-slate-900 dark:text-white hidden lg:block">
            Expenses &amp; Settlement
          </h1>

          <div className="flex items-center gap-3">
            <SettleBalanceButton />
            <Link
              href="/expenses/add"
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:opacity-90 shadow-sm transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              <span className="hidden sm:inline">Add Expense</span>
              <span className="sm:hidden">Add</span>
            </Link>
            <ThemeToggle />
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              <SummaryCard
                title="Total Owed to You"
                amount={formatCurrency(Math.max(0, netDisplay))}
                badge="+12% vs last month"
                subtitle={`Pending approval: ${formatCurrency(expenses.filter((e) => e.paymentStatus === "unpaid").reduce((sum, e) => sum + calculateYourShare(e, activeParent.id), 0))}`}
                icon="arrow_circle_up"
                iconColor="text-green-500"
              />
              <SummaryCard
                title="Total You Owe"
                amount={formatCurrency(Math.max(0, -netDisplay))}
                subtitle={`Next settlement due: ${new Date(now.getFullYear(), now.getMonth() + 1, 30).toLocaleDateString()}`}
                icon="arrow_circle_down"
                iconColor="text-red-500"
              />
              <SummaryCard
                title={`Family Spending (${now.toLocaleDateString([], { month: "short" })})`}
                amount={formatCurrency(monthlyTotal)}
                subtitle={
                  monthlyExpenses.length > 0
                    ? `Top category: Medical ($520)`
                    : "No expenses this month"
                }
                icon="shopping_bag"
                iconColor="text-primary"
              />
            </div>

            {/* Transactions Table */}
            <TransactionsTable
              expenses={sortedExpenses}
              currentParentId={activeParent.id}
              page={page}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
