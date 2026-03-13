/**
 * KidSchedule – BlogEngine
 */

import type {
  BlogPost,
  BlogCategory,
  BlogPage,
  SearchResult,
  BlogRecommendation,
  SearchDoc,
} from "@/lib";
import { createSearchAdapter } from "@/lib/search";

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

    const docs: SearchDoc[] = posts.map((post) => ({
      id: post.id,
      type: "blog",
      updatedAt: post.updatedAt ?? post.publishedAt,
      fields: {
        title: post.title,
        preview: post.preview,
        content: post.content,
        categories: post.categories.join(" "),
      },
    }));

    const adapter = createSearchAdapter();
    adapter.index(docs);

    const hits = adapter.search(query, {
      limit,
      keys: ["title", "preview", "content", "categories"],
      minMatchCharLength: 2,
    });

    const postById = new Map(posts.map((post) => [post.id, post]));

    return hits
      .map((hit) => {
        const post = postById.get(hit.id);
        if (!post) return null;

        return {
          post,
          relevanceScore: Math.round(hit.score * 100),
          highlightedPreview: highlightMatch(post.preview, query),
        } as SearchResult;
      })
      .filter((result): result is SearchResult => !!result);
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

/**
 * KidSchedule – BlogArticleEngine
 */

import type {
  ArticleReadingSession,
  ArticleEngagementMetric,
  ArticleWithMetadata,
} from "@/lib";
import { parseArticleContent } from "@/lib/content-parser";
import { load } from "cheerio";

// ─── Configuration ────────────────────────────────────────────────────────────

/** Scroll percentage threshold for marking article as "completed" */
const COMPLETION_THRESHOLD_PERCENT = 90;

/** Session timeout (ms): if no activity for this duration, session expires */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ─── DOM Parsing Utilities ────────────────────────────────────────────────────

/**
 * Extracts key takeaways from article by looking for:
 * 1. Explicit <strong> tags in bulleted lists
 * 2. First sentence of each h2 section
 * 3. Manual override via keyTakeaways parameter
 *
 * Complexity: O(content.length)
 * @param htmlContent Article HTML
 * @param maxTakeaways Max number to extract (default 5)
 * @returns Array of key takeaway strings
 */
function extractKeyTakeaways(htmlContent: string, maxTakeaways: number = 5): string[] {
  const takeaways: string[] = [];

  // Extract from <li><strong>...</strong>...</li> patterns
  const liRegex = /<li[^>]*>[^<]*<strong>([^<]+)<\/strong>([^<]*)/gi;
  let match;

  while ((match = liRegex.exec(htmlContent)) !== null && takeaways.length < maxTakeaways) {
    const strongText = match[1].trim();
    const restText = (match[2] ?? "").trim().substring(0, 50); // First 50 chars after strong tag
    takeaways.push(strongText + (restText ? ": " + restText : ""));
  }

  // If not enough, extract opening sentence of each h2 section
  if (takeaways.length < maxTakeaways) {
    const h2PairRegex = /<h2[^>]*>([^<]+)<\/h2>\s*<p[^>]*>([^.!?]+[.!?])/gi;
    while ((match = h2PairRegex.exec(htmlContent)) !== null && takeaways.length < maxTakeaways) {
      takeaways.push(match[2].trim());
    }
  }

  return takeaways.slice(0, maxTakeaways);
}

/**
 * Determines if reading session is complete (reached threshold or timeout).
 * Complexity: O(1)
 */
function isSessionComplete(
  scrollPercentage: number,
  timeSpentSeconds: number
): boolean {
  // Complete if scrolled to end OR spent sufficient time reading
  const scrollComplete = scrollPercentage >= COMPLETION_THRESHOLD_PERCENT;
  const timeComplete = timeSpentSeconds > 60; // At least 1 minute reading

  return scrollComplete || timeComplete;
}

/**
 * Generates a unique session ID using timestamp + random.
 * Format: `session-{timestamp}-{random}`
 */
function generateSessionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `session-${timestamp}-${random}`;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export class BlogArticleEngine {
  /**
   * @param post Original blog post
   * @param allPosts All available posts for recommendations
   * @param userReadHistory User's read post IDs for personalized recommendations
   * @returns Enriched article with metadata for display
   */
  enrichArticle(
    post: BlogPost,
    allPosts: BlogPost[],
    userReadHistory: string[] = []
  ): ArticleWithMetadata {
    // Extract structure (robust parser pipeline: HTML + Markdown -> HTML)
    const parsed = parseArticleContent(post.content);
    const toc = parsed.toc;
    const keyTakeaways = extractKeyTakeaways(parsed.html);

    // Generate recommendations using category + content match
    const relatedPosts = this.findRelatedPosts(post, allPosts, userReadHistory);

    // Read time (already calculated, but verify)
    const estimatedReadTime = post.readTimeMinutes || this.estimateReadTime(parsed.html);

    return {
      ...post,
      content: parsed.html,
      toc,
      relatedPosts,
      estimatedReadTime,
      keyTakeaways,
    };
  }

  /**
   * Returns a new reading session tracker for the article.
   * Used client-side to track scroll depth and time spent.
   *
   * @param postId Post being read
   * @param readerId Optional reader ID (anonymous if absent)
   * @returns Initial reading session object
   */
  createReadingSession(postId: string, readerId?: string): ArticleReadingSession {
    const now = new Date();
    return {
      sessionId: generateSessionId(),
      postId,
      readerId,
      startedAt: now,
      lastActivityAt: now,
      scrollPercentage: 0,
      isCompleted: false,
      timeSpentSeconds: 0,
    };
  }

  /**
   * Updates an in-progress reading session with scroll/time data.
   * Typical call: every 500ms (throttled) from scroll listener.
   *
   * @param session Current session
   * @param scrollPercent Current scroll depth 0–100
   * @returns Updated session
   */
  updateReadingSession(
    session: ArticleReadingSession,
    scrollPercent: number
  ): ArticleReadingSession {
    const now = new Date();
    const elapsedSeconds = Math.round(
      (now.getTime() - session.lastActivityAt.getTime()) / 1000
    );

    const updatedSession: ArticleReadingSession = {
      ...session,
      scrollPercentage: Math.max(session.scrollPercentage, scrollPercent),
      lastActivityAt: now,
      timeSpentSeconds: session.timeSpentSeconds + elapsedSeconds,
    };

    // Mark as completed if threshold reached
    if (isSessionComplete(updatedSession.scrollPercentage, updatedSession.timeSpentSeconds)) {
      updatedSession.isCompleted = true;
      updatedSession.completedAt = now;
    }

    return updatedSession;
  }

  /**
   * Calculates engagement metrics for a post based on sessions.
   * Aggregates views, completion rate, time spent, scroll depth.
   *
   * @param postId Post to analyze
   * @param sessions All reading sessions (filtered to this post server-side)
   * @returns Engagement metrics
   */
  calculateEngagementMetrics(postId: string, sessions: ArticleReadingSession[]): ArticleEngagementMetric {
    // Filter to this post
    const postSessions = sessions.filter((s) => s.postId === postId);

    if (postSessions.length === 0) {
      return {
        postId,
        viewCount: 0,
        uniqueViewers: 0,
        shareCount: 0,
        commentCount: 0,
        avgTimeSpentSeconds: 0,
        avgScrollPercentage: 0,
        completionRate: 0,
      };
    }

    // Count unique readers (by readerId or sessionId if anonymous)
    const uniqueReaders = new Set(
      postSessions.map((s) => s.readerId ?? s.sessionId)
    ).size;

    // Calculate averages
    const avgTimeSpent = Math.round(
      postSessions.reduce((sum, s) => sum + s.timeSpentSeconds, 0) / postSessions.length
    );

    const avgScroll = Math.round(
      postSessions.reduce((sum, s) => sum + s.scrollPercentage, 0) / postSessions.length
    );

    const completedCount = postSessions.filter((s) => s.isCompleted).length;
    const completionRate = Math.round((completedCount / postSessions.length) * 100);

    return {
      postId,
      viewCount: postSessions.length,
      uniqueViewers: uniqueReaders,
      shareCount: 0, // Tracked separately, updated externally
      commentCount: 0, // Tracked separately
      avgTimeSpentSeconds: avgTimeSpent,
      avgScrollPercentage: avgScroll,
      completionRate,
    };
  }

  /**
   * Determines progress bar width (%) based on reading session.
   * Used for the visual progress indicator at top of page.
   *
   * Complexity: O(1)
   *
   * @param session Reading session
   * @param estimatedMinutes Estimated read time in minutes
   * @returns Progress percentage 0–100
   */
  calculateProgressPercentage(
    session: ArticleReadingSession,
    estimatedMinutes: number
  ): number {
    // Weight scroll depth (70%) + time ratio (30%)
    const scrollComponent = session.scrollPercentage * 0.7;
    const timeRatio = Math.min(1, session.timeSpentSeconds / (estimatedMinutes * 60)) * 100;
    const timeComponent = timeRatio * 0.3;

    return Math.round(scrollComponent + timeComponent);
  }

  /**
   * Finds related posts for recommendations sidebar.
   * Scores by: category match (50%), content similarity (30%), engagement (20%).
   *
   * Complexity: O(P × C) where P = all posts, C = categories; typically O(P) for bounded C
   *
   * @param post Article being read
   * @param allPosts All available posts
   * @param readHistory User's previously-read post IDs (to exclude)
   * @param limit Max recommendations to return
   * @returns Recommended posts with reasoning
   */
  private findRelatedPosts(
    post: BlogPost,
    allPosts: BlogPost[],
    readHistory: string[] = [],
    limit: number = 3
  ): BlogRecommendation[] {
    const readSet = new Set(readHistory);
    const postWords = new Set(
      (post.title + " " + post.preview).toLowerCase().split(/\s+/)
    );

    const recommendations = allPosts
      .filter(
        (p) =>
          p.id !== post.id &&
          !readSet.has(p.id) &&
          p.categories.some((c) => post.categories.includes(c))
      )
      .map((candidate) => {
        // Category match: how many categories overlap
        const categoryMatch = candidate.categories.filter((c) =>
          post.categories.includes(c)
        ).length;
        const categoryScore = categoryMatch / Math.max(post.categories.length, 1);

        // Content similarity: word overlap in title/preview
        const candidateWords = (candidate.title + " " + candidate.preview)
          .toLowerCase()
          .split(/\s+/);
        const overlap = candidateWords.filter((w) => postWords.has(w)).length;
        const contentScore = Math.min(1, overlap / 4);

        // Engagement: boost popular posts
        const engagementScore = Math.min(1, (post.viewCount / 5000) * 0.5);

        const totalScore =
          categoryScore * 0.5 + contentScore * 0.3 + engagementScore * 0.2;

        const reason =
          categoryMatch > 0
            ? `Related to ${post.title.substring(0, 25)}…`
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
   * Estimates reading time in minutes based on word count.
   * Standard assumption: 200 words per minute.
   *
   * Complexity: O(content.length)
   *
   * @param content Article HTML/markdown content
   * @returns Estimated minutes (minimum 1)
   */
  private estimateReadTime(content: string): number {
    // Strip HTML tags and count words using DOM parser
    const text = load(content).text();
    const wordCount = text.trim().split(/\s+/).length;
    return Math.max(1, Math.round(wordCount / 200));
  }

  /**
   * Detects session inactivity/timeout.
   * Returns true if last activity > 30 minutes ago.
   *
   * Complexity: O(1)
   */
  isSessionExpired(session: ArticleReadingSession, now: Date = new Date()): boolean {
    const elapsedMs = now.getTime() - session.lastActivityAt.getTime();
    return elapsedMs > SESSION_TIMEOUT_MS;
  }

  /**
   * Formats reading statistics for display (e.g. "5 min read" or "90% complete").
   */
  formatReadingStats(session: ArticleReadingSession, estimatedMinutes: number): {
    timeSpent: string;
    estimatedRemaining: string;
    scrollPercent: string;
  } {
    const timeSpentMinutes = Math.round(session.timeSpentSeconds / 60);
    const remainingMinutes = Math.max(0, estimatedMinutes - timeSpentMinutes);

    return {
      timeSpent: `${timeSpentMinutes} min read`,
      estimatedRemaining:
        remainingMinutes === 0
          ? "Finished!"
          : `~${remainingMinutes} min left`,
      scrollPercent: `${Math.round(session.scrollPercentage)}%`,
    };
  }
}
