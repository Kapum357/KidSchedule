'use client';

import { useState, useCallback } from 'react';
import type { ExpenseSplitType } from '@/lib/expense-engine';
import { SPLIT_PRESETS } from '@/lib/expense-engine';

interface SplitSelectorProps {
  defaultSplitType: ExpenseSplitType;
  defaultCustomPercent: number | null;
  onSplitChange?: (type: ExpenseSplitType, customPercent: number | null) => void;
}

export function SplitSelector({
  defaultSplitType,
  defaultCustomPercent,
  onSplitChange,
}: SplitSelectorProps) {
  const [splitType, setSplitType] = useState<ExpenseSplitType>(defaultSplitType);
  const [customPercent, setCustomPercent] = useState<number | null>(defaultCustomPercent);
  const [customError, setCustomError] = useState<string | null>(null);
  const [hasUnsavedCustom, setHasUnsavedCustom] = useState(false);

  const handleSplitTypeChange = useCallback(
    (newType: ExpenseSplitType) => {
      if (newType !== 'custom' && customPercent !== null && customPercent !== 50) {
        setHasUnsavedCustom(true);
      }
      setSplitType(newType);
      setCustomError(null);
      if (newType !== 'custom') {
        onSplitChange?.(newType, null);
      }
    },
    [customPercent, onSplitChange]
  );

  const handleCustomChange = (value: string) => {
    const parsed = value === '' ? null : Number(value);

    if (parsed !== null && !Number.isFinite(parsed)) {
      setCustomPercent(null);
      setCustomError(null);
      return;
    }

    setCustomPercent(parsed);
    setHasUnsavedCustom(true);

    // Validation: must be between 1 and 99
    if (parsed !== null) {
      if (parsed < 1) {
        setCustomError('Must be at least 1%');
      } else if (parsed > 99) {
        setCustomError('Cannot exceed 99%');
      } else {
        setCustomError(null);
        setSplitType('custom');
        onSplitChange?.('custom', parsed);
      }
    }
  };

  const isCustomInvalid = customPercent !== null && (customPercent < 1 || customPercent > 99);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Split Arrangement
        </p>
        <span className="text-xs text-primary bg-primary/10 px-2 py-1 rounded-full font-medium">
          Default: 50/50
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {SPLIT_PRESETS.map((preset) => (
          <label
            key={preset.id}
            className="split-preset-option relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none"
          >
            <input
              className="sr-only"
              name="splitType"
              type="radio"
              value={preset.id}
              checked={splitType === preset.id}
              onChange={() => handleSplitTypeChange(preset.id as ExpenseSplitType)}
              aria-describedby={hasUnsavedCustom && splitType !== 'custom' ? 'unsaved-custom' : undefined}
            />
            <span className="flex flex-1">
              <span className="flex flex-col">
                <span className="block text-sm font-medium text-slate-900 dark:text-white">
                  {preset.label}
                </span>
                <span className="mt-1 flex items-center text-xs text-slate-500 dark:text-slate-400">
                  {preset.subtitle}
                </span>
              </span>
            </span>
            <span className="split-preset-icon material-symbols-outlined">
              check_circle
            </span>
          </label>
        ))}
      </div>

      {hasUnsavedCustom && splitType !== 'custom' && (
        <div id="unsaved-custom" className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">info</span>
          Your custom split (
          {customPercent}
          %) will be discarded if you don&apos;t switch back to Custom
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2 sm:col-span-1">
          <label
            className="block text-xs font-semibold text-slate-500 uppercase tracking-wide"
            htmlFor="customYouPercent"
          >
            Custom split (your %)
          </label>
          <input
            id="customYouPercent"
            name="customYouPercent"
            type="number"
            min="1"
            max="99"
            step="1"
            value={customPercent ?? ''}
            onChange={(e) => handleCustomChange(e.target.value)}
            className={`block w-full rounded-lg border py-2.5 px-4 text-slate-900
              placeholder-slate-600 dark:placeholder-slate-300
              focus:border-primary focus:ring-primary sm:text-sm
              dark:bg-background-dark ${
                isCustomInvalid
                  ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/10'
                  : 'border-slate-400 dark:border-slate-600 bg-white dark:bg-background-dark'
              }`}
            aria-invalid={isCustomInvalid}
            aria-describedby={customError ? 'custom-error' : undefined}
          />
          {customError && (
            <div
              id="custom-error"
              className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">error</span>
              {customError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
