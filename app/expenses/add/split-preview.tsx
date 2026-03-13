'use client';

import { useMemo } from 'react';
import { computeSplitSummary, formatCurrency } from '@/lib/expense-engine';
import type { ExpenseSplitType } from '@/lib/expense-engine';

interface SplitPreviewProps {
  amountCents: number;
  splitType: ExpenseSplitType;
  customPercent: number | null;
}

export function SplitPreview({
  amountCents,
  splitType,
  customPercent,
}: SplitPreviewProps) {
  const splitSummary = useMemo(
    () => computeSplitSummary(amountCents, splitType, customPercent),
    [amountCents, splitType, customPercent]
  );

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 mt-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-300">
          Your Share ({splitSummary.youPercent}%)
        </span>
        <span className="font-bold text-slate-900 dark:text-white">
          {formatCurrency(splitSummary.youShareCents)}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
        <span className="text-slate-600 dark:text-slate-300">
          Other Parent&apos;s Share ({splitSummary.otherPercent}%)
        </span>
        <span className="font-bold text-slate-900 dark:text-white">
          {formatCurrency(splitSummary.otherShareCents)}
        </span>
      </div>
    </div>
  );
}
