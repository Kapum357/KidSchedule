"use client";

/**
 * HashVerificationPanel
 *
 * Displays the integrity status of a court-ready PDF export.
 * Shows chain verification, tamper detection, and audit history.
 */

import { useState, useCallback } from "react";

interface VerificationResult {
  exportId: string;
  isValid: boolean;
  integrityStatus: "valid" | "tampered" | "incomplete" | "unknown";
  pdfHashMatch: boolean;
  messageChainValid: boolean;
  tamperDetectedAtIndex?: number;
  messagesVerified: number;
  errorsDetected: string[];
  verifiedAt: string;
}

interface HashVerificationPanelProps {
  exportId: string;
  exportName?: string;
}

export default function HashVerificationPanel({
  exportId,
  exportName = "Export",
}: HashVerificationPanelProps) {
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runVerification = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/exports/${exportId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (!res.ok && res.status !== 422) {
        setError(data.error || "Verification failed");
        return;
      }

      setResult(data as VerificationResult);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [exportId]);

  const loadLastResult = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/exports/${exportId}/verify`);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          setError("No previous verification found. Run verification first.");
        } else {
          setError(data.error || "Failed to load verification");
        }
        return;
      }

      setResult(data as VerificationResult);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [exportId]);

  const statusConfig = result
    ? {
        valid: {
          color: "text-emerald-700",
          bg: "bg-emerald-50",
          border: "border-emerald-200",
          icon: "verified",
          label: "Chain Intact",
        },
        tampered: {
          color: "text-red-700",
          bg: "bg-red-50",
          border: "border-red-200",
          icon: "gpp_bad",
          label: "Tampering Detected",
        },
        incomplete: {
          color: "text-amber-700",
          bg: "bg-amber-50",
          border: "border-amber-200",
          icon: "warning",
          label: "Incomplete Data",
        },
        unknown: {
          color: "text-slate-600",
          bg: "bg-slate-50",
          border: "border-slate-200",
          icon: "help",
          label: "Unknown",
        },
      }[result.integrityStatus]
    : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-slate-500">
          security
        </span>
        <h3 className="font-semibold text-slate-800">Hash Chain Verification</h3>
        <span className="ml-auto text-xs text-slate-400">{exportName}</span>
      </div>

      {/* Action buttons */}
      {!result && !loading && (
        <div className="mb-4 flex gap-2">
          <button
            onClick={runVerification}
            className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
          >
            <span className="material-symbols-outlined text-sm">
              fact_check
            </span>
            Verify Now
          </button>
          <button
            onClick={loadLastResult}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <span className="material-symbols-outlined text-sm">history</span>
            Last Result
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="material-symbols-outlined animate-spin text-base">
            progress_activity
          </span>
          Verifying hash chain…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="material-symbols-outlined mt-0.5 text-base">
            error
          </span>
          {error}
        </div>
      )}

      {/* Verification result */}
      {result && statusConfig && (
        <div
          className={`rounded-lg border ${statusConfig.border} ${statusConfig.bg} p-4`}
        >
          {/* Status header */}
          <div className="mb-3 flex items-center gap-2">
            <span
              className={`material-symbols-outlined ${statusConfig.color} text-2xl`}
            >
              {statusConfig.icon}
            </span>
            <div>
              <div className={`font-semibold ${statusConfig.color}`}>
                {statusConfig.label}
              </div>
              <div className="text-xs text-slate-500">
                Verified {new Date(result.verifiedAt).toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => { setResult(null); setError(null); }}
              className="ml-auto text-slate-400 hover:text-slate-600"
              title="Re-verify"
            >
              <span className="material-symbols-outlined text-base">
                refresh
              </span>
            </button>
          </div>

          {/* Stats grid */}
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <Stat
              icon="link"
              label="Messages verified"
              value={String(result.messagesVerified)}
              ok={result.messageChainValid}
            />
            <Stat
              icon="fingerprint"
              label="PDF hash"
              value={result.pdfHashMatch ? "Match" : "No match"}
              ok={result.pdfHashMatch}
            />
          </div>

          {/* Tamper detail */}
          {result.integrityStatus === "tampered" &&
            result.tamperDetectedAtIndex !== undefined && (
              <div className="mb-3 rounded border border-red-300 bg-red-100 px-3 py-2 text-xs text-red-800">
                <strong>Tamper detected at message #{result.tamperDetectedAtIndex}</strong>
                <br />
                The hash chain is broken — a message may have been modified,
                inserted, or deleted after the document was sealed.
              </div>
            )}

          {/* Errors */}
          {result.errorsDetected.length > 0 && (
            <ul className="space-y-1 text-xs text-red-700">
              {result.errorsDetected.map((err, i) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="material-symbols-outlined mt-0.5 text-xs">
                    error_outline
                  </span>
                  {err}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Footer note */}
      <p className="mt-3 text-xs text-slate-400">
        Each message is sealed with SHA-256 and linked in a tamper-evident
        chain. Any modification after sealing will break the chain.
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  ok,
}: {
  icon: string;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1.5">
      <span
        className={`material-symbols-outlined text-base ${ok ? "text-emerald-500" : "text-red-500"}`}
      >
        {icon}
      </span>
      <div>
        <div className="text-[10px] text-slate-400">{label}</div>
        <div className="text-xs font-medium text-slate-700">{value}</div>
      </div>
    </div>
  );
}
