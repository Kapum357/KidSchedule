/**
 * Global App Loading UI
 *
 * Rendered by Next.js while route segments stream/loading.
 * Includes aria-busy and status semantics for assistive tech.
 */
export default function Loading() {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center"
      aria-busy="true"
      aria-live="polite"
    >
      <output aria-label="Loading content" className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
        <span
          aria-hidden="true"
          className="material-symbols-outlined animate-spin text-primary"
        >
          progress_activity
        </span>
        <span className="text-sm font-medium">Loading…</span>
      </output>
    </main>
  );
}
