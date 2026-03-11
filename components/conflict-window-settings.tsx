'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/components/toast-notification';

interface ConflictWindowSettingsProps {
  defaultWindowMins: number;
  familyId: string;
}

function formatWindowLabel(mins: number): string {
  if (mins === 0) return 'No buffer';
  if (mins === 30) return '30 minutes';
  if (mins === 60) return '1 hour';
  if (mins === 120) return '2 hours';
  if (mins === 360) return '6 hours';
  const hours = Math.round(mins / 60);
  return `${hours} hour${hours !== 1 ? 's' : ''}`;
}

const PRESET_VALUES = [
  { label: 'No Buffer', mins: 0 },
  { label: '30 min', mins: 30 },
  { label: '1 hour', mins: 60 },
  { label: '2 hours', mins: 120 },
  { label: '6 hours', mins: 360 },
];

export function ConflictWindowSettings({
  defaultWindowMins,
  familyId,
}: ConflictWindowSettingsProps) {
  const [windowMins, setWindowMins] = useState(defaultWindowMins);
  const [isSyncing, setIsSyncing] = useState(false);
  const { add: addToast } = useToast();

  const syncToServer = useCallback(
    (newValue: number) => {
      setIsSyncing(true);

      // Fire-and-forget API call
      fetch('/api/settings/conflict-window', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windowMins: newValue, familyId }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
        })
        .catch((error) => {
          // Revert to previous value on error
          setWindowMins(defaultWindowMins);
          addToast('Failed to save. Please try again.', 'error', 3000);
          console.error('Failed to sync conflict window setting:', error);
        })
        .finally(() => {
          setIsSyncing(false);
        });
    },
    [defaultWindowMins, familyId, addToast]
  );

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseInt(e.target.value, 10);
      setWindowMins(newValue);
      syncToServer(newValue);
    },
    [syncToServer]
  );

  const handlePresetClick = useCallback(
    (presetMins: number) => {
      setWindowMins(presetMins);
      syncToServer(presetMins);
    },
    [syncToServer]
  );

  return (
    <div className="conflict-window-settings space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-[24px] text-primary">
            schedule
          </span>
          Schedule Conflict Buffer
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Customize how far ahead the system should check for scheduling conflicts between parents.
        </p>
      </div>

      {/* Preset Buttons */}
      <div className="flex flex-wrap gap-2">
        {PRESET_VALUES.map(({ label, mins }) => (
          <button
            key={mins}
            onClick={() => handlePresetClick(mins)}
            className={`px-4 py-2 rounded-lg border font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
              windowMins === mins
                ? 'bg-primary text-white border-primary'
                : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700 hover:border-primary hover:text-primary dark:hover:text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Slider Input */}
      <div className="space-y-2">
        <label htmlFor="window-slider" className="block text-sm font-medium text-slate-900 dark:text-white">
          Custom Value
        </label>
        <input
          id="window-slider"
          type="range"
          min="0"
          max="720"
          step="1"
          value={windowMins}
          onChange={handleSliderChange}
          className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary"
          aria-label="Schedule conflict buffer in minutes"
        />
        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>0 min</span>
          <span>720 min (12 hours)</span>
        </div>
      </div>

      {/* Display Label */}
      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            Current Buffer
          </p>
          <p className="text-lg font-semibold text-primary">
            {formatWindowLabel(windowMins)}
          </p>
        </div>
        {isSyncing && (
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-4 rounded-full border-2 border-slate-300 border-t-primary dark:border-slate-600 dark:border-t-primary animate-spin"
              aria-label="Syncing..."
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">Syncing...</span>
          </div>
        )}
      </div>
    </div>
  );
}
