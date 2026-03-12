"use client";

/**
 * VerificationStatusPanel
 *
 * Displays the verification status of an export:
 * - Overall status (Verified/Not Verified)
 * - PDF hash match status
 * - Message chain validity
 * - Last verified timestamp
 * - Share and Download buttons
 */

import { useState } from "react";
import ShareModal from "./share-modal";

interface VerificationStatusPanelProps {
  exportId: string;
  verified: boolean;
  pdfHashMatch?: boolean;
  chainValid?: boolean;
  verifiedAt?: string | null;
}

function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return "Never";
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return "Unknown";
  }
}

export default function VerificationStatusPanel({
  exportId,
  verified,
  pdfHashMatch = false,
  chainValid = false,
  verifiedAt,
}: VerificationStatusPanelProps) {
  const [shareModalOpen, setShareModalOpen] = useState(false);

  return (
    <>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {/* Overall Status */}
        <div className="mb-6 flex items-center gap-3">
          {verified ? (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
                <span className="material-symbols-outlined text-xl text-emerald-600 dark:text-emerald-400">
                  verified
                </span>
              </div>
              <div>
                <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                  Verified
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  This export has been verified and is authentic.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
                <span className="material-symbols-outlined text-xl text-red-600 dark:text-red-400">
                  error
                </span>
              </div>
              <div>
                <div className="text-lg font-semibold text-red-700 dark:text-red-300">
                  Not Verified
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  This export could not be verified.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Details Section */}
        <div className="mb-6 space-y-3 border-t border-slate-200 pt-6 dark:border-slate-700">
          <h3 className="font-medium text-slate-900 dark:text-white">
            Verification Details
          </h3>

          {/* PDF Hash */}
          <div className="flex items-center justify-between rounded-md bg-slate-50 px-4 py-3 dark:bg-slate-800">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-slate-600 dark:text-slate-400">
                {pdfHashMatch ? "check_circle" : "cancel"}
              </span>
              <span className="text-sm text-slate-700 dark:text-slate-300">
                PDF Hash
              </span>
            </div>
            <span
              className={`text-sm font-medium ${
                pdfHashMatch
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {pdfHashMatch ? "Match" : "Mismatch"}
            </span>
          </div>

          {/* Message Chain */}
          <div className="flex items-center justify-between rounded-md bg-slate-50 px-4 py-3 dark:bg-slate-800">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-slate-600 dark:text-slate-400">
                {chainValid ? "check_circle" : "cancel"}
              </span>
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Message Chain
              </span>
            </div>
            <span
              className={`text-sm font-medium ${
                chainValid
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {chainValid ? "Valid" : "Invalid"}
            </span>
          </div>
        </div>

        {/* Last Verified */}
        <div className="mb-6 border-t border-slate-200 pt-4 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Last verified: {formatDate(verifiedAt)}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => setShareModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
          >
            <span className="material-symbols-outlined text-sm">share</span>
            Share
          </button>
          <a
            href={`/exports/${exportId}/verify/audit-log`}
            className="flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Download Audit Log
          </a>
        </div>
      </div>

      {/* Share Modal */}
      {shareModalOpen && (
        <ShareModal
          exportId={exportId}
          onClose={() => setShareModalOpen(false)}
        />
      )}
    </>
  );
}
