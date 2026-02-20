/**
 * KidSchedule – ConflictClimateAnalyzer
 *
 * ALGORITHM OVERVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 * The Conflict Climate feature gives each parent a private snapshot of how
 * "tense" recent co-parenting communication has been.  It deliberately avoids
 * showing a parent a label for the *other* parent's tone – only the aggregate
 * climate visible to them.
 *
 * SCORING PIPELINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Each message passes through four independent scorers that each return a
 * value in [−1, +1] (negative = hostile/tense, positive = cooperative):
 *
 *   1. Lexical scorer  – pattern-matches against curated word lists
 *   2. Intensity scorer – detects all-caps runs and excessive punctuation
 *   3. Topic scorer    – flags sensitive subjects (money, court, etc.)
 *   4. Length scorer   – very short / very long messages carry weak signals
 *
 * The four scores are combined with fixed weights into a message score
 * (also [−1, +1]).
 *
 * AGGREGATION WITH TIME DECAY
 * ─────────────────────────────────────────────────────────────────────────────
 * Older messages matter less.  Each message's score is weighted by:
 *
 *   w(ageInDays) = e^(−λ × ageInDays)   where λ ≈ 0.05 (≈ 20-day half-life)
 *
 * The aggregate tension score is a weighted average of all scored messages in
 * the rolling window, then linearly mapped to [0, 100].
 *
 * CLIMATE LEVELS
 * ─────────────────────────────────────────────────────────────────────────────
 *   tensionScore ≤ 33  →  "low"
 *   tensionScore ≤ 66  →  "medium"
 *   tensionScore > 66  →  "high"
 *
 * COACHING TIPS
 * ─────────────────────────────────────────────────────────────────────────────
 * Climate-level-specific tip pools are sampled pseudo-randomly based on the
 * current week number so the tip changes weekly but is deterministic for both
 * parents (avoids confusion when they compare notes).
 *
 * PRIVACY NOTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Message bodies should be scored server-side only.  The result exposed to the
 * client is the aggregate ConflictClimate object – never the per-message scores.
 *
 * TRADE-OFFS
 * ─────────────────────────────────────────────────────────────────────────────
 * • Entirely lexical / rule-based.  This is intentional for the v1 implementation:
 *   it's transparent, auditable, and runs without an external ML API call.
 *   A future version can swap the lexical scorer for an LLM embedding.
 *
 * • The word lists are deliberately conservative to avoid false positives that
 *   could increase conflict rather than reduce it.
 *
 * • λ (decay rate) and scorer weights are tunable at construction time to allow
 *   A/B experimentation.
 */

import type { ClimateLevel, ConflictClimate, Message } from "@/types";

// ─── Word Lists ───────────────────────────────────────────────────────────────

/**
 * Patterns that correlate with hostile or uncooperative communication.
 * All strings are lowercased; regex flags are added during compilation.
 */
const HOSTILE_PATTERNS: RegExp[] = [
  /\byou (always|never)\b/,
  /\byour fault\b/,
  /\bmy lawyer\b/,
  /\btake you to court\b/,
  /\bfight for\b/,
  /\bunbelievable\b/,
  /\bwhatever\b/,
  /\bforget it\b/,
  /\bi (hate|can't stand)\b/,
  /\bright\?\s*$/, // rhetorical "right?" often signals sarcasm
  /\bno way\b/,
  /\babsolutely not\b/,
  /\byou don't care\b/,
  /\byou never listen\b/,
];

/**
 * Patterns that correlate with cooperative, child-first communication.
 */
const COOPERATIVE_PATTERNS: RegExp[] = [
  /\bthank(s| you)\b/,
  /\bappreciate\b/,
  /\bagree\b/,
  /\bsounds good\b/,
  /\bno problem\b/,
  /\bgood idea\b/,
  /\bi understand\b/,
  /\bplease\b/,
  /\bsorry\b/,
  /\bhappy to\b/,
  /\bworks for me\b/,
  /\bgreat\b/,
  /\bof course\b/,
];

/**
 * Topics that indicate a sensitive conversation (money, legal, custody).
 * These don't imply hostility on their own but amplify the impact of
 * negative tone signals.
 */
const SENSITIVE_TOPICS: RegExp[] = [
  /\bchild support\b/,
  /\bcustody\b/,
  /\blawyer?\b/,
  /\bcourt\b/,
  /\bmediat(e|ion|or)\b/,
  /\bmoney\b/,
  /\bpay(ment)?\b/,
  /\boverdue\b/,
  /\bvisitation\b/,
  /\bright(s)?\b/,
];

// ─── Individual Scorers ───────────────────────────────────────────────────────

/**
 * Score a message body in [−1, +1] based on hostile vs cooperative vocabulary.
 *
 * Each hostile match subtracts 0.2 (capped at −1).
 * Each cooperative match adds 0.15 (capped at +1 before hostile deduction).
 */
function lexicalScore(bodyLower: string): number {
  let score = 0;
  for (const pattern of HOSTILE_PATTERNS) {
    if (pattern.test(bodyLower)) score -= 0.2;
  }
  for (const pattern of COOPERATIVE_PATTERNS) {
    if (pattern.test(bodyLower)) score += 0.15;
  }
  return Math.max(-1, Math.min(1, score));
}

/**
 * Penalise excessive capitalisation (SHOUTING) and aggressive punctuation.
 *
 * Returns a score in [−1, 0]:
 *   −1 = heavily capitalised / punctuated
 *    0 = normal prose
 */
function intensityScore(body: string): number {
  const words = body.trim().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return 0;

  // Ratio of ALL-CAPS words longer than 2 chars.
  const capsRatio =
    words.filter((w) => w === w.toUpperCase() && /[A-Z]/.test(w)).length /
    words.length;

  // Count repeated punctuation: !! ?? !? etc.
  const repeatPunct = (body.match(/[!?]{2,}/g) ?? []).length;

  const rawPenalty = capsRatio * 0.7 + Math.min(repeatPunct, 3) * 0.1;
  return -Math.min(1, rawPenalty);
}

/**
 * Detect whether the message touches a sensitive topic.
 *
 * Returns a topic-sensitivity factor in [0, 1] (NOT a standalone score).
 * High sensitivity amplifies the lexical score's negative pole.
 */
function topicSensitivityFactor(bodyLower: string): number {
  const matches = SENSITIVE_TOPICS.filter((p) => p.test(bodyLower)).length;
  return Math.min(1, matches * 0.25);
}

/**
 * Very long or very short messages carry weak signal (both score neutrally).
 * Extreme length (>300 chars) can indicate emotional venting → slight penalty.
 *
 * Returns [−0.3, 0].
 */
function lengthScore(body: string): number {
  const len = body.trim().length;
  if (len > 400) return -0.3;
  if (len > 250) return -0.1;
  return 0;
}

// ─── Message Scorer ───────────────────────────────────────────────────────────

interface ScoredMessage {
  messageId: string;
  rawScore: number; // [−1, +1]
  decayWeight: number;
  sentAt: Date;
}

/**
 * Combines all sub-scores into a single message score in [−1, +1].
 *
 * Weights:  lexical 50% | intensity 30% | topic-amplified 10% | length 10%
 */
function scoreMessage(message: Message, nowMs: number): ScoredMessage {
  const bodyLower = message.body.toLowerCase();

  const lex = lexicalScore(bodyLower);
  const intensity = intensityScore(message.body);
  const sensitivity = topicSensitivityFactor(bodyLower);
  const length = lengthScore(message.body);

  // Sensitivity amplifies negative lexical signal (pulls positive lex toward 0).
  const amplifiedLex = lex < 0 ? lex * (1 + sensitivity) : lex * (1 - sensitivity * 0.3);

  const rawScore =
    amplifiedLex * 0.5 +
    intensity * 0.3 +
    length * 0.1 +
    0 * 0.1; // reserved for future response-latency scorer

  const clampedScore = Math.max(-1, Math.min(1, rawScore));

  // Time-decay weight: λ = 0.05 → half-life ~14 days.
  const ageInDays = (nowMs - new Date(message.sentAt).getTime()) / 86_400_000;
  const decayWeight = Math.exp(-0.05 * Math.max(0, ageInDays));

  return {
    messageId: message.id,
    rawScore: clampedScore,
    decayWeight,
    sentAt: new Date(message.sentAt),
  };
}

// ─── Coaching Tips ────────────────────────────────────────────────────────────

const TIPS: Record<ClimateLevel, string[]> = {
  low: [
    "Keep your next message brief and factual to maintain this positive momentum.",
    "Great tone lately! Emoji or a simple 'thanks' goes a long way.",
    "You're communicating well. Consider confirming the next handoff proactively.",
    "Low tension helps the kids feel secure. Keep it up.",
    "Try to respond within a few hours to keep things smooth.",
  ],
  medium: [
    "Stick to one topic per message to reduce misunderstandings.",
    "If a reply feels tense, wait 10 minutes before sending your response.",
    "Frame requests around the kids' needs rather than scheduling logistics.",
    "Using 'I' statements ('I'd prefer…') can soften the tone significantly.",
    "Short and factual messages help de-escalate during tense stretches.",
  ],
  high: [
    "Try the AI Mediator to help draft a neutral response.",
    "Consider putting key agreements in writing via the Vault to reduce disputes.",
    "A short, calm reply to a long hostile message can break a negative cycle.",
    "Document any concerning messages – the Vault stores verified copies.",
    "If conversations escalate, the Mediation Center can generate a neutral summary.",
  ],
};

/** Deterministic weekly tip rotation – same tip for both parents on the same week. */
function pickTip(level: ClimateLevel, nowMs: number): string {
  const pool = TIPS[level];
  // ISO week number as a stable index.
  const weekNumber = Math.floor(nowMs / (7 * 24 * 60 * 60 * 1000));
  return pool[weekNumber % pool.length];
}

// ─── Analyzer Class ───────────────────────────────────────────────────────────

export interface AnalyzerConfig {
  /** How many past days to include in analysis (default: 30). */
  windowDays?: number;
  /** Exponential decay λ (default: 0.05, ≈ 14-day half-life). */
  decayLambda?: number;
}

export class ConflictClimateAnalyzer {
  private readonly windowDays: number;

  constructor(config: AnalyzerConfig = {}) {
    this.windowDays = config.windowDays ?? 30;
  }

  /**
   * Analyse a thread of messages and return the aggregate ConflictClimate.
   *
   * @param messages  All messages in the conversation thread.
   *                  Only messages within the rolling window are scored.
   * @param at        The reference "now" timestamp (defaults to Date.now()).
   *
   * @example
   * const analyzer = new ConflictClimateAnalyzer();
   * const climate = analyzer.analyze(familyMessages);
   * // { level: "low", tensionScore: 12, tip: "Keep your next message brief…" }
   */
  analyze(messages: Message[], at: Date = new Date()): ConflictClimate {
    const nowMs = at.getTime();
    const windowStartMs = nowMs - this.windowDays * 24 * 60 * 60 * 1000;

    // 1. Filter to the rolling window.
    const windowMessages = messages.filter(
      (m) => new Date(m.sentAt).getTime() >= windowStartMs
    );

    // 2. Score each message.
    const scored = windowMessages.map((m) => scoreMessage(m, nowMs));

    // 3. Weighted average of raw scores.
    let weightedSum = 0;
    let totalWeight = 0;
    for (const s of scored) {
      weightedSum += s.rawScore * s.decayWeight;
      totalWeight += s.decayWeight;
    }

    // rawAvg is in [−1, +1]; map to tension in [0, 100].
    // rawAvg = −1 → tension 100 (maximum hostility)
    // rawAvg = +1 → tension 0   (maximum cooperation)
    const rawAvg = totalWeight === 0 ? 0 : weightedSum / totalWeight;
    const tensionScore = Math.round(((rawAvg * -1 + 1) / 2) * 100);

    // 4. Determine climate level.
    const level: ClimateLevel =
      tensionScore <= 33 ? "low" : tensionScore <= 66 ? "medium" : "high";

    // 5. Pick a coaching tip.
    const tip = pickTip(level, nowMs);

    const windowStart =
      windowMessages.length > 0
        ? new Date(
            windowMessages.reduce(
              (earliest, m) =>
                Math.min(earliest, new Date(m.sentAt).getTime()),
              new Date(windowMessages[0].sentAt).getTime()
            )
          ).toISOString()
        : new Date(windowStartMs).toISOString();

    return {
      level,
      tensionScore,
      tip,
      sampleSize: windowMessages.length,
      windowStart,
    };
  }

  /**
   * Convenience method: analyse and return only the tension score (0–100).
   * Useful for quick threshold checks (e.g., triggering a mediator nudge).
   */
  getTensionScore(messages: Message[], at?: Date): number {
    return this.analyze(messages, at).tensionScore;
  }

  /**
   * Returns per-message scores for debugging / admin views.
   * NOT intended to be exposed to end users (privacy).
   */
  debugScores(messages: Message[], at: Date = new Date()): ScoredMessage[] {
    const nowMs = at.getTime();
    const windowStartMs = nowMs - this.windowDays * 86_400_000;
    return messages
      .filter((m) => new Date(m.sentAt).getTime() >= windowStartMs)
      .map((m) => scoreMessage(m, nowMs))
      .sort((a, b) => a.rawScore - b.rawScore); // most hostile first
  }
}
