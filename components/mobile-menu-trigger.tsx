"use client";

interface MobileMenuTriggerProps {
  onClick: () => void;
  isOpen?: boolean;
  label?: string;
}

export function MobileMenuTrigger({
  onClick,
  isOpen = false,
  label = "Open navigation menu",
}: MobileMenuTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={isOpen}
      className="inline-flex items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
        {isOpen ? "close" : "menu"}
      </span>
    </button>
  );
}
