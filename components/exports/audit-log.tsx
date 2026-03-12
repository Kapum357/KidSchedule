"use client";

/**
 * AuditLog
 *
 * Displays a table of verification attempts for an export.
 * Shows date, IP address (masked), status, method, and user agent.
 * Includes export to CSV functionality.
 */

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast-notification";

interface AuditLogEntry {
  id: string;
  verifiedAt: string;
  ipAddress?: string;
  verificationStatus: string;
  isValid: boolean;
  userAgent?: string;
}

interface AuditLogProps {
  exportId: string;
  metadataId: string;
}

function maskIpAddress(ip?: string): string {
  if (!ip) return "Unknown";
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }
  return ip;
}

function getBrowserName(userAgent?: string): string {
  if (!userAgent) return "Unknown";

  if (userAgent.includes("Chrome")) return "Chrome";
  if (userAgent.includes("Safari") && !userAgent.includes("Chrome"))
    return "Safari";
  if (userAgent.includes("Firefox")) return "Firefox";
  if (userAgent.includes("Edge")) return "Edge";
  if (userAgent.includes("Opera")) return "Opera";

  return "Browser";
}

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return "Unknown";
  }
}

export default function AuditLog({ exportId, metadataId }: AuditLogProps) {
  const { add: addToast } = useToast();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch audit log on mount
  useEffect(() => {
    fetchAuditLog();
  }, [metadataId]);

  async function fetchAuditLog() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/exports/${exportId}/audit-log`);

      if (!response.ok) {
        throw new Error("Failed to fetch audit log");
      }

      const data = (await response.json()) as AuditLogEntry[];
      setEntries(data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      addToast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleExportCsv() {
    if (entries.length === 0) {
      addToast("No entries to export", "info");
      return;
    }

    try {
      const headers = ["Date", "IP Address", "Status", "Browser"];
      const rows = entries.map((entry) => [
        formatDate(entry.verifiedAt),
        maskIpAddress(entry.ipAddress),
        entry.isValid ? "Verified" : "Failed",
        getBrowserName(entry.userAgent),
      ]);

      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(","))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${exportId}-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      addToast("Audit log exported successfully", "success");
    } catch (err) {
      addToast("Failed to export audit log", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="material-symbols-outlined animate-spin text-slate-400">
          progress_activity
        </span>
        <p className="ml-2 text-sm text-slate-600 dark:text-slate-400">
          Loading audit log...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-900">
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No verification attempts recorded yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Export Button */}
      <div className="flex justify-end">
        <button
          onClick={handleExportCsv}
          className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <span className="material-symbols-outlined text-sm">download</span>
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-900 dark:text-white">
                Date
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-900 dark:text-white">
                IP Address
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-900 dark:text-white">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-900 dark:text-white">
                Browser
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {entries.map((entry, idx) => (
              <tr
                key={entry.id}
                className={
                  idx % 2 === 0
                    ? "bg-white dark:bg-slate-900"
                    : "bg-slate-50 dark:bg-slate-800"
                }
              >
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {formatDate(entry.verifiedAt)}
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {maskIpAddress(entry.ipAddress)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`material-symbols-outlined text-sm ${
                        entry.isValid
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {entry.isValid ? "check_circle" : "cancel"}
                    </span>
                    <span
                      className={
                        entry.isValid
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-red-700 dark:text-red-300"
                      }
                    >
                      {entry.isValid ? "Verified" : "Failed"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {getBrowserName(entry.userAgent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer info */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Showing {entries.length} verification{" "}
        {entries.length === 1 ? "attempt" : "attempts"}
      </p>
    </div>
  );
}
