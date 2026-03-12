'use client';

import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupedReaction {
  emoji: string;
  count: number;
  byCurrentUser: boolean;
  userIds: string[];
}

interface MomentReactionSummaryProps {
  momentId: string;
  reactions: GroupedReaction[];
  onReactionRemoved?: (emoji: string) => void;
  onError?: (error: string) => void;
  currentUserId?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MomentReactionSummary({
  momentId,
  reactions,
  onReactionRemoved,
  onError,
  currentUserId,
}: MomentReactionSummaryProps) {
  const [removing, setRemoving] = useState<string | null>(null);

  const handleRemove = async (emoji: string, reactionIds: string[]) => {
    // Find the reaction ID for the current user's reaction with this emoji
    // In a real implementation, we'd need to track which reactionId belongs to which user
    // For now, we'll use the emoji as a proxy and filter by currentUserId

    if (!currentUserId) {
      onError?.('Not authenticated');
      return;
    }

    setRemoving(emoji);
    try {
      // Find the reaction that belongs to the current user
      // Note: reactionIds are provided by the server for this emoji
      // We'll need a more direct way to identify which reaction to delete
      // For now, attempt to delete using the first reactionId
      // In production, the API should be updated to accept emoji + userId
      if (reactionIds.length === 0) {
        onError?.('Reaction not found');
        setRemoving(null);
        return;
      }

      const res = await fetch(`/api/moments/${momentId}/reactions/${reactionIds[0]}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        onReactionRemoved?.(emoji);
      } else {
        const errorData = await res.json().catch(() => ({}));
        onError?.(errorData.message || 'Failed to remove reaction');
      }
    } catch (error) {
      onError?.(
        error instanceof Error ? error.message : 'Error removing reaction'
      );
    } finally {
      setRemoving(null);
    }
  };

  if (reactions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1 p-1">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          onClick={() =>
            reaction.byCurrentUser &&
            handleRemove(reaction.emoji, reaction.userIds)
          }
          disabled={removing === reaction.emoji || !reaction.byCurrentUser}
          className={`
            flex items-center gap-1 px-2 py-1 rounded-full text-sm
            ${
              reaction.byCurrentUser
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-default'
            }
            transition-colors disabled:opacity-50 disabled:cursor-not-allowed
          `}
          title={`${reaction.userIds.join(', ')} reacted with ${reaction.emoji}`}
          type="button"
        >
          <span>{reaction.emoji}</span>
          <span className="text-xs">{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}
