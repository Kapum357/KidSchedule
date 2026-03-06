"use client";

/**
 * ExportModal
 *
 * Form to select export type and date range, submits to POST /api/exports.
 * Calls back with jobId on success so parent can poll status.
 */

import { useState } from "react";

type ExportType =
  | "custody-compliance-pdf"
  | "message-transcript-pdf"
  | "communication-report"
  | "messages-csv";

const EXPORT_OPTIONS: { value: ExportType; label: string; description: string }[] = [
  {
    value: "custody-compliance-pdf",
    label: "Custody Compliance Report",
    description: "Court-ready PDF with compliance analysis and hash verification",
  },
  {
    value: "communication-report",
    label: "Communication Report",
    description: "Full tone analysis, mediation signals, and message history",
  },
  {
    value: "message-transcript-pdf",
    label: "Message Transcript",
    description: "Verified PDF transcript of all messages with SHA-256 chain",
  },
  {
    value: "messages-csv",
    label: "Messages CSV",
    description: "Raw message data export for spreadsheet analysis",
  },
];

interface ExportModalProps {
  onClose: () => void;
  onQueued: (jobId: string) => void;
  defaultType?: ExportType;
}

export default function ExportModal({
  onClose,
  onQueued,
  defaultType = "custody-compliance-pdf",
}: ExportModalProps) {
  const [type, setType] = useState<ExportType>(defaultType);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!startDate || !endDate) {
      setError("Both start and end dates are required");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError("Start date must be before end date");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, params: { startDate, endDate } }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to queue export");
        return;
      }
      onQueued(data.id);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">New Export</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Export type */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Export type
            </label>
            {EXPORT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  type === opt.value
                    ? "border-slate-800 bg-slate-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={opt.value}
                  checked={type === opt.value}
                  onChange={() => setType(opt.value)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    {opt.label}
                  </div>
                  <div className="text-xs text-slate-500">{opt.description}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Start date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                End date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-slate-700"
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin text-sm">
                  progress_activity
                </span>
              ) : (
                <span className="material-symbols-outlined text-sm">
                  download
                </span>
              )}
              {loading ? "Queuing…" : "Queue export"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
