/**
 * KidSchedule – BlogEngine
 *
 * ALGORITHM OVERVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 * The blog system sorts, searches, and paginates posts across six content categories
 * (Custody Tips, Legal Advice, Emotional Wellness, Communication, Financial Planning).
 * The engine does NOT use external ML or ranking APIs – instead, it employs:
 *
 *   1. Multi-factor relevance scoring (recency, engagement, quality metrics)
 *   2. BM25-like full-text search with term frequency and field weighting
 *   3. Time-decay functions to keep recent posts higher ranked
 *   4. Category-aware filtering and pagination
 *   5. Reading history integration for personalized recommendations
 *   6. Read time estimation using word count normalization
 *
 * RANKING SYSTEM
 * ─────────────────────────────────────────────────────────────────────────────
 * Posts are scored by:
 *   • Recency Factor (30%)    – Time decay: e^(-λt) where λ ≈ 0.001
 *   • Engagement Factor (35%) – Views + shares + comments (normalized)
 *   • Search/Text Relevance (25%) – BM25 TF-IDF scoring if query provided, else category fit
 *   • Editorial Flag (10%)    – Manual featured flag from content team
 *
 * Featured post is always the highest-scoring post (or manually flagged post).
 *
 * SEARCH COMPLEXITY
 * ─────────────────────────────────────────────────────────────────────────────
 * • Per-post search scoring: O(query.length) + O(content.length) for tokenization
 *   In practice: O(1) fixed cost per post for typical queries/content.
 * • Full corpus search: O(P) where P = number of posts (~50–100 typical for blog)
 * • Sorting by relevance: O(P log P)
 * • Result: ~O(P log P), acceptable for interactive search < 100ms
 *
 * PAGINATION
 * ─────────────────────────────────────────────────────────────────────────────
 * • Window-based: O(page_size) to slice array
 * • Category filter before pagination: O(P) to filter, then slice
 * • Total: O(P) filter + O(page_size) slice ≈ ~O(1) for fixed page sizes
 *
 * TRADE-OFFS
 * ─────────────────────────────────────────────────────────────────────────────
 * • No inverted index – acceptable for <500 posts; larger blogs would use Elasticsearch
 * • No caching layer – assumes posts and engagement metrics retrieved fresh per request;
 *   for high traffic, add Redis or in-memory LRU cache
 * • Reading history in memory – for real app, fetch from database per parent
 * • No stemming/lemmatization – simple substring matching; advanced apps use NLP
 * • Engagement metrics normalized per-post – ties not disambiguated by comment quality,
 *   just count; could add weighted scoring (e.g., expert comments ++, spam –)
 */

import type { BlogPost, BlogCategory, BlogPage, SearchResult, BlogRecommendation } from "@/types";

// ─── Scoring Constants ─────────────────────────────────────────────────────────

/** Time decay factor for recency scoring. λ ≈ 0.001 means ~25% decay over 1000 days */
const RECENCY_DECAY_LAMBDA = 0.001;
const RECENCY_WEIGHT = 0.30;
const ENGAGEMENT_WEIGHT = 0.35;
const RELEVANCE_WEIGHT = 0.25;
const EDITORIAL_WEIGHT = 0.10;

/** Average reading speed in words per minute */
const WORDS_PER_MINUTE = 200;

/** Search result highlighting context (chars before/after match) */
const HIGHLIGHT_CONTEXT = 50;

// ─── Individual Scoring Functions ──────────────────────────────────────────────

/**
 * Scores a post based on publication recency using exponential time decay.
 * Recent posts score higher; posts older than 1 year decay significantly.
 *
 * Complexity: O(1)
 */
function scoreRecency(publishedAt: string, nowMs: number): number {
  const postMs = new Date(publishedAt).getTime();
  const ageMs = Math.max(0, nowMs - postMs);
  const ageDays = ageMs / (24 * 60 * 60 * 1000);

  // e^(-0.001 * ageDays) ranges from 1.0 (new) to ~0.37 (1 year)
  return Math.exp(-RECENCY_DECAY_LAMBDA * ageDays);
}

/**
 * Scores engagement (views, shares, comments) on 0–1 scale.
 * Normalizes across the corpus using max values.
 *
 * Complexity: O(P) to find max values per corpus (run once, cache results)
 */
function scoreEngagement(
  post: BlogPost,
  maxViews: number,
  maxShares: number,
  maxComments: number
): number {
  const totalEngagement = post.viewCount + post.shareCount * 2 + post.commentCount * 3;
  const maxTotal = maxViews + maxShares * 2 + maxComments * 3;

  if (maxTotal === 0) return 0.5; // Neutral default for new posts
  return Math.min(1, totalEngagement / maxTotal);
}

/**
 * Normalizes query against post content using BM25-like scoring.
 * Weights: title (3x), categories (2x), preview (1x), content (0.5x).
 *
 * Complexity: O(query.length + content.length) ≈ O(1) for typical inputs
 */
function scoreRelevance(
  query: string,
  post: BlogPost,
  categories?: BlogCategory[]
): number {
  if (!query) {
    // No query: score based on category match
    if (!categories || categories.length === 0) return 0.5;
    const matchCount = post.categories.filter((c) => categories.includes(c)).length;
    return Math.min(1, matchCount / post.categories.length);
  }

  const lowerQuery = query.toLowerCase();
  const tokens = lowerQuery.split(/\s+/).filter((t) => t.length > 0);
  let score = 0;

  for (const token of tokens) {
    const titleMatches = (post.title.toLowerCase().match(new RegExp(token, "g")) ?? []).length;
    const categoryMatch = post.categories.some((c) =>
      c.toLowerCase().includes(token)
    ) ? 1 : 0;
    const previewMatches = (post.preview.toLowerCase().match(new RegExp(token, "g")) ?? []).length;
    const contentMatches = (post.content.toLowerCase().match(new RegExp(token, "g")) ?? []).length;

    score +=
      titleMatches * 3 +
      categoryMatch * 2 +
      previewMatches * 1 +
      contentMatches * 0.5;
  }

  // Normalize to 0–1: cap at token count (perfect match = 1 point per token)
  return Math.min(1, score / Math.max(tokens.length, 1));
}

/**
 * Calculates reading time in minutes based on word count.
 * Assumes ~200 words per minute for average English reader.
 *
 * Complexity: O(content.length)
 */
function estimateReadTime(content: string): number {
  // Count words: non-whitespace sequences separated by whitespace
  const wordCount = content.trim().split(/\s+/).length;
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

/**
 * Extracts context around matching query term for highlighted preview.
 * Returns up to 150 chars with term bolded.
 *
 * Complexity: O(text.length)
 */
function highlightMatch(text: string, query: string): string {
  if (!query) return text.substring(0, 150);

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);

  if (idx === -1) return text.substring(0, 150);

  const start = Math.max(0, idx - HIGHLIGHT_CONTEXT);
  const end = Math.min(text.length, idx + query.length + HIGHLIGHT_CONTEXT);
  const context = text.substring(start, end);
  const highlighted = context.replace(
    new RegExp(`(${query})`, "gi"),
    "**$1**"
  );

  return highlighted.length > 150 ? highlighted.substring(0, 147) + "..." : highlighted;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export class BlogEngine {
  /**
   * Computes comprehensive relevance score for a single post.
   * Combines recency (30%), engagement (35%), relevance (25%), editorial (10%).
   *
   * Complexity: O(1) if max values pre-computed, else O(P) for max calculation.
   *
   * @param post The post to score
   * @param options Scoring context (query, categories, now, engagement stats)
   * @returns Composite score 0–100
   */
  scorePost(
    post: BlogPost,
    options: {
      query?: string;
      categories?: BlogCategory[];
      now?: Date;
      maxEngagementStats?: { views: number; shares: number; comments: number };
    } = {}
  ): number {
    const now = (options.now ?? new Date()).getTime();
    const maxStats = options.maxEngagementStats ?? { views: 1000, shares: 100, comments: 50 };

    // Compute individual factors
    const recencyScore = scoreRecency(post.publishedAt, now);
    const engagementScore = scoreEngagement(
      post,
      maxStats.views,
      maxStats.shares,
      maxStats.comments
    );
    const relevanceScore = scoreRelevance(options.query ?? "", post, options.categories);
    const editorialScore = post.isFeatured ? 1 : 0;

    // Weighted composite (normalized to 0–100)
    const composite =
      recencyScore * RECENCY_WEIGHT +
      engagementScore * ENGAGEMENT_WEIGHT +
      relevanceScore * RELEVANCE_WEIGHT +
      editorialScore * EDITORIAL_WEIGHT;

    return Math.round(composite * 100);
  }

  /**
   * Returns featured post for hero section – the highest-scoring post.
   * Prioritizes manually flagged posts, then falls back to ranking.
   *
   * Complexity: O(P) to find max.
   *
   * @param posts All available posts
   * @returns The highest-ranking post (for featured section)
   */
  getFeaturedPost(posts: BlogPost[], now: Date = new Date()): BlogPost | null {
    if (posts.length === 0) return null;

    // Check for manually featured post
    const manualFeatured = posts.find((p) => p.isFeatured);
    if (manualFeatured) return manualFeatured;

    // Otherwise, score all posts and return top
    const maxStats = this.computeEngagementStats(posts);
    const scored = posts.map((post) => ({
      post,
      score: this.scorePost(post, { maxEngagementStats: maxStats, now }),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.post ?? null;
  }

  /**
   * Retrieves a paginated list of posts, optionally filtered by categories.
   *
   * Complexity: O(P) to filter + O(page_size) to slice.
   *            In practice: O(P log P) if sorting by rank required.
   *
   * @param posts All posts
   * @param pageNumber Page number (1-indexed)
   * @param pageSize Items per page
   * @param filters Category filters (empty = all)
   * @param sort "recent" | "engagement" | "relevant"
   * @param now Reference time for scoring
   * @returns BlogPage with pagination metadata
   */
  getPage(
    posts: BlogPost[],
    {
      pageNumber = 1,
      pageSize = 6,
      categories = [],
      sort = "recent",
    }: {
      pageNumber?: number;
      pageSize?: number;
      categories?: BlogCategory[];
      sort?: "recent" | "engagement" | "relevant";
      now?: Date;
    } = {}
  ): BlogPage {
    // Filter by categories if provided
    let filtered = posts;
    if (categories.length > 0) {
      filtered = posts.filter((p) =>
        categories.some((cat) => p.categories.includes(cat))
      );
    }

    // Sort
    const maxStats = this.computeEngagementStats(filtered);
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "engagement") {
        return (
          scoreEngagement(b, maxStats.views, maxStats.shares, maxStats.comments) -
          scoreEngagement(a, maxStats.views, maxStats.shares, maxStats.comments)
        );
      }
      if (sort === "relevant") {
        return (
          scoreRelevance("", b, categories) -
          scoreRelevance("", a, categories)
        );
      }
      // default "recent"
      return (
        new Date(b.publishedAt).getTime() -
        new Date(a.publishedAt).getTime()
      );
    });

    // Paginate
    const totalPages = Math.ceil(sorted.length / pageSize);
    const validPage = Math.max(1, Math.min(pageNumber, totalPages));
    const startIdx = (validPage - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    const paged = sorted.slice(startIdx, endIdx);

    return {
      posts: paged,
      pageNumber: validPage,
      totalPages,
      totalPostCount: sorted.length,
      hasNextPage: validPage < totalPages,
      hasPreviousPage: validPage > 1,
    };
  }

  /**
   * Full-text search across all posts.
   * Returns results sorted by relevance (0–100).
   *
   * Complexity: O(P log P) for search and sort.
   *
   * @param posts All posts to search
   * @param query Search query string
   * @param limit Max results to return
   * @returns Array of SearchResult sorted by relevance
   */
  searchPosts(posts: BlogPost[], query: string, limit: number = 10): SearchResult[] {
    if (!query.trim()) return [];

    const results = posts
      .map((post) => {
        const relevanceScore = scoreRelevance(query, post);
        return {
          post,
          relevanceScore: Math.round(relevanceScore * 100),
          highlightedPreview: highlightMatch(post.preview, query),
        };
      })
      .filter((r) => r.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);

    return results;
  }

  /**
   * Estimates reading time for a post.
   * Populates post.readTimeMinutes if not already set.
   *
   * Complexity: O(content.length) ≈ O(1) for typical articles.
   *
   * @param post Post to estimate
   * @returns Reading time in minutes
   */
  estimateReadTime(post: BlogPost): number {
    return post.readTimeMinutes || estimateReadTime(post.content);
  }

  /**
   * Generates personalized recommendations for a given post.
   * Considers category similarity and reading history.
   *
   * Complexity: O(P) to score all posts.
   *
   * @param post The post being read (for reference)
   * @param allPosts All available posts to recommend from
   * @param readHistory IDs of posts this user has already read
   * @param limit Max recommendations
   * @returns Recommended posts, sorted by relevance
   */
  getRecommendations(
    post: BlogPost,
    allPosts: BlogPost[],
    readHistory: string[] = [],
    limit: number = 3
  ): BlogRecommendation[] {
    const readSet = new Set(readHistory);

    // Score all posts for similarity
    const recommendations = allPosts
      .filter((p) => p.id !== post.id && !readSet.has(p.id))
      .map((candidate) => {
        // Category overlap (higher = more relevant)
        const categoryMatch = candidate.categories.filter((c) =>
          post.categories.includes(c)
        ).length;
        const categoryScore = categoryMatch / Math.max(post.categories.length, 1);

        // Content similarity (title/preview keyword overlap)
        const postWords = new Set(
          (post.title + " " + post.preview).toLowerCase().split(/\s+/)
        );
        const candidateWords = (
          candidate.title + " " + candidate.preview
        ).toLowerCase().split(/\s+/);
        const contentOverlap = candidateWords.filter((w) => postWords.has(w)).length;
        const contentScore = Math.min(1, contentOverlap / 5);

        // Engagement boost (popular posts ranked higher)
        const engagementScore = Math.min(1, (candidate.viewCount / 5000 + candidate.shareCount / 100) / 2);

        const totalScore = categoryScore * 0.5 + contentScore * 0.3 + engagementScore * 0.2;

        const reason =
          categoryMatch > 0
            ? `Similar to ${post.title.substring(0, 30)}…`
            : `Popular in ${candidate.categories[0] ?? "Featured"}`;

        return {
          post: candidate,
          reason,
          score: Math.round(totalScore * 100),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return recommendations;
  }

  /**
   * Internal helper: computes max engagement values across corpus.
   * Used to normalize engagement scores.
   *
   * Complexity: O(P)
   */
  private computeEngagementStats(posts: BlogPost[]): { views: number; shares: number; comments: number } {
    let maxViews = 1;
    let maxShares = 1;
    let maxComments = 1;

    for (const post of posts) {
      maxViews = Math.max(maxViews, post.viewCount);
      maxShares = Math.max(maxShares, post.shareCount);
      maxComments = Math.max(maxComments, post.commentCount);
    }

    return { views: maxViews, shares: maxShares, comments: maxComments };
  }
}

// ─── Mock Data Generator ──────────────────────────────────────────────────────

/**
 * Creates realistic mock blog posts for development and Storybook.
 */
export function createMockBlogPosts(count: number = 12, now: Date = new Date()): BlogPost[] {
  const categories: BlogCategory[] = [
    "custody_tips",
    "legal_advice",
    "emotional_wellness",
    "communication",
    "financial_planning",
  ];

  const authors = [
    { name: "Dr. Emily Chen", title: "Child Psychologist" },
    { name: "Michael Torres", title: "Family Law Attorney" },
    { name: "Sarah Liu", title: "Licensed Counselor" },
    { name: "James Williams", title: "Financial Advisor" },
  ];

  const titles = [
    "Building a Successful 2-2-3 Schedule",
    "Understanding Your Rights: Moving Out of State",
    "The Art of Parallel Parenting",
    "5 Texts You Should Never Send",
    "Managing Shared Expenses Without Conflict",
    "Introducing a New Partner to Your Kids",
    "Navigating Summer Break: A Guide to Stress-Free Co-Parenting",
    "Holiday Custody: Planning for Success",
    "Co-Parenting Communication Red Flags",
    "Creating a Child Support agreement Both Parents Accept",
    "Minimizing Custody Disputes Before Court",
    "Building Trust After Separation",
  ];

  const posts: BlogPost[] = [];
  for (let i = 0; i < count; i++) {
    const publishedDaysAgo = Math.floor(Math.random() * 90);
    const publishedAt = new Date(now);
    publishedAt.setDate(publishedAt.getDate() - publishedDaysAgo);

    const author = authors[i % authors.length];
    const category = categories[i % categories.length];

    posts.push({
      id: `post-${i + 1}`,
      slug: titles[i % titles.length].toLowerCase().replace(/\s+/g, "-"),
      title: titles[i % titles.length],
      preview:
        "Is the 2-2-3 custody schedule right for your family? We break down the pros, cons, and how to make frequent transitions easier for younger children.",
      content:
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. " +
        "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. ".repeat(10),
      categories: [category],
      author,
      featuredImageUrl:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuDkDFdEE7lfB3xzEgZQLzvqMGD6mMcwvFvbCqh_wkvlPnks11vOHvHG4Am1MF2qc9baTwAKbTCNBeAZBKfnD3D4n8-90FNdS6ZlNDusGwlZ42D4YpJHPK5-iVurf-fzSj6Fgfpcl8eOPdsrUPfkPrLB8iT6r2SUNszgj9qqOZD3apP3J4txvRJaZUbBkJixqc3xj4wfzWLCp9tfec_w9wDGtBTmvj-Up4D4FijaxLRzn9cbW2qshs1S0HWtn1B9ky2uAxzCrYJ5CKk",
      publishedAt: publishedAt.toISOString(),
      readTimeMinutes: 5 + Math.floor(Math.random() * 10),
      viewCount: Math.floor(Math.random() * 5000),
      shareCount: Math.floor(Math.random() * 200),
      commentCount: Math.floor(Math.random() * 50),
      isFeatured: i === 0, // First post is featured
    });
  }

  return posts;
}
