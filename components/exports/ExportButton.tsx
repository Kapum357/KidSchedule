"use client";

/**
 * ExportButton
 *
 * Drop-in button that opens ExportModal and then tracks the queued job
 * via ExportStatusPanel. Used on report and mediation pages.
 */

import { useState } from "react";
import ExportModal from "./ExportModal";
import ExportStatusPanel from "./ExportStatusPanel";

type ExportType =
  | "custody-compliance-pdf"
  | "message-transcript-pdf"
  | "communication-report"
  | "messages-csv";

interface ExportButtonProps {
  defaultType?: ExportType;
  label?: string;
  className?: string;
}

export default function ExportButton({
  defaultType = "custody-compliance-pdf",
  label = "Export",
  className = "",
}: ExportButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeJobIds, setActiveJobIds] = useState<string[]>([]);

  function handleQueued(jobId: string) {
    setModalOpen(false);
    setActiveJobIds((prev) => [...prev, jobId]);
  }

  function handleDismiss(jobId: string) {
    setActiveJobIds((prev) => prev.filter((id) => id !== jobId));
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className={`flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50 ${className}`}
      >
        <span className="material-symbols-outlined text-base">download</span>
        {label}
      </button>

      {modalOpen && (
        <ExportModal
          defaultType={defaultType}
          onClose={() => setModalOpen(false)}
          onQueued={handleQueued}
        />
      )}

      {/* Active exports — stack below the button trigger point */}
      {activeJobIds.length > 0 && (
        <div className="mt-2 space-y-2">
          {activeJobIds.map((jobId) => (
            <ExportStatusPanel
              key={jobId}
              jobId={jobId}
              onDismiss={() => handleDismiss(jobId)}
            />
          ))}
        </div>
      )}
    </>
  );
}
