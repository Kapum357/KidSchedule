/**
 * KidSchedule – BlogArticleEngine
 *
 * ALGORITHM OVERVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 * The article reading system tracks user engagement (scroll depth, time spent),
 * extracts article structure (TOC), aggregates analytics, and recommends related
 * content. Designed for individual post views following the BlogEngine list page.
 *
 * KEY FEATURES:
 * • Reading progress tracking (scroll %, time spent)
 * • Table of contents generation from HTML headings
 * • Engagement metrics aggregation (views, shares, completion rate)
 * • Related article recommendations using category + content similarity
 * • Key takeaways extraction from article highlights
 * • Reading session management (session storage, analytics)
 *
 * COMPLEXITY ANALYSIS:
 * • TOC extraction:     O(H) where H = number of headings (~10–30 typical)
 * • Engagement metrics: O(1) if cached, else O(S) for session aggregation
 * • Recommendations:    O(P × C) where P = all posts, C = categories (~50P typical)
 * • Reading tracking:   O(1) per scroll event (throttled to 500ms intervals)
 */

import type {
  BlogPost,
  ArticleReadingSession,
  ArticleEngagementMetric,
  ArticleWithMetadata,
  BlogRecommendation,
} from "@/types";
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
   * Prepares a blog post for detailed viewing by enriching with metadata.
   * Generates TOC, extracts takeaways, estimates read time, and finds recommendations.
   *
   * Complexity: O(H + P×C) where H = headings, P = posts, C = categories
   *
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
   * Complexity: O(1)
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
   * Complexity: O(1)
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
   * Complexity: O(S) where S = number of sessions for this post
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
   *
   * Complexity: O(1)
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

// ─── Mock Data Generator ──────────────────────────────────────────────────────

/**
 * Creates a sample reading session for testing/demo.
 */
export function createMockReadingSession(
  postId: string = "post-1",
  readerId?: string
): ArticleReadingSession {
  const now = new Date();
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

  return {
    sessionId: generateSessionId(),
    postId,
    readerId,
    startedAt: fifteenMinutesAgo,
    lastActivityAt: new Date(now.getTime() - 30 * 1000), // 30 sec ago
    scrollPercentage: Math.floor(Math.random() * 100),
    isCompleted: Math.random() > 0.5,
    completedAt: Math.random() > 0.5 ? now : undefined,
    timeSpentSeconds: 15 * 60,
  };
}

/**
 * Creates sample reading sessions for an article.
 */
export function createMockReadingSessions(
  postId: string,
  count: number = 5
): ArticleReadingSession[] {
  const sessions: ArticleReadingSession[] = [];

  for (let i = 0; i < count; i++) {
    sessions.push(
      createMockReadingSession(postId, i === 0 ? undefined : `reader-${i}`)
    );
  }

  return sessions;
}
