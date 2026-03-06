/**
 * Metrics Display Component
 *
 * Shows queue health and performance metrics
 */

"use client";

import { useState, useEffect } from "react";

interface Metrics {
  timestamp: string;
  queueLength: number;
  workerStatus: {
    isRunning: boolean;
    processedCount: number;
    failedCount: number;
  };
  jobStats: {
    total: number;
    queued: number;
    processing: number;
    complete: number;
    failed: number;
  };
  averageProcessingTime: number;
  successRate: number;
  health: {
    isHealthy: boolean;
    warnings: string[];
  };
}

export function MetricsDisplay() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        const response = await fetch("/api/exports/metrics");
        if (!response.ok) throw new Error("Failed to load metrics");
        const data = await response.json();
        setMetrics(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load metrics";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadMetrics();
    const interval = setInterval(loadMetrics, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-slate-500">Loading metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  const healthColor = metrics.health.isHealthy
    ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-900/40 dark:text-emerald-300"
    : "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-900/40 dark:text-amber-300";

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 dark:text-white">Queue Metrics</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-medium border ${healthColor}`}>
          {metrics.health.isHealthy ? "Healthy" : "Warnings"}
        </span>
      </div>

      {/* Health warnings */}
      {metrics.health.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
          {metrics.health.warnings.map((warning) => (
            <p key={warning} className="text-xs text-amber-700 dark:text-amber-300">
              ⚠ {warning}
            </p>
          ))}
        </div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Queue Length" value={metrics.queueLength} unit="" />
        <MetricCard label="Processing" value={metrics.jobStats.processing} unit="jobs" />
        <MetricCard label="Success Rate" value={`${Math.round(metrics.successRate * 100)}%`} unit="" />
        <MetricCard
          label="Processed"
          value={metrics.workerStatus.processedCount}
          unit="total"
        />
      </div>

      {/* Job status breakdown */}
      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
          Job Status: {metrics.jobStats.total} total
        </p>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Queued:</span>
            <span className="font-mono text-blue-600 dark:text-blue-400">
              {metrics.jobStats.queued}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Processing:</span>
            <span className="font-mono text-amber-600 dark:text-amber-400">
              {metrics.jobStats.processing}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Complete:</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400">
              {metrics.jobStats.complete}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Failed:</span>
            <span className="font-mono text-red-600 dark:text-red-400">
              {metrics.jobStats.failed}
            </span>
          </div>
        </div>
      </div>

      {/* Worker status */}
      <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
          Worker Status
        </span>
        <span
          className={`text-xs font-mono ${
            metrics.workerStatus.isRunning
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {metrics.workerStatus.isRunning ? "🟢 Running" : "🔴 Stopped"}
        </span>
      </div>

      {/* Last updated */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Last updated: {new Date(metrics.timestamp).toLocaleTimeString()}
      </p>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  unit: string;
}

function MetricCard({ label, value, unit }: MetricCardProps) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
      <p className="text-xs text-slate-600 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
        {value} {unit && <span className="text-xs font-normal">{unit}</span>}
      </p>
    </div>
  );
}
