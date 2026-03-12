"use client";

/**
 * ShareModal
 *
 * Modal dialog for sharing an export with others.
 * Displays:
 * - QR code (generated from qrserver API)
 * - Share link with copy button
 * - Token expiration date
 * - Generate new token button
 */

import { useState, useEffect } from "react";
import { useToast } from "@/components/toast-notification";

interface ShareModalProps {
  exportId: string;
  onClose: () => void;
}

interface ShareTokenResponse {
  token: string;
  shareLink: string;
  qrUrl: string;
  expiresAt: string;
  createdAt: string;
}

export default function ShareModal({ exportId, onClose }: ShareModalProps) {
  const { add: addToast } = useToast();
  const [token, setToken] = useState<ShareTokenResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch share token on mount
  useEffect(() => {
    fetchToken();
  }, [exportId]);

  async function fetchToken() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/exports/${exportId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays: 7 }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate share token");
      }

      const data = (await response.json()) as ShareTokenResponse;
      setToken(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      addToast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyLink() {
    if (!token?.shareLink) return;

    try {
      await navigator.clipboard.writeText(token.shareLink);
      setCopied(true);
      addToast("Copied to clipboard!", "success");

      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast("Failed to copy to clipboard", "error");
    }
  }

  async function handleGenerateNewToken() {
    await fetchToken();
    addToast("New share token generated", "success");
  }

  function formatExpirationDate(isoString: string): string {
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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg bg-white shadow-lg dark:bg-slate-900">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Share Export
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <span className="material-symbols-outlined animate-spin text-3xl text-blue-600 dark:text-blue-400">
                    progress_activity
                  </span>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Generating share link...
                  </p>
                </div>
              </div>
            ) : error ? (
              <div className="rounded-md bg-red-50 px-4 py-3 dark:bg-red-900">
                <p className="text-sm text-red-700 dark:text-red-300">
                  {error}
                </p>
              </div>
            ) : token ? (
              <div className="space-y-4">
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="rounded-lg border-2 border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
                    <img
                      src={token.qrUrl}
                      alt="Share QR Code"
                      width={200}
                      height={200}
                      className="rounded"
                    />
                  </div>
                </div>

                {/* Share Link */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Share Link
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={token.shareLink}
                      className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                    />
                    <button
                      onClick={handleCopyLink}
                      className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                        copied
                          ? "bg-emerald-600 text-white dark:bg-emerald-700"
                          : "bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
                      }`}
                    >
                      <span className="material-symbols-outlined">
                        {copied ? "check" : "content_copy"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Expiration Date */}
                <div className="rounded-md bg-blue-50 px-4 py-3 dark:bg-blue-900">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    <span className="font-medium">Expires:</span>{" "}
                    {formatExpirationDate(token.expiresAt)}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
            <button
              onClick={handleGenerateNewToken}
              disabled={loading}
              className="flex-1 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <span className="material-symbols-outlined mr-1 inline text-sm">
                refresh
              </span>
              New Token
            </button>
            <button
              onClick={onClose}
              className="flex-1 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
