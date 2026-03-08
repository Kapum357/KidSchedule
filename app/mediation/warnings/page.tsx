/**
 * KidSchedule – Mediation Warnings History
 *
 * Server component displaying dismissed conflict warnings with filtering by date range,
 * severity level, and category. Provides visibility into communication health patterns
 * and allows families to review past warning triggers.
 *
 */

import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib";
import { redirect } from "next/navigation";
import type { DbMediationWarning } from "@/lib/persistence/types";
import { logEvent } from "@/lib/observability/logger";
import { Metadata } from "next";

// ─── Types ────────────────────────────────────────────────────────────────────

type WarningsSearchParams = {
  days?: string;
  severity?: string;
  category?: string;
};

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Load warnings history from database with optional filters
 */
async function loadWarningsHistory(
  familyId: string,
  filters: {
    days?: number;
    severity?: string;
    category?: string;
  }
): Promise<DbMediationWarning[]> {
  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();

  const daysBack = filters.days || 30;
  startDate.setDate(startDate.getDate() - daysBack);

  // Fetch warnings for date range
  const warnings = await db.mediationWarnings.findByFamilyIdAndDateRange(
    familyId,
    startDate.toISOString(),
    endDate.toISOString()
  );

  // Filter to only dismissed warnings
  let filtered = warnings.filter((w) => w.dismissed);

  // Apply severity filter if specified
  if (filters.severity) {
    filtered = filtered.filter((w) => w.severity === filters.severity);
  }

  // Apply category filter if specified
  if (filters.category) {
    filtered = filtered.filter((w) => w.category === filters.category);
  }

  // Sort by dismissal date (most recent first)
  filtered.sort(
    (a, b) =>
      new Date(b.dismissedAt || b.flaggedAt).getTime() -
      new Date(a.dismissedAt || a.flaggedAt).getTime()
  );

  return filtered;
}

/**
 * Color classes for severity badges
 */
const severityColors: Record<string, { bg: string; text: string; border: string }> = {
  high: {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-800 dark:text-red-200",
    border: "border-l-4 border-red-500",
  },
  medium: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-800 dark:text-amber-200",
    border: "border-l-4 border-amber-500",
  },
  low: {
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-800 dark:text-slate-200",
    border: "border-l-4 border-slate-400",
  },
};

/**
 * Format category name for display
 */
function formatCategoryName(category: string): string {
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Format date for display
 */
function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Warning History | Mediation",
  description: "View historical warning signals and resolutions",
};

// ─── Page Component ───────────────────────────────────────────────────────────

export default async function WarningsHistoryPage({
  searchParams,
}: {
  searchParams: WarningsSearchParams;
}) {
  // ─── Auth & Access Control ────────────────────────────────────────────────

  const user = await requireAuth();

  // Load parent to verify access
  const parent = await db.parents.findByUserId(user.userId);
  if (!parent) {
    redirect("/auth/login");
  }

  // Load family
  const family = await db.families.findById(parent.familyId);
  if (!family) {
    redirect("/dashboard");
  }

  // ─── Parse Filters ────────────────────────────────────────────────────────

  const daysFilter = searchParams.days ? parseInt(searchParams.days, 10) : 30;
  const severityFilter = searchParams.severity || undefined;
  const categoryFilter = searchParams.category || undefined;

  // ─── Load Data ────────────────────────────────────────────────────────────

  const warnings = await loadWarningsHistory(family.id, {
    days: daysFilter,
    severity: severityFilter,
    category: categoryFilter,
  });

  // ─── Logging ──────────────────────────────────────────────────────────────

  logEvent("info", "mediation.warnings_history_viewed", {
    familyId: family.id,
    userId: user.userId,
    warningCount: warnings.length,
    filters: {
      days: daysFilter,
      severity: severityFilter,
      category: categoryFilter,
    },
  });

  // ─── Get unique categories for filter dropdown ────────────────────────────

  const allWarnings = await db.mediationWarnings.findByFamilyIdAndDateRange(
    family.id,
    new Date(0).toISOString(),
    new Date().toISOString()
  );
  const uniqueCategories = Array.from(
    new Set(allWarnings.filter((w) => w.dismissed).map((w) => w.category))
  ).sort();

  // ─── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Communication Warnings History
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Review warnings about communication patterns that may need attention.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 mb-8 border border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Filters
          </h2>
          <form className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Date Range Filter */}
            <div>
              <label htmlFor="days" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Time Period
              </label>
              <select
                id="days"
                name="days"
                defaultValue={daysFilter.toString()}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="180">Last 180 days</option>
                <option value="365">Last year</option>
              </select>
            </div>

            {/* Severity Filter */}
            <div>
              <label htmlFor="severity" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Severity
              </label>
              <select
                id="severity"
                name="severity"
                defaultValue={severityFilter || ""}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">All Levels</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Category
              </label>
              <select
                id="category"
                name="category"
                defaultValue={categoryFilter || ""}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">All Categories</option>
                {uniqueCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {formatCategoryName(cat)}
                  </option>
                ))}
              </select>
            </div>

            {/* Apply Button */}
            <div className="md:col-span-3 flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 dark:hover:bg-primary/80 transition-colors font-medium"
              >
                Apply Filters
              </button>
              <a
                href="/mediation/warnings"
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors font-medium"
              >
                Clear
              </a>
            </div>
          </form>
        </div>

        {/* Warnings List */}
        {warnings.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
            <div className="text-slate-500 dark:text-slate-400 mb-2">
              <span className="material-symbols-outlined text-4xl opacity-40 block mb-2">
                check_circle
              </span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              No warnings found
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              Great! There are no communication warnings in the selected time period.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {warnings.map((warning) => {
              const colors = severityColors[warning.severity as keyof typeof severityColors];
              return (
                <div
                  key={warning.id}
                  className={`rounded-lg p-6 ${colors.bg} ${colors.border} border-l-4 border-l-slate-400 dark:border-l-slate-600 transition-all hover:shadow-md dark:hover:shadow-lg`}
                >
                  {/* Header with Title and Severity */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <h3 className={`text-lg font-semibold ${colors.text}`}>
                        {warning.title}
                      </h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className={`inline-block px-2.5 py-1 rounded text-xs font-semibold ${colors.bg} ${colors.text}`}>
                          {warning.severity.charAt(0).toUpperCase() +
                            warning.severity.slice(1)}{" "}
                          Severity
                        </span>
                        <span className="inline-block px-2.5 py-1 rounded text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-200">
                          {formatCategoryName(warning.category)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-slate-700 dark:text-slate-300 mb-3">
                    {warning.description}
                  </p>

                  {/* Excerpt */}
                  {warning.excerpt && (
                    <div className="bg-slate-200/50 dark:bg-slate-800/50 rounded p-3 mb-3 border-l-2 border-slate-400 dark:border-slate-600">
                      <p className="text-sm text-slate-700 dark:text-slate-300 italic">
                        &ldquo;{warning.excerpt}&rdquo;
                      </p>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <div>
                      <span className="font-medium">Dismissed:</span>{" "}
                      {formatDate(warning.dismissedAt || warning.flaggedAt)}
                    </div>
                    <div>
                      <span className="font-medium">Flagged:</span>{" "}
                      {formatDate(warning.flaggedAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Results Count */}
        {warnings.length > 0 && (
          <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
            Showing {warnings.length}{" "}
            {warnings.length === 1 ? "warning" : "warnings"}
          </div>
        )}
      </div>
    </div>
  );
}
