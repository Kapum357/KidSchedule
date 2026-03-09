'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { sendMediationSuggestion, adjustSuggestionTone } from '@/app/mediation/page-actions';

interface MediationInterfaceProps {
  topicId: string;
  topicTitle: string;
  draftSuggestion?: string;
  recipientParentId: string;
}

export function MediationInterface({
  topicId,
  topicTitle,
  draftSuggestion = '',
  recipientParentId,
}: Readonly<MediationInterfaceProps>) {
  const [draftText, setDraftText] = useState(draftSuggestion);
  const [isSending, setIsSending] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);

  const handleSendSuggestion = async () => {
    if (!draftText.trim()) {
      toast.error('Draft suggestion cannot be empty');
      return;
    }

    setIsSending(true);

    try {
      const result = await sendMediationSuggestion(topicId, draftText, recipientParentId);
      if (result.success) {
        toast.success('Suggestion sent successfully! 🎉', {
          description: `Message sent to co-parent about "${topicTitle}"`,
        });
        setDraftText('');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send suggestion';
      toast.error('Failed to send', { description: errorMsg });
    } finally {
      setIsSending(false);
    }
  };

  const handleAdjustTone = async (adjustment: 'gentler' | 'shorter' | 'more_formal' | 'warmer') => {
    if (!draftText.trim()) {
      toast.error('No draft text to adjust');
      return;
    }

    setIsAdjusting(true);

    try {
      const result = await adjustSuggestionTone(draftText, adjustment);
      setDraftText(result.adjustedText);
      const adjustmentLabel = adjustment.replace('_', ' ');
      toast.success(`Adjusted to be ${adjustmentLabel}!`, {
        description: `Text rewritten with "${adjustmentLabel}" tone`,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : `Failed to adjust tone`;
      toast.error('Could not adjust tone', { description: errorMsg });
    } finally {
      setIsAdjusting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Draft Suggestion Area */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl">
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
          Draft Suggestion
        </label>
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder="Type your mediation suggestion here..."
          className="w-full p-3 border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none"
          rows={4}
        />
        <div className="text-xs text-slate-500 text-right mt-1">
          {draftText.length}/2000 characters
        </div>
      </div>

      {/* Tone Adjustment Buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => handleAdjustTone('gentler')}
          disabled={isAdjusting || !draftText.trim()}
          className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-3 py-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          🤝 Make Gentler
        </button>
        <button
          onClick={() => handleAdjustTone('shorter')}
          disabled={isAdjusting || !draftText.trim()}
          className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-3 py-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ✂️ Make Shorter
        </button>
        <button
          onClick={() => handleAdjustTone('warmer')}
          disabled={isAdjusting || !draftText.trim()}
          className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-3 py-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          💙 Make Warmer
        </button>
      </div>

      {/* Send Button */}
      <button
        onClick={handleSendSuggestion}
        disabled={isSending || !draftText.trim()}
        className="w-full bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <span className="material-symbols-outlined text-lg">send</span>
        {isSending ? 'Sending...' : 'Send Suggestion'}
      </button>
    </div>
  );
}
