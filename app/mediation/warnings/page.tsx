/**
 * KidSchedule – Mediation Warnings History
 *
 * Displays all warnings (dismissed, sent, active) across the family's
 * mediation history. Allows filtering by status, severity, and date range.
 */

import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib/auth";
import Link from "next/link";
import type { DbMediationWarning } from "@/lib/persistence/types";
import { logEvent } from "@/lib/observability/logger";
import { Metadata } from "next";

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Load all warnings from database for a family
 */
async function loadAllWarnings(familyId: string): Promise<DbMediationWarning[]> {
  return await db.mediationWarnings.findByFamilyId(familyId);
}

/**
 * Get warning category display label
 */
function getWarningCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    aggressive_capitalization: "Aggressive Capitalization",
    emotional_intensity: "Emotional Intensity",
    hostile_language: "Hostile Language",
    sensitive_topic_escalation: "Topic Escalation",
    delayed_response: "Late Night Comms",
    accusatory_language: "Accusatory Language",
    threat_language: "Threat Language",
    personal_attack: "Personal Attack",
  };
  return labels[category] || category;
}

/**
 * Get severity color classes
 */
function getSeverityColor(severity: string): string {
  switch (severity) {
    case "high":
      return "bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 text-red-900 dark:text-red-200";
    case "medium":
      return "bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 text-amber-900 dark:text-amber-200";
    case "low":
      return "bg-slate-50 dark:bg-slate-800 border-l-4 border-slate-400 text-slate-900 dark:text-slate-100";
    default:
      return "bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100";
  }
}

/**
 * Format date for display
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Warnings History | Mediation",
  description: "View all communication warnings and their resolution status",
};

// ─── Page Component ───────────────────────────────────────────────────────────

export default async function WarningsHistoryPage() {
  const user = await requireAuth();
  const parent = await db.parents.findByUserId(user.userId);

  if (!parent) {
    throw new Error("Parent profile not found");
  }

  // Get all warnings for the family
  const allWarnings = await loadAllWarnings(parent.familyId);

  // Separate active vs dismissed
  const activeWarnings = allWarnings.filter((w) => !w.dismissed);
  const dismissedWarnings = allWarnings.filter((w) => w.dismissed);

  // Sort by date (newest first)
  const sortByDate = (a: DbMediationWarning, b: DbMediationWarning) =>
    new Date(b.flaggedAt).getTime() - new Date(a.flaggedAt).getTime();
  activeWarnings.sort(sortByDate);
  dismissedWarnings.sort(sortByDate);

  logEvent("info", "warnings_history_viewed", {
    familyId: parent.familyId,
    userId: user.userId,
    activeCount: activeWarnings.length,
    dismissedCount: dismissedWarnings.length,
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/mediation"
            className="text-primary hover:text-primary/80 text-sm font-medium mb-4 inline-block"
          >
            ← Back to Mediation Center
          </Link>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Warnings History
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Track all communication warnings and their resolution status
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-lg">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {activeWarnings.length}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Active Warnings
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-lg">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {dismissedWarnings.length}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Dismissed Warnings
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-lg">
            <div className="text-2xl font-bold text-primary">
              {allWarnings.length}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Total Warnings
            </div>
          </div>
        </div>

        {/* Active Warnings Section */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Active Warnings ({activeWarnings.length})
          </h2>
          {activeWarnings.length === 0 ? (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-6 rounded-lg text-center">
              <p className="text-emerald-900 dark:text-emerald-200 font-medium">
                No active warnings! Communication is healthy.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeWarnings.map((warning) => (
                <div
                  key={warning.id}
                  className={`p-4 rounded-lg border ${getSeverityColor(warning.severity)}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold">
                        {getWarningCategoryLabel(warning.category)}
                      </h3>
                      <p className="text-sm mt-1">{warning.title}</p>
                    </div>
                    <span className="text-xs font-medium px-2 py-1 bg-white/30 rounded">
                      {warning.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm opacity-90 mb-2">{warning.description}</p>
                  <p className="text-xs opacity-75">
                    Flagged: {formatDate(warning.flaggedAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Dismissed Warnings Section */}
        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Dismissed Warnings ({dismissedWarnings.length})
          </h2>
          {dismissedWarnings.length === 0 ? (
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-lg text-center">
              <p className="text-slate-600 dark:text-slate-400">
                No dismissed warnings yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {dismissedWarnings.map((warning) => (
                <div
                  key={warning.id}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-lg opacity-75"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-slate-100">
                        {getWarningCategoryLabel(warning.category)}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {warning.title}
                      </p>
                    </div>
                    <span className="text-xs font-medium px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded">
                      DISMISSED
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                    {warning.description}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500">
                    Flagged: {formatDate(warning.flaggedAt)}
                    {warning.dismissedAt && ` • Dismissed: ${formatDate(warning.dismissedAt)}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
