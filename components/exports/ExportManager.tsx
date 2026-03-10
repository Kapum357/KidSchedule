/**
 * Export Manager Component
 *
 * Main UI for managing exports - trigger new exports, view history, download results
 */

"use client";

import { useState, useEffect } from "react";
import type { ExportType, ExportJobRecord } from " @/lib";
import { ExportCard } from "./ExportCard";

export function ExportManager() {
  const [exports, setExports] = useState<ExportJobRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);

  const exportOptions: Array<{ type: ExportType; label: string; description: string }> = [
    {
      type: "schedule-pdf",
      label: "Schedule PDF",
      description: "Export family calendar and schedules",
    },
    {
      type: "invoices-pdf",
      label: "Invoices PDF",
      description: "Export billing and expense records",
    },
    {
      type: "messages-csv",
      label: "Messages CSV",
      description: "Export message history as spreadsheet",
    },
    {
      type: "moments-archive",
      label: "Moments Archive",
      description: "Export photos and moments collection",
    },
  ];

  // Load exports on mount
  useEffect(() => {
    loadExports();
  }, []);

  const loadExports = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/exports");
      if (!response.ok) throw new Error("Failed to load exports");
      const data = await response.json();
      setExports(data.exports);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load exports";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerExport = async (type: ExportType) => {
    setIsTriggering(true);
    setError(null);
    try {
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to trigger export");
      }

      const newExport = await response.json();
      setExports([newExport, ...exports]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      setError(message);
    } finally {
      setIsTriggering(false);
    }
  };

  const getActiveExports = () =>
    exports.filter((exp) => exp.status === "queued" || exp.status === "processing");

  const getCompletedExports = () =>
    exports.filter((exp) => exp.status === "complete" || exp.status === "failed");

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div>
        <h1 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">Exports</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Generate and download reports of your family data
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Export options */}
      <div className="space-y-3">
        <h2 className="font-semibold text-slate-900 dark:text-white">Create New Export</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {exportOptions.map((option) => (
            <button
              key={option.type}
              onClick={() => triggerExport(option.type)}
              disabled={isTriggering || isLoading}
              className="rounded-lg border border-slate-300 bg-white p-3 text-left hover:border-primary hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {option.label}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {option.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Active exports */}
      {getActiveExports().length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-slate-900 dark:text-white">In Progress</h2>
          <div className="space-y-3">
            {getActiveExports().map((exp) => (
              <ExportCard key={exp.id} job={exp} onRefresh={loadExports} />
            ))}
          </div>
        </div>
      )}

      {/* Completed exports */}
      {getCompletedExports().length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-slate-900 dark:text-white">History</h2>
          <div className="space-y-3">
            {getCompletedExports().map((exp) => (
              <ExportCard key={exp.id} job={exp} onRefresh={loadExports} />
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="text-center text-slate-500 dark:text-slate-400">
          Loading exports...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && exports.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-slate-600 dark:text-slate-400">
            No exports yet. Create your first export to get started!
          </p>
        </div>
      )}
    </div>
  );
}
