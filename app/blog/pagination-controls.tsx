"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface PaginationControlsProps {
  pageNumber: number;
  totalPages: number;
}

export function PaginationControls({ pageNumber, totalPages }: Readonly<PaginationControlsProps>) {
  const basePages = Array.from({ length: Math.min(totalPages, 3) }, (_, idx) => idx + 1);
  const pages: Array<number | "..."> = totalPages > 5 ? [...basePages, "...", totalPages] : basePages;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("page", page.toString());
    router.push(`${pathname}?${nextParams.toString()}`);
  };

  return (
    <div className="flex justify-center mt-16">
      <nav className="flex items-center gap-1">
        <button
          onClick={() => goToPage(pageNumber - 1)}
          disabled={pageNumber === 1}
          className="p-2 text-slate-400 hover:text-slate-600 disabled:opacity-50"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>

        {pages.map((page) =>
          page === "..." ? (
            <span key="ellipsis" className="w-10 h-10 flex items-center justify-center text-slate-400">
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => goToPage(page)}
              className={`w-10 h-10 flex items-center justify-center rounded-lg font-medium transition-colors ${
                pageNumber === page
                  ? "bg-primary text-white"
                  : "hover:bg-slate-100 text-slate-600"
              }`}
            >
              {page}
            </button>
          )
        )}

        <button
          onClick={() => goToPage(pageNumber + 1)}
          disabled={pageNumber === totalPages}
          className="p-2 text-slate-600 hover:text-primary disabled:opacity-50"
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </nav>
    </div>
  );
}
