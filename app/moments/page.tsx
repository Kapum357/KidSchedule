type MemoryKind = "media" | "quote" | "document";

import Image from "next/image";

type ChildTag = "Leo" | "Maya" | "Leo & Maya";

type MemoryItem = {
  id: string;
  kind: MemoryKind;
  title: string;
  dateLabel: string;
  childTag: ChildTag;
  imageUrl?: string;
  excerpt?: string;
  videoLength?: string;
  likes?: number;
  ownerInitials: string;
};

const MEMORY_ITEMS: readonly MemoryItem[] = [
  {
    id: "soccer-video",
    kind: "media",
    title: "First soccer goal of the season! ⚽️",
    dateLabel: "Oct 24, 2023",
    childTag: "Leo",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuA_cJLMA-CE-Fo19y8T3gGr2tOFh9s7dPEM-q_pZIeWPSlQq5urFB2gsAwN7WMj-wq5kWiGVlvac7pWA7pO6VG17gp2XIOAD-sFimgY7BJAVtpoHzd_SYKIPB_JrWEgonDuEauvScZuuYIST77NYAFDgueu1ky8hh1qvZKmqkxU2J8JSM0-1fqk0fZYgVWXVEMUNPiisaB5rkC31uJxf4H2AiwUr59242oEV7suP_epJutsYuBq0A2HmVsEdWjd5WsVsNs36hCjwpE",
    videoLength: "0:45",
    likes: 2,
    ownerInitials: "JD",
  },
  {
    id: "beach-photo",
    kind: "media",
    title: "Collecting seashells at the beach",
    dateLabel: "Sep 12, 2023",
    childTag: "Maya",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuC_TJhWR2wb97475hFwoPPGRxxUQvlH7PSxRV6NWTqWc2Osdk30z-IPradqCK7ky6-W-hLw1teFA2hV2hp5Z_UJklRTf5iBoMyraddPe3e8dCoYkM5hCvSi2QBndK85Pqp4iZFkGdBhPQtnISmg47LZlXR6X1HuQXGdAVmahhoiJd0ZC26S3AqleVhcHIpN3PEW-RLMLimT2LcCZYlm9ZMR64Fzkolen_n5-5-NVpJLa2SBXWkLeyDu7X6sq5cxLn1RzIZFqvkm0AA",
    likes: 1,
    ownerInitials: "SM",
  },
  {
    id: "science-fair",
    kind: "media",
    title: "Science Fair Winners! 🏆",
    dateLabel: "Aug 30, 2023",
    childTag: "Leo & Maya",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBRo3WhN0296Ld8u1Gm8sST5rknZ9UV2iTNiEKBJ_4eLge5wqOh6Z-fbhkxY0qeMPqdXwOpwoZolRw9Q_LlEVH-i6FxOuXDw2QrjxMDih50CFN04FW7swULous8LZKmFQOQkc5gti0uDiZs-YcBwoYhO0tpJ_jGUAuzrTF9_MugBB0lb550xcmKghAdUvN53qa9mRsqwaofTa1tC8p-avwpu3QPiidomw1eiEW5gyWJ7SX3S3W4Jnhyi5EJirlRObRWPUYmHqBqIPE",
    excerpt: "So proud of them both for working together on the volcano project.",
    likes: 3,
    ownerInitials: "JD",
  },
  {
    id: "ice-cream",
    kind: "media",
    title: "Post-dentist ice cream treat 🍦",
    dateLabel: "July 22, 2023",
    childTag: "Leo",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBBKO3TaFVqpO8KePPEypEC9G4Fdzzz8P4rI3Qpx0HOr70B13Zcq1tRU8RWxQZ5YqY4BqlGe1ozMnw0Jfh_zczqBas2i3m8WoEP4_CEWP2Q8Vh18vHnqp3jBHoAmT8-7-H5aKhiGFfYGVwfYQMjDNYBMmfLhMy0e99IEzb-T3S5bQJDgZeAnkHIGu9_86ZUnu1ywSzIortXvJhRnQX3x8rSknR9d3cb31ltkmcRwtQPhliYGdTFWag0CypEe5-79fDQnwj-YX8lFMI",
    ownerInitials: "SM",
  },
  {
    id: "maya-quote",
    kind: "quote",
    title: "\"Dad, did you know that octopuses have three hearts? I wish humans did too so we could love more things.\"",
    dateLabel: "Aug 15, 2023",
    childTag: "Maya",
    ownerInitials: "JD",
  },
  {
    id: "report-card",
    kind: "document",
    title: "Report Card - Spring Semester",
    dateLabel: "June 15, 2023",
    childTag: "Maya",
    ownerInitials: "JD",
    likes: 1,
  },
];

function childBadgeClasses(tag: ChildTag): string {
  if (tag === "Maya") {
    return "bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 ring-pink-700/10";
  }

  if (tag === "Leo & Maya") {
    return "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 ring-violet-700/10";
  }

  return "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-blue-700/10";
}

function avatarTone(initials: string): string {
  return initials === "SM"
    ? "bg-purple-100 text-purple-800"
    : "bg-indigo-100 text-indigo-800";
}

function MemoryCard({ item }: Readonly<{ item: MemoryItem }>) {
  if (item.kind === "quote") {
    return (
      <article className="break-inside-avoid mb-6 rounded-xl border border-amber-100 bg-amber-50 p-6 shadow-sm transition hover:shadow-md dark:border-amber-800/30 dark:bg-amber-900/20">
        <div className="mb-3 flex items-start justify-between">
          <span className="inline-flex rounded-md bg-pink-100 px-2 py-1 text-xs font-medium text-pink-800 dark:bg-pink-900/40 dark:text-pink-300">
            {item.childTag}
          </span>
          <span className="text-xs text-amber-800/60 dark:text-amber-200/60">{item.dateLabel}</span>
        </div>

        <h3 className="font-serif text-lg italic text-amber-900 dark:text-amber-100">{item.title}</h3>

        <div className="mt-4 flex justify-end">
          <button className="text-amber-700/60 transition hover:text-rose-500" type="button" aria-label="Like quote">
            <span className="material-symbols-outlined text-[20px]">favorite</span>
          </button>
        </div>
      </article>
    );
  }

  if (item.kind === "document") {
    return (
      <article className="break-inside-avoid mb-6 overflow-hidden rounded-xl border border-slate-100 bg-surface-light shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-surface-dark">
        <div className="relative flex items-center justify-center bg-gray-100 p-8 dark:bg-gray-800">
          <span className="material-symbols-outlined text-6xl text-gray-300">school</span>
          <span className="absolute bottom-2 right-2 rounded bg-white px-2 py-0.5 font-mono text-[10px] text-slate-500 shadow-sm dark:bg-surface-dark">
            PDF
          </span>
        </div>

        <div className="p-4">
          <div className="mb-2 flex items-start justify-between">
            <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${childBadgeClasses(item.childTag)}`}>
              {item.childTag}
            </span>
            <span className="text-xs text-slate-400">{item.dateLabel}</span>
          </div>

          <h3 className="mb-1 font-medium text-slate-900 dark:text-white">{item.title}</h3>
          <button className="mt-1 flex items-center gap-1 text-sm font-medium text-primary hover:underline" type="button">
            <span>Download File</span>
            <span className="material-symbols-outlined text-sm">download</span>
          </button>

          <footer className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ring-2 ring-white dark:ring-surface-dark ${avatarTone(item.ownerInitials)}`}>
              {item.ownerInitials}
            </div>
            <button className="flex items-center gap-1 text-rose-500 transition hover:text-rose-600" type="button" aria-label="Like document">
              <span className="text-xs font-medium">{item.likes ?? 0}</span>
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                favorite
              </span>
            </button>
          </footer>
        </div>
      </article>
    );
  }

  return (
    <article className="group break-inside-avoid mb-6 overflow-hidden rounded-xl border border-slate-100 bg-surface-light shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-surface-dark">
      <div className="relative">
        <Image
          src={item.imageUrl!}
          alt={item.title}
          className="h-auto w-full object-cover"
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
        />

        {item.videoLength && (
          <>
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition group-hover:opacity-100">
              <button type="button" className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-primary shadow-lg backdrop-blur-sm transition hover:scale-105 hover:bg-white" aria-label="Play video">
                <span className="material-symbols-outlined ml-1 text-3xl">play_arrow</span>
              </button>
            </div>

            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-black/50 px-2 py-1 text-xs text-white backdrop-blur-md">
              <span className="material-symbols-outlined text-sm">videocam</span>
              {item.videoLength}
            </span>
          </>
        )}
      </div>

      <div className="p-4">
        <div className="mb-2 flex items-start justify-between">
          <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${childBadgeClasses(item.childTag)}`}>
            {item.childTag}
          </span>
          <span className="text-xs text-slate-400">{item.dateLabel}</span>
        </div>

        <h3 className="mb-1 font-medium text-slate-900 dark:text-white">{item.title}</h3>
        {item.excerpt && <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{item.excerpt}</p>}

        <footer className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ring-2 ring-white dark:ring-surface-dark ${avatarTone(item.ownerInitials)}`}>
            {item.ownerInitials}
          </div>

          <button
            type="button"
            className={`flex items-center gap-1 transition ${item.likes ? "text-rose-500 hover:text-rose-600" : "text-slate-400 hover:text-rose-500"}`}
            aria-label="Like memory"
          >
            {item.likes ? <span className="text-xs font-medium">{item.likes}</span> : null}
            <span className="material-symbols-outlined text-[20px]" style={item.likes ? { fontVariationSettings: "'FILL' 1" } : undefined}>
              favorite
            </span>
          </button>
        </footer>
      </div>
    </article>
  );
}

export default function MomentsGalleryPage() {
  return (
    <main id="main-content" className="flex min-h-screen flex-col bg-background-light font-display text-text-main antialiased dark:bg-background-dark">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-surface-light dark:border-gray-800 dark:bg-surface-dark">
        <div className="mx-auto flex h-16 max-w-[96rem] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/20 p-2 text-primary">
              <span className="material-symbols-outlined text-2xl">family_restroom</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">KidSchedule</span>
            <span className="mx-3 hidden h-6 w-px bg-slate-200 dark:bg-slate-700 sm:block"></span>
            <h1 className="hidden text-lg font-semibold text-slate-700 dark:text-slate-200 sm:block">Family Moments</h1>
          </div>

          <div className="flex items-center gap-3">
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

            <div className="ml-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-indigo-200 bg-indigo-100 text-xs font-bold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900 dark:text-indigo-300">
              JD
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 flex-col overflow-y-auto border-r border-gray-200 bg-surface-light dark:border-gray-800 dark:bg-surface-dark lg:flex">
          <div className="space-y-8 p-6">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">Child</h2>
                <span className="material-symbols-outlined cursor-pointer text-sm text-slate-400 hover:text-primary">filter_list</span>
              </div>
              <div className="space-y-1">
                <label className="flex cursor-pointer items-center rounded-lg bg-primary/10 p-2 font-medium text-primary">
                  <input type="checkbox" defaultChecked className="mr-3 rounded border-gray-300 text-primary focus:ring-primary" />
                  <span>All Children</span>
                </label>
                <label className="flex cursor-pointer items-center rounded-lg p-2 text-slate-600 transition-colors hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-gray-800">
                  <input type="checkbox" className="mr-3 rounded border-gray-300 text-primary focus:ring-primary" />
                  <span>Leo</span>
                </label>
                <label className="flex cursor-pointer items-center rounded-lg p-2 text-slate-600 transition-colors hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-gray-800">
                  <input type="checkbox" className="mr-3 rounded border-gray-300 text-primary focus:ring-primary" />
                  <span>Maya</span>
                </label>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">Year</h2>
              <div className="space-y-1">
                <button type="button" className="w-full rounded-lg border-l-2 border-primary bg-primary/5 px-3 py-2 text-left text-sm font-medium text-primary">
                  2023 (Current)
                </button>
                <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-gray-50 dark:text-slate-400 dark:hover:bg-gray-800">
                  2022
                </button>
                <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-gray-50 dark:text-slate-400 dark:hover:bg-gray-800">
                  2021
                </button>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">Visibility</h2>
              <div className="space-y-1">
                <div className="flex items-center rounded-lg p-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="material-symbols-outlined mr-3 text-lg text-emerald-500">public</span>
                  <span>Shared with Co-parent</span>
                </div>
                <div className="flex items-center rounded-lg p-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="material-symbols-outlined mr-3 text-lg text-slate-400">lock</span>
                  <span>Private (Drafts)</span>
                </div>
              </div>
            </section>

            <section className="mt-8 border-t border-gray-100 pt-6 dark:border-gray-800">
              <div className="mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">favorite</span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">124 Memories Shared</span>
              </div>
              <p className="text-xs text-slate-500">Keeping the focus on the kids.</p>
            </section>
          </div>
        </aside>

        <section className="flex-1 overflow-y-auto bg-background-light p-6 dark:bg-background-dark lg:p-8">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Recent Memories</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A collection of shared moments and milestones.</p>
            </div>

            <div className="flex gap-2">
              <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-surface-dark dark:text-slate-300 dark:hover:bg-gray-800">
                <span className="material-symbols-outlined text-lg">sort</span>
                <span>Sort by Date</span>
              </button>
              <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-surface-dark dark:text-slate-300 dark:hover:bg-gray-800">
                <span className="material-symbols-outlined text-lg">view_module</span>
                <span>View</span>
              </button>
            </div>
          </div>

          <div className="columns-1 [column-gap:1.5rem] sm:columns-2 lg:columns-3 xl:columns-4">
            {MEMORY_ITEMS.map((item) => (
              <MemoryCard key={item.id} item={item} />
            ))}
          </div>

          <div className="mt-8 flex justify-center pb-8">
            <button type="button" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-primary">
              <span className="material-symbols-outlined">expand_more</span>
              <span>Load older memories</span>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
