import { MomentsGallery } from "./moments-gallery";
import { NotificationButton } from "@/components/notification-button";
import { MobileNavOverlay } from "@/components/mobile-nav-overlay";
import { ThemeToggle } from "@/app/theme-toggle";
import Link from "next/link";

export default function MomentsGalleryPage() {
  return (
    <main id="main-content" className="flex min-h-screen flex-col bg-background-light font-display text-text-main antialiased dark:bg-background-dark">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-surface-light dark:border-gray-800 dark:bg-surface-dark">
        <div className="mx-auto flex h-16 max-w-[96rem] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <MobileNavOverlay
              navItems={[
                { href: "/dashboard", icon: "grid_view", label: "Dashboard" },
                { href: "/calendar", icon: "calendar_month", label: "Calendar" },
                { href: "/expenses", icon: "receipt_long", label: "Expenses" },
                { href: "/messages", icon: "chat", label: "Messages" },
                { href: "/school", icon: "school", label: "School" },
                { href: "/moments", icon: "photo_library", label: "Moments", active: true },
              ]}
              userName="Parent"
              userInitials="JD"
            />
            <div className="rounded-lg bg-primary/20 p-2 text-primary">
              <span className="material-symbols-outlined text-2xl">family_restroom</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">KidSchedule</span>
            <span className="mx-3 hidden h-6 w-px bg-slate-200 dark:bg-slate-700 sm:block"></span>
            <h1 className="hidden text-lg font-semibold text-slate-700 dark:text-slate-200 sm:block">Family Moments</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Desktop search lives inside the client gallery component */}
            <div className="hidden items-center rounded-full bg-gray-100 px-3 py-1.5 md:flex dark:bg-gray-800">
              <span className="material-symbols-outlined text-sm text-slate-400">search</span>
              <input
                type="text"
                placeholder="Search memories..."
                className="w-48 border-none bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:ring-0 dark:text-slate-200"
                aria-label="Search memories"
              />
            </div>

            <a href="/moments/share" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover">
              <span className="material-symbols-outlined text-lg">add_a_photo</span>
              <span>Log New Moment</span>
            </a>

            <NotificationButton initialPendingCount={0} />
            <ThemeToggle />
            <Link
              href="/settings"
              aria-label="Go to settings"
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border border-indigo-200 bg-indigo-100 text-xs font-bold text-indigo-700 hover:opacity-80 transition-opacity dark:border-indigo-800 dark:bg-indigo-900 dark:text-indigo-300"
            >
              JD
            </Link>
          </div>
        </div>
      </header>

      <MomentsGallery />
    </main>
  );
}
