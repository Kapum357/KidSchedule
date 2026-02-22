import type { SearchBackend } from "@/types";

const DEFAULT_BACKEND: SearchBackend = "fuse";

function parseBackend(value: string | undefined): SearchBackend {
  if (value === "trigram" || value === "fuse") return value;
  return DEFAULT_BACKEND;
}

export const SEARCH_BACKEND: SearchBackend = parseBackend(process.env.SEARCH_BACKEND);

export const SEARCH_DEFAULTS = {
  threshold: 0.38,
  minMatchCharLength: 2,
  limit: 20,
  debounceMs: 250,
} as const;
