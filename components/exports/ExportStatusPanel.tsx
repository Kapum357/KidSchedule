"use client";

/**
 * ExportStatusPanel
 *
 * Polls /api/exports/:id for status updates.
 * Shows progress, error, download link, and verification link when ready.
 */

import { useEffect, useState, useRef } from "react";

type ExportStatus = "queued" | "processing" | "complete" | "failed";

interface ExportJobData {
  id: string;
  type: string;
  status: ExportStatus;
  resultUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

interface ExportStatusPanelProps {
  jobId: string;
  onDismiss?: () => void;
}

const STATUS_LABELS: Record<ExportStatus, string> = {
  queued: "Queued",
  processing: "Processing…",
  complete: "Ready",
  failed: "Failed",
};

const STATUS_ICONS: Record<ExportStatus, string> = {
  queued: "schedule",
  processing: "progress_activity",
  complete: "check_circle",
  failed: "error",
};

const STATUS_COLORS: Record<ExportStatus, string> = {
  queued: "text-slate-500",
  processing: "text-blue-600",
  complete: "text-emerald-600",
  failed: "text-red-600",
};

export default function ExportStatusPanel({
  jobId,
  onDismiss,
}: ExportStatusPanelProps) {
  const [job, setJob] = useState<ExportJobData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch(`/api/exports/${jobId}`);
        if (!res.ok) {
          if (active) setError("Failed to load export status");
          return;
        }
        const data: ExportJobData = await res.json();
        if (active) setJob(data);

        // Stop polling once terminal state reached
        if (data.status === "complete" || data.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        if (active) setError("Network error");
      }
    }

    // Poll: fast initially (3s for first 30s), then slow (10s)
    poll();
    intervalRef.current = setInterval(() => {
      pollCountRef.current++;
      const interval = pollCountRef.current < 10 ? 3000 : 10000;
      if (pollCountRef.current === 10 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = setInterval(poll, 10000);
      }
      poll();
    }, 3000);

    return () => {
      active = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId]);

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        <span className="material-symbols-outlined text-base">error</span>
        {error}
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span className="material-symbols-outlined animate-spin text-base">
          progress_activity
        </span>
        Loading export status…
      </div>
    );
  }

  const statusColor = STATUS_COLORS[job.status];
  const statusIcon = STATUS_ICONS[job.status];
  const isTerminal = job.status === "complete" || job.status === "failed";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`material-symbols-outlined ${statusColor} ${
            job.status === "processing" ? "animate-spin" : ""
          } text-xl`}
        >
          {statusIcon}
        </span>
        <div className="flex-1">
          <div className="text-sm font-medium text-slate-800">
            {job.type
              .replace(/-/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase())}
          </div>
          <div className={`text-xs ${statusColor} font-medium`}>
            {STATUS_LABELS[job.status]}
          </div>
        </div>
        {onDismiss && isTerminal && (
          <button
            onClick={onDismiss}
            className="text-slate-300 hover:text-slate-500"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        )}
      </div>

      {/* Complete: download + verify */}
      {job.status === "complete" && job.resultUrl && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <a
              href={job.resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              Download
              {job.sizeBytes ? ` (${formatBytes(job.sizeBytes)})` : ""}
            </a>
            <a
              href={`/exports/${job.id}/verify`}
              className="flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <span className="material-symbols-outlined text-sm">verified</span>
              Verify
            </a>
          </div>
          {job.completedAt && (
            <p className="text-xs text-slate-400">
              Generated {new Date(job.completedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Failed: error message */}
      {job.status === "failed" && job.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {job.error}
        </div>
      )}

      {/* Processing: progress bar animation */}
      {job.status === "processing" && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full animate-pulse rounded-full bg-blue-400" />
        </div>
      )}
    </div>
  );
}
