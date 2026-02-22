import Fuse from "fuse.js";
import type { SearchAdapter as SearchAdapterContract, SearchDoc, SearchHit, SearchOptions } from "@/types";
import { SEARCH_BACKEND, SEARCH_DEFAULTS } from "@/lib/infrastructure/search-config";

export type SearchAdapter = SearchAdapterContract;

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function tokenize(query: string): string[] {
  return normalizeQuery(query)
    .split(/\s+/)
    .filter((token) => token.length >= SEARCH_DEFAULTS.minMatchCharLength);
}

function docFieldText(doc: SearchDoc, keys: string[]): string {
  return keys.map((key) => doc.fields[key] ?? "").join(" ").toLowerCase();
}

function computeTokenOverlapScore(queryTokens: string[], text: string): number {
  if (queryTokens.length === 0) return 0;
  let matches = 0;
  for (const token of queryTokens) {
    if (text.includes(token)) matches += 1;
  }
  return matches / queryTokens.length;
}

export class FuseSearchAdapter implements SearchAdapter {
  private docs: ReadonlyArray<SearchDoc> = [];
  private fuse: Fuse<SearchDoc> | null = null;

  index(docs: ReadonlyArray<SearchDoc>): void {
    this.docs = docs;
    this.fuse = null;
  }

  search(query: string, opts: SearchOptions = {}): ReadonlyArray<SearchHit> {
    const normalized = normalizeQuery(query);
    if (!normalized) return [];

    const keys = opts.keys ?? [];
    const minMatchCharLength = opts.minMatchCharLength ?? SEARCH_DEFAULTS.minMatchCharLength;
    if (normalized.length < minMatchCharLength) return [];

    const threshold = opts.threshold ?? SEARCH_DEFAULTS.threshold;
    const limit = opts.limit ?? SEARCH_DEFAULTS.limit;

    this.fuse ??= new Fuse(this.docs as SearchDoc[], {
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength,
      threshold,
      keys: keys.length > 0 ? keys : ["fields.title", "fields.body", "fields.location", "fields.tags", "fields.participant"],
    });

    const tokens = tokenize(normalized);

    const results = this.fuse
      .search(normalized, { limit })
      .map((result) => {
        const score = result.score ?? 1;
        const baseScore = 1 - Math.min(1, score);

        // Tie-breakers: exact prefix > token overlap > recency
        const targetField = result.item.fields.title ?? result.item.fields.body ?? "";
        const lowerTarget = targetField.toLowerCase();
        const prefixBoost = lowerTarget.startsWith(normalized) ? 0.2 : 0;
        const overlapBoost = computeTokenOverlapScore(tokens, docFieldText(result.item, keys.length > 0 ? keys : Object.keys(result.item.fields))) * 0.15;
        const recencyBoost = result.item.updatedAt ? 0.05 : 0;

        return {
          id: result.item.id,
          type: result.item.type,
          score: Math.max(0, Math.min(1, baseScore + prefixBoost + overlapBoost + recencyBoost)),
        } as SearchHit;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }
}

export class TrigramSearchAdapter implements SearchAdapter {
  private docs: ReadonlyArray<SearchDoc> = [];

  index(docs: ReadonlyArray<SearchDoc>): void {
    // Dev fallback for no DB path.
    this.docs = docs;
  }

  search(query: string, opts: SearchOptions = {}): ReadonlyArray<SearchHit> {
    const normalized = normalizeQuery(query);
    if (!normalized) return [];

    // In production (PostgreSQL + pg_trgm):
    // CREATE EXTENSION IF NOT EXISTS pg_trgm;
    // CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_title_trgm
    //   ON events USING GIN (lower(title) gin_trgm_ops);
    //
    // Example SQL pattern:
    // SELECT id,
    //        GREATEST(similarity(lower(title), :q), similarity(lower(coalesce(notes,'')), :q)) AS score
    // FROM events
    // WHERE family_id = :familyId
    //   AND (
    //     lower(title) ILIKE '%' || :q || '%'
    //     OR similarity(lower(title), :q) > 0.2
    //     OR similarity(lower(coalesce(notes,'')), :q) > 0.2
    //   )
    // ORDER BY score DESC, updated_at DESC
    // LIMIT :limit;

    // Development fallback: lightweight token-based scoring over in-memory docs.
    const keys = opts.keys ?? [];
    const limit = opts.limit ?? SEARCH_DEFAULTS.limit;
    const tokens = tokenize(normalized);

    const hits = this.docs
      .map((doc) => {
        const text = docFieldText(doc, keys.length > 0 ? keys : Object.keys(doc.fields));
        const prefix = text.startsWith(normalized) ? 1 : 0;
        const overlap = computeTokenOverlapScore(tokens, text);
        const contains = text.includes(normalized) ? 1 : 0;
        const score = prefix * 0.5 + overlap * 0.35 + contains * 0.15;

        return {
          id: doc.id,
          type: doc.type,
          score,
        } as SearchHit;
      })
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return hits;
  }
}

export function createSearchAdapter(): SearchAdapter {
  if (SEARCH_BACKEND === "trigram") return new TrigramSearchAdapter();
  return new FuseSearchAdapter();
}
