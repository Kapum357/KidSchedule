'use client';

import { useSectionInView } from '@/hooks/useSectionInView';

interface Section {
  id: string;
  label: string;
  icon: string;
}

interface TableOfContentsProps {
  readonly sections: readonly Section[];
}

export function TableOfContents({ sections }: TableOfContentsProps) {
  const activeId = useSectionInView(sections.map((s) => s.id));

  return (
    <aside className="w-72 bg-surface-light dark:bg-surface-dark border-r border-slate-200 dark:border-slate-800 hidden md:flex flex-col h-full overflow-y-auto custom-scrollbar shrink-0 print:hidden">
      <div className="p-6">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
          Table of Contents
        </h3>
        <nav className="space-y-1">
          {sections.map((section) => {
            const isActive = activeId === section.id;
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'text-primary bg-primary/10'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="material-symbols-outlined text-lg">{section.icon}</span>
                {section.label}
              </a>
            );
          })}
        </nav>

        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
            Support
          </h3>
          <a
            href="mailto:legal@kidschedule.com"
            className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-primary transition-colors mb-3"
          >
            <span className="material-symbols-outlined text-lg">mail</span>
            legal@kidschedule.com
          </a>
          <a
            href="#"
            className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-lg">help</span>
            Help Center
          </a>
        </div>
      </div>
    </aside>
  );
}
