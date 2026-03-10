'use client';

import { useToast } from './toast-notification';

export function SettleBalanceButton() {
  const { add: showToast } = useToast();

  const handleSettleBalance = () => {
    showToast('Settlement initiated. Notification sent to co-parent.', 'success');
  };

  return (
    <button
      onClick={handleSettleBalance}
      className={
        'hidden sm:flex items-center gap-2 px-4 py-2 ' +
        'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ' +
        'text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg ' +
        'hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm'
      }
    >
      <span className="material-symbols-outlined text-[20px]">payments</span>
      Settle Balance
    </button>
  );
}
