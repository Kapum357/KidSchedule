'use client';

/**
 * DeleteConfirmation Modal
 *
 * Modal dialog for confirming deletion of school vault documents.
 * Displays:
 * - Document title in the modal header
 * - Warning about soft-delete with 30-day retention period
 * - Confirm (Delete) and Cancel buttons
 * - Loading spinner during deletion
 * - Success/error messages
 * - Allows retry on error
 *
 * API: DELETE /api/school/vault/{id}
 */

import { useState } from 'react';
import { useToast } from '@/components/toast-notification';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  documentId: string;
  documentTitle: string;
  onClose: () => void;
  onDelete: () => void;
}

export default function DeleteConfirmationModal({
  isOpen,
  documentId,
  documentTitle,
  onClose,
  onDelete,
}: DeleteConfirmationModalProps) {
  const { add: addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Only render if modal is open
  if (!isOpen) {
    return null;
  }

  async function handleConfirmDelete() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/school/vault/${documentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Failed to delete document (${response.status})`
        );
      }

      // Mark as success
      setSuccess(true);
      addToast('Document deleted successfully', 'success');

      // Close after a brief delay to show success message
      setTimeout(() => {
        onDelete();
        onClose();
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    setError(null);
    setSuccess(false);
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black bg-opacity-50"
        onClick={handleCancel}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg bg-white shadow-lg dark:bg-slate-900">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Delete {documentTitle}?
            </h2>
            <button
              onClick={handleCancel}
              disabled={loading}
              className="text-slate-400 hover:text-slate-600 disabled:opacity-50 dark:hover:text-slate-300"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            {success ? (
              // Success state
              <div className="flex flex-col items-center justify-center py-8">
                <div className="text-center">
                  <span className="material-symbols-outlined text-5xl text-emerald-600 dark:text-emerald-400">
                    check_circle
                  </span>
                  <p className="mt-4 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    Document deleted successfully
                  </p>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                    The document will be permanently removed after 30 days.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Warning message */}
                <div className="rounded-lg bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
                  <div className="flex gap-3">
                    <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">
                      warning
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                        Soft Delete Notice
                      </p>
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">
                        This document will be deleted and retained for 30 days before
                        permanent removal. During this period, you can request recovery
                        if needed.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Error message */}
                {error && (
                  <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 dark:bg-red-900/20">
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {error}
                    </p>
                  </div>
                )}

                {/* Confirmation text */}
                {!error && (
                  <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                    Are you sure you want to delete{' '}
                    <span className="font-semibold text-slate-900 dark:text-white">
                      &ldquo;{documentTitle}&rdquo;
                    </span>
                    ?
                  </p>
                )}

                {/* Loading state */}
                {loading && (
                  <div className="mt-4 flex items-center justify-center">
                    <span className="material-symbols-outlined animate-spin text-2xl text-blue-600 dark:text-blue-400">
                      progress_activity
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {!success && (
            <div className="flex gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
              <button
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {error ? 'Close' : 'Cancel'}
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={loading}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined animate-spin text-sm">
                      progress_activity
                    </span>
                    Deleting...
                  </span>
                ) : error ? (
                  'Retry'
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
