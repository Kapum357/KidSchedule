'use client';

import { useEffect, useState } from 'react';

interface QuotaData {
  maxDocuments: number | null;
  currentDocuments: number;
  maxStorageBytes: number | null;
  usedStorageBytes: number;
  documentPercentFull: number | null;
  storagePercentFull: number | null;
  canUpload: boolean;
}

interface QuotaBarProps {
  onQuotaChange?: (quota: QuotaData) => void;
  refreshInterval?: number;
}

/**
 * QuotaBar Component
 *
 * Displays vault quota usage visualization with:
 * - Progress bars for documents and storage (0-100% with CSS)
 * - Text: "X of Y documents | Z MB of W MB"
 * - Color indicators: Green (<50%), Yellow (50-90%), Red (>90%)
 * - Real-time updates based on refreshInterval
 * - Handles unlimited tiers (shows "Unlimited")
 * - Shows canUpload status for enabling/disabling upload button
 *
 * Fetches data from GET /api/school/vault/quota
 */
export function QuotaBar({ onQuotaChange, refreshInterval = 5000 }: QuotaBarProps) {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial fetch and polling
  useEffect(() => {
    const fetchQuota = async () => {
      try {
        const response = await fetch('/api/school/vault/quota', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message || `Failed to fetch quota (${response.status})`
          );
        }

        const data: QuotaData = await response.json();
        setQuota(data);
        setError(null);
        onQuotaChange?.(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        console.error('Failed to fetch vault quota:', message);
      } finally {
        setLoading(false);
      }
    };

    fetchQuota();

    if (refreshInterval > 0) {
      const interval = setInterval(fetchQuota, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, onQuotaChange]);

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-2">
          <div className="h-4 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="space-y-2">
          <div className="h-4 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !quota) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm font-medium text-red-900 dark:text-red-200">
          {error || 'Failed to load quota information'}
        </p>
      </div>
    );
  }

  // Helper: Format bytes to human-readable size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${Math.round(mb * 10) / 10} MB`;
  };

  // Helper: Get color based on percentage
  const getProgressColor = (percentage: number | null): string => {
    if (percentage === null) return 'bg-blue-500';
    if (percentage < 50) return 'bg-green-500';
    if (percentage < 90) return 'bg-amber-500';
    return 'bg-red-500';
  };

  // Helper: Get warning text color
  const getWarningTextColor = (percentage: number | null): string => {
    if (percentage === null) return 'text-blue-600 dark:text-blue-400';
    if (percentage < 50) return 'text-green-600 dark:text-green-400';
    if (percentage < 90) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const documentColor = getProgressColor(quota.documentPercentFull);
  const storageColor = getProgressColor(quota.storagePercentFull);
  const documentWarningColor = getWarningTextColor(quota.documentPercentFull);
  const storageWarningColor = getWarningTextColor(quota.storagePercentFull);

  return (
    <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      {/* Documents Quota */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-900 dark:text-white">
            Documents
          </label>
          <span className={`text-sm font-medium ${documentWarningColor}`}>
            {quota.maxDocuments === null ? (
              <>
                {quota.currentDocuments} of <span className="italic">Unlimited</span>
              </>
            ) : (
              `${quota.currentDocuments} of ${quota.maxDocuments}`
            )}
          </span>
        </div>

        {quota.maxDocuments !== null && quota.maxDocuments > 0 ? (
          <>
            {/* Progress Bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={`h-full transition-all duration-300 ${documentColor}`}
                style={{
                  width: `${Math.min(quota.documentPercentFull || 0, 100)}%`,
                }}
                role="progressbar"
                aria-valuenow={quota.currentDocuments}
                aria-valuemin={0}
                aria-valuemax={quota.maxDocuments}
                aria-label={`Documents: ${quota.currentDocuments} of ${quota.maxDocuments}`}
              />
            </div>
            {/* Percentage Text */}
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {quota.documentPercentFull}% used
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-600 dark:text-slate-400">
            Unlimited storage
          </div>
        )}
      </div>

      {/* Storage Quota */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-900 dark:text-white">
            Storage
          </label>
          <span className={`text-sm font-medium ${storageWarningColor}`}>
            {quota.maxStorageBytes === null ? (
              <>
                {formatBytes(quota.usedStorageBytes)} of{' '}
                <span className="italic">Unlimited</span>
              </>
            ) : (
              `${formatBytes(quota.usedStorageBytes)} of ${formatBytes(
                quota.maxStorageBytes
              )}`
            )}
          </span>
        </div>

        {quota.maxStorageBytes !== null && quota.maxStorageBytes > 0 ? (
          <>
            {/* Progress Bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={`h-full transition-all duration-300 ${storageColor}`}
                style={{
                  width: `${Math.min(quota.storagePercentFull || 0, 100)}%`,
                }}
                role="progressbar"
                aria-valuenow={quota.usedStorageBytes}
                aria-valuemin={0}
                aria-valuemax={quota.maxStorageBytes}
                aria-label={`Storage: ${formatBytes(
                  quota.usedStorageBytes
                )} of ${formatBytes(quota.maxStorageBytes)}`}
              />
            </div>
            {/* Percentage Text */}
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {quota.storagePercentFull}% used
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-600 dark:text-slate-400">
            Unlimited storage
          </div>
        )}
      </div>

      {/* Upload Status */}
      <div
        className={`rounded-lg border p-3 text-sm ${
          quota.canUpload
            ? 'border-green-100 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200'
            : 'border-red-100 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base">
            {quota.canUpload ? 'check_circle' : 'error'}
          </span>
          <span className="font-medium">
            {quota.canUpload
              ? 'You can upload more documents'
              : 'You have reached your quota limit'}
          </span>
        </div>
      </div>
    </div>
  );
}
