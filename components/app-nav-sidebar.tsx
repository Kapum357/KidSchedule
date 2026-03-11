"use client";

import Link from "next/link";

export type NavItem = {
  href: string;
  icon: string;
  label: string;
  active?: boolean;
  badge?: number;
};

export type AppNavSidebarProps = {
  navItems: NavItem[];
  /** Display name for the logged-in user */
  userName: string;
  /** 1–2 char initials shown when no avatar is available */
  userInitials: string;
  /** Small subtitle shown under the name (e.g. plan tier) */
  userSubtitle?: string;
  /** Optional avatar image URL */
  avatarUrl?: string;
  /** Additional className forwarded to the <aside> */
  className?: string;
};

export function AppNavSidebar({
  navItems,
  userName,
  userInitials,
  userSubtitle = "Free Plan",
  avatarUrl,
  className = "",
}: AppNavSidebarProps) {
  return (
    <aside
      aria-label="Primary navigation"
      className={`w-64 bg-white dark:bg-surface border-r border-slate-200 dark:border-slate-800 flex-col hidden md:flex z-20 ${className}`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-primary/20 p-1.5 rounded-lg text-primary">
            <span aria-hidden="true" className="material-symbols-outlined text-2xl">
              family_restroom
            </span>
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-white select-none">
            KidSchedule
          </span>
        </div>
      </div>

      {/* Nav links */}
      <nav aria-label="App navigation" className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
              item.active
                ? "text-primary bg-primary/10 font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5"
            }`}
            aria-current={item.active ? "page" : undefined}
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined"
              style={item.active ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {item.icon}
            </span>
            <span className="flex-1">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                {item.badge}
              </span>
            )}
          </Link>
        ))}

        {/* Settings divider */}
        <div className="pt-6 pb-2 px-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Settings</p>
        </div>
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg font-medium transition-colors"
        >
          <span aria-hidden="true" className="material-symbols-outlined">settings</span>
          <span>Settings</span>
        </Link>
      </nav>

      {/* User profile card */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
        <Link
          href="/settings"
          className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left"
          aria-label={`${userName} — go to settings`}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={userName}
              width={36}
              height={36}
              className="rounded-full object-cover shrink-0 w-9 h-9"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {userInitials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {userName}
            </p>
            <p className="text-xs text-slate-500 truncate">{userSubtitle}</p>
          </div>
          <span aria-hidden="true" className="material-symbols-outlined text-slate-400 text-lg">
            expand_more
          </span>
        </Link>
      </div>
    </aside>
  );
}
