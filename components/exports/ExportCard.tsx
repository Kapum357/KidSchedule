/**
 * Export Card Component
 *
 * Displays status of a single export job with download link when complete
 */

"use client";

import { useState } from "react";
import type { ExportJobRecord } from " @/lib";

interface ExportCardProps {
  job: ExportJobRecord;
  onRefresh?: () => void;
}

export function ExportCard({ job, onRefresh }: ExportCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const typeLabel: Record<string, string> = {
    "schedule-pdf": "Schedule PDF",
    "invoices-pdf": "Invoices PDF",
    "messages-csv": "Messages CSV",
    "moments-archive": "Moments Archive",
  };

  const statusColor: Record<string, string> = {
    queued: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
    processing: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
    complete: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
    failed: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300",
  };

  const handleDownload = async () => {
    if (!job.resultUrl) return;

    setIsDownloading(true);
    try {
      // Create a temporary anchor element and trigger download
      const link = document.createElement("a");
      link.href = job.resultUrl;
      link.download = `export-${job.type}-${new Date().getTime()}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("[ExportCard] Download failed:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">
            {typeLabel[job.type] || job.type}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {formatDate(job.createdAt)}
          </p>
        </div>
        <span
          className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
            statusColor[job.status] || "bg-slate-100 text-slate-700"
          }`}
        >
          {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
        </span>
      </div>

      {job.status === "processing" && (
        <div className="mb-3">
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-2 rounded-full bg-blue-500 animate-pulse w-1/3"></div>
          </div>
        </div>
      )}

      {job.status === "complete" && (
        <div className="mb-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
          <p>
            Completed: <span className="font-mono">{formatDate(job.completedAt!)}</span>
          </p>
          {job.sizeBytes && <p>Size: {formatSize(job.sizeBytes)}</p>}
        </div>
      )}

      {job.status === "failed" && job.error && (
        <div className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
          <p className="font-semibold">Error</p>
          <p className="mt-1 break-words">{job.error}</p>
          {job.retryCount < 3 && (
            <p className="mt-1 text-xs">
              Will retry (attempt {job.retryCount} of 3)
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {job.status === "complete" && job.resultUrl && (
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {isDownloading ? "Downloading..." : "Download"}
          </button>
        )}
        {job.status === "failed" && job.retryCount < 3 && (
          <button
            onClick={onRefresh}
            className="flex-1 rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/40"
          >
            Retry
          </button>
        )}
        <button
          onClick={onRefresh}
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
