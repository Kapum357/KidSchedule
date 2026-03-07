'use client';

import { useState } from 'react';
import { dismissWarning } from '@/app/mediation/page-actions';
import type { WarningSignal } from '@/lib/mediation-analyzer';

interface WarningsPanelProps {
  warnings: WarningSignal[];
}

function getWarningSeverityColor(signal: WarningSignal): string {
  switch (signal.severity) {
    case 'high':
      return 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500';
    case 'medium':
      return 'bg-amber-50 dark:bg-amber-900/10 border-l-4 border-amber-500';
    case 'low':
      return 'bg-slate-50 dark:bg-slate-800 border-l-4 border-slate-400';
  }
}

function getWarningLabel(category: WarningSignal['category']): string {
  const labels: Record<WarningSignal['category'], string> = {
    aggressive_capitalization: 'Aggressive Capitalization',
    emotional_intensity: 'Emotional Intensity',
    hostile_language: 'Hostile Language',
    sensitive_topic_escalation: 'Topic Escalation',
    delayed_response: 'Late Night Comms',
    accusatory_language: 'Accusatory Language',
    threat_language: 'Threat Language',
    personal_attack: 'Personal Attack',
  };
  return labels[category];
}

function formatWarningTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 2) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(isoString).toLocaleDateString();
}

function getWarningCreatedAt(warning: WarningSignal): string {
  const w = warning as unknown as {
    createdAt?: string;
    sentAt?: string;
    timestamp?: string;
  };
  return w.createdAt ?? w.sentAt ?? w.timestamp ?? new Date().toISOString();
}

interface WarningCardProps {
  warning: WarningSignal;
  onDismiss: (warningId: string) => Promise<void>;
}

function WarningCard({ warning, onDismiss }: WarningCardProps) {
  const [isDismissing, setIsDismissing] = useState(false);
  const [sendAck, setSendAck] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDismiss = async () => {
    setIsDismissing(true);
    setError(null);
    setSuccess(false);

    try {
      // TODO: Implement sendAck logic when API is updated
      await onDismiss(warning.id);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss warning');
    } finally {
      setIsDismissing(false);
    }
  };

  return (
    <div className={`p-3 rounded-r-md ${getWarningSeverityColor(warning)}`}>
      <div className="flex justify-between items-start mb-1">
        <span className="text-xs font-bold uppercase">
          {getWarningLabel(warning.category)}
        </span>
        <span className="text-[10px] text-slate-400">
          {formatWarningTime(getWarningCreatedAt(warning))}
        </span>
      </div>
      <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">
        {warning.description}
      </p>

      {/* Dismissal UI */}
      <div className="space-y-2 pt-2 border-t border-current border-opacity-20">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={sendAck}
            onChange={(e) => setSendAck(e.target.checked)}
            disabled={isDismissing}
            className="w-4 h-4 rounded border-slate-300"
          />
          <span>Send acknowledgment to other parent</span>
        </label>

        <button
          onClick={handleDismiss}
          disabled={isDismissing}
          className="w-full text-xs font-medium py-1 px-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDismissing ? 'Dismissing...' : 'Dismiss Warning'}
        </button>

        {success && (
          <div className="text-xs text-emerald-700 dark:text-emerald-300 text-center font-medium">
            Warning dismissed
          </div>
        )}
        {error && (
          <div className="text-xs text-red-700 dark:text-red-300 text-center font-medium">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export function WarningsPanel({ warnings }: Readonly<WarningsPanelProps>) {
  const [allWarnings, setAllWarnings] = useState(warnings);
  const displayedWarnings = allWarnings.slice(0, 3);

  const handleDismiss = async (warningId: string) => {
    await dismissWarning(warningId);
    setAllWarnings(allWarnings.filter((w) => w.id !== warningId));
  };

  return (
    <div className="lg:col-span-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 flex flex-col">
      <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-amber-500">notifications_active</span>
        Warning Signals
      </h2>

      <div className="space-y-3 flex-1 overflow-y-auto max-h-[250px] pr-2">
        {displayedWarnings.length > 0 ? (
          displayedWarnings.map((warning) => (
            <WarningCard key={warning.id} warning={warning} onDismiss={handleDismiss} />
          ))
        ) : (
          <div className="flex items-center justify-center h-32 text-center">
            <p className="text-sm text-slate-500">No active warnings. Communication is healthy.</p>
          </div>
        )}
      </div>

      {allWarnings.length > 3 && (
        <a
          href="/mediation/warnings"
          className="mt-4 w-full text-sm text-primary hover:text-primary-hover font-semibold text-center py-2 hover:bg-primary/5 rounded-lg transition-colors"
        >
          View All {allWarnings.length} Alerts
        </a>
      )}
    </div>
  );
}
