'use client';

import { ALLOWED_EMOJIS } from '@/lib/constants/emoji';
import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MomentReactionPickerProps {
  momentId: string;
  onReactionAdded?: (emoji: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MomentReactionPicker({
  momentId,
  onReactionAdded,
  onError,
  disabled,
}: MomentReactionPickerProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleClick = async (emoji: string) => {
    setLoading(emoji);
    try {
      const res = await fetch(`/api/moments/${momentId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.message || 'Failed to add reaction';
        onError?.(errorMsg);
        return;
      }

      onReactionAdded?.(emoji);
    } catch (error) {
      onError?.(
        error instanceof Error ? error.message : 'Error adding reaction'
      );
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 p-2">
      {ALLOWED_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => handleClick(emoji)}
          disabled={disabled || loading === emoji}
          className="text-2xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded p-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={`Add ${emoji} reaction`}
          type="button"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
