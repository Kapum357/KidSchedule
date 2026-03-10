/**
 * KidSchedule – MediationAnalyzer
 *
 * ALGORITHM OVERVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 * The mediation system detects escalating patterns in co-parenting communication
 * and flags specific warning signals for human review. Unlike ConflictClimateAnalyzer
 * (which gives a single aggregate score), this system returns *individual* signals
 * with severity levels, topics, and context.
 *
 * THREE-TIER WARNING SYSTEM
 * ─────────────────────────────────────────────────────────────────────────────
 *   HIGH    (🔴)  – Extreme language (threats, accusations, character attacks)
 *   MEDIUM  (🟠)  – Escalating patterns (repeated caps, hostile topic, poor tone)
 *   LOW     (🟡)  – Minor flags (single caps word, sensitive topic mention)
 *
 * DETECTION RULES
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. ALL-CAPS RATIO > 40%  → "Aggressive Capitalization"
 * 2. Multiple exclamation/question marks (3+) → "Emotional Intensity"
 * 3. Certain hostile words (see HOSTILE_ESCALATIONS) → severity-based flag
 * 4. Sensitive topic + negative tone → "Sensitive Topic Escalation"
 * 5. Response latency anomaly (>48hrs after parent msg) → "Delayed Response Pattern"
 * 6. Message deletion/edit history → "Conversation Manipulation" (if tracked)
 *
 * TRADE-OFFS
 * ─────────────────────────────────────────────────────────────────────────────
 * • Private to each parent – one parent never sees flags unless both consent to
 *   mediation (privacy-first design).
 *
 * • False positives flagged at LOW – parents can dismiss with one click, no
 *   permanent record. This avoids "crying wolf" in high-conflict families.
 *
 * • Severity calibration is tunable – λ (decay), thresholds for caps ratio, etc.
 *   Can be A/B tested per family based on court order specifics.
 *
 * PERFORMANCE
 * ─────────────────────────────────────────────────────────────────────────────
 * • Per-message analysis: O(1) – fixed number of pattern checks
 * • Monthly scan (e.g., 200 messages): O(M) where M = messages
 * • Generating warning list: O(W log W) for sorting by severity and recency
 *   (W ≤ total warnings in period, typically <50)
 */

import type { Message } from "@/lib";

// ─── Public Types ────────────────────────────────────────────────────────────

export type WarningSeverity = "high" | "medium" | "low";

export type WarningCategory =
  | "aggressive_capitalization"    // ALL-CAPS overuse
  | "emotional_intensity"          // Excessive punctuation
  | "hostile_language"             // Specific hostile words
  | "sensitive_topic_escalation"   // Money/court/custody + bad tone
  | "delayed_response"             // Unusual response lag
  | "accusatory_language"          // "You always", "You never", etc.
  | "threat_language"              // Legal threats, etc. (rare but flagged)
  | "personal_attack"              // Character attacks (highest severity);

export interface WarningSignal {
  id: string;
  messageId: string;
  senderName: string;
  category: WarningCategory;
  severity: WarningSeverity;
  /** ISO datetime when the warning message was sent */
  flaggedAt: string;
  /** Human-readable summary */
  title: string;
  /** Detailed explanation for the user */
  description: string;
  /** The exact excerpt from the message that triggered the flag */
  excerpt: string;
  /** Timestamp of the message this flag is attached to */
  messageTimestamp: string;
  /** Has the user dismissed this flag? */
  dismissed: boolean;
  /** Timestamp when dismissed (if applicable) */
  dismissedAt?: string;
}

export interface CommunicationHealthScore {
  /** Overall health: 0–100 */
  score: number;
  /** Verbal description: "Excellent", "Stable", "At Risk", "Crisis" */
  status: "excellent" | "stable" | "at_risk" | "crisis";
  /** Percentage change vs previous period (e.g., +5%, -10%) */
  trendPercent: number;
  /** Last N days analysed */
  windowDays: number;
  /** Components of the score */
  factors: {
    toneFactor: number;            // weight: 40%
    responseTimelinessFactor: number; // weight: 20%
    topicRiskFactor: number;       // weight: 20%
    warningSignalFactor: number;   // weight: 20%
  };
}

// ─── Performance Constants ─────────────────────────────────────────────────

const SMALL_DATASET_THRESHOLD = 100;
const LARGE_DATASET_THRESHOLD = 500;
const RECENT_MESSAGE_COUNT = 100;
const MAX_ANALYSIS_TIME_MS = 2500;
const ANALYSIS_TIMEOUT_WARNING_MS = 1000;

// ─── Individual Detection Functions ───────────────────────────────────────────

const HOSTILE_ESCALATIONS = {
  high: [
    /\byou (always|never)\b/i,
    /\byou don't care\b/i,
    /\byou're a (bad parent|unfit)\b/i,
    /\bi'm taking you to court\b/i,
    /\byou're\s*(lying|a liar)\b/i,
    /\bthis is (fraud|abuse|kidnapping)\b/i,
  ],
  medium: [
    /\byour fault\b/i,
    /\byou're wrong\b/i,
    /\bi can't trust you\b/i,
    /\bthis is unacceptable\b/i,
    /\byou're being unreasonable\b/i,
    /\bmy lawyer says\b/i,
  ],
  low: [
    /\bunbelievable\b/i,
    /\bfrustrat(ed|ing)\b/i,
    /\bannoying\b/i,
    /\bdisappoint(ed|ing)\b/i,
  ],
};

const ACCUSATORY_PHRASES = [
  /\byou (always|never|constantly)\b/i,
  /\byou're\s*(not|refusing)\s*(putting|giving|allowing)\b/i,
  /\byou (don't|won't) let me\b/i,
  /\byou blocked me\b/i,
];

const THREAT_KEYWORDS = [
  /\bi'll (take|see|get) you in court\b/i,
  /\bi'm calling (dcfs|cps|the police)\b/i,
  /\byou'll (never|regret)\s*(see|speak to)\b/i,
];

// ─── Individual Detection Functions ───────────────────────────────────────────

/**
 * Detects ALL-CAPS usage > 40% of words.
 * Returns severity based on percentage.
 */
function detectCapitalization(body: string): { ratio: number; severity: WarningSeverity | null } {
  const words = body.trim().split(/\s+/).filter((w) => /[A-Z]/.test(w));
  if (words.length === 0) return { ratio: 0, severity: null };

  const capsWords = words.filter((w) => w === w.toUpperCase());
  const ratio = capsWords.length / words.length;

  if (ratio >= 0.5) return { ratio, severity: "high" };
  if (ratio >= 0.4) return { ratio, severity: "medium" };
  if (ratio >= 0.2) return { ratio, severity: "low" };
  return { ratio, severity: null };
}

/**
 * Detects excessive punctuation: 3+ consecutive ! or ?.
 */
function detectEmotionalIntensity(body: string): WarningSeverity | null {
  const repeatedPunct = (body.match(/[!?]{3,}/g) ?? []).length;
  const exclamations = (body.match(/!/g) ?? []).length;

  if (repeatedPunct > 0 || exclamations > 3) return "medium";
  if (exclamations > 1) return "low";
  return null;
}

/**
 * Detects hostile/aggressive language patterns.
 */
function detectHostileLanguage(
  body: string
): { severity: WarningSeverity | null; phrase: string } {
  const lower = body.toLowerCase();

  for (const phrase of THREAT_KEYWORDS) {
    if (phrase.test(lower)) return { severity: "high", phrase: new RegExp(phrase).exec(lower)?.[0] ?? "" };
  }

  for (const phrase of HOSTILE_ESCALATIONS.high) {
    if (phrase.test(lower)) return { severity: "high", phrase: new RegExp(phrase).exec(lower)?.[0] ?? "" };
  }

  for (const phrase of HOSTILE_ESCALATIONS.medium) {
    if (phrase.test(lower)) return { severity: "medium", phrase: new RegExp(phrase).exec(lower)?.[0] ?? "" };
  }

  for (const phrase of HOSTILE_ESCALATIONS.low) {
    if (phrase.test(lower)) return { severity: "low", phrase: new RegExp(phrase).exec(lower)?.[0] ?? "" };
  }

  return { severity: null, phrase: "" };
}

/**
 * Detects accusatory "you always" / "you never" patterns.
 */
function detectAccusatory(body: string): WarningSeverity | null {
  const lower = body.toLowerCase();
  for (const pattern of ACCUSATORY_PHRASES) {
    if (pattern.test(lower)) return "medium";
  }
  return null;
}

/**
 * Detects sensitive topic (custody/money/legal) combined with negative tone.
 * Requires both conditions to flag.
 */
function detectSensitiveTopicEscalation(body: string): WarningSeverity | null {
  const lower = body.toLowerCase();
  const sensitiveTopics = [/\bcustody\b/, /\bchild support\b/, /\blawyer\b/, /\bcourt\b/, /\bpayment\b/];
  const hasTopicMention = sensitiveTopics.some((t) => t.test(lower));

  if (!hasTopicMention) return null;

  const hasNegativeTone =
    HOSTILE_ESCALATIONS.high.some((p) => p.test(lower)) ||
    HOSTILE_ESCALATIONS.medium.some((p) => p.test(lower));

  if (hasNegativeTone) return "medium";
  const hasLowTone = HOSTILE_ESCALATIONS.low.some((p) => p.test(lower));
  if (hasLowTone) return "low";

  return null;
}

/**
 * Detects unusual response delays (>48 hours after prior message from other parent).
 * Requires message history for context.
 */
function detectDelayedResponse(
  currentMsg: Message,
  previousMsgFromOther: Message | undefined
): WarningSeverity | null {
  if (!previousMsgFromOther) return null;

  const delayMs =
    new Date(currentMsg.sentAt).getTime() - new Date(previousMsgFromOther.sentAt).getTime();
  const delayHours = delayMs / (60 * 60 * 1000);

  // Only flag if other person sent a question/request
  const isBold =
    /\?/.test(previousMsgFromOther.body) ||
    /please|need|can you|would you/.test(previousMsgFromOther.body.toLowerCase());

  if (delayHours > 48 && isBold) return "low";
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class MediationAnalyzer {
  /**
   * Analyse a single message and return any warning signals detected.
   *
   * Complexity: O(body.length × pattern_count) ≈ O(1) for typical messages.
   *
   * @param message       The message to analyse
   * @param senderName    Display name of sender (for UI)
   * @param priorMessages Optional history to detect delayed response patterns
   *
   * @returns List of warnings (0–3 per message typical)
   */
  analyzeSingleMessage(
    message: Message,
    senderName: string,
    priorMessages: Message[] = []
  ): WarningSignal[] {
    const warnings: WarningSignal[] = [];
    const body = message.body;

    // 1. Capitalization
    const caps = detectCapitalization(body);
    if (caps.severity) {
      warnings.push({
        id: `${message.id}-caps`,
        messageId: message.id,
        senderName,
        category: "aggressive_capitalization",
        severity: caps.severity,
        flaggedAt: message.sentAt,
        title: `${caps.severity === "high" ? "Excessive" : "Elevated"} Capitalization`,
        description:
          caps.severity === "high"
            ? `${Math.round(caps.ratio * 100)}% of words are in all caps. This can be perceived as shouting.`
            : `${Math.round(caps.ratio * 100)}% of words are in all caps. Consider using normal capitalization.`,
        excerpt: body.substring(0, 80),
        messageTimestamp: message.sentAt,
        dismissed: false,
      });
    }

    // 2. Emotional Intensity
    const intensity = detectEmotionalIntensity(body);
    if (intensity) {
      warnings.push({
        id: `${message.id}-intensity`,
        messageId: message.id,
        senderName,
        category: "emotional_intensity",
        severity: intensity,
        flaggedAt: message.sentAt,
        title: "Excessive Punctuation",
        description: "Multiple exclamation marks or question marks can escalate tension.",
        excerpt: body.substring(0, 80),
        messageTimestamp: message.sentAt,
        dismissed: false,
      });
    }

    // 3. Hostile Language
    const hostile = detectHostileLanguage(body);
    if (hostile.severity) {
      warnings.push({
        id: `${message.id}-hostile`,
        messageId: message.id,
        senderName,
        category: hostile.severity === "high" ? "threat_language" : "hostile_language",
        severity: hostile.severity,
        flaggedAt: message.sentAt,
        title: hostile.severity === "high" ? "Threat Language Detected" : "Hostile Language",
        description:
          hostile.severity === "high"
            ? `This message contains language consistent with legal threats: "${hostile.phrase}". Consider reframing.`
            : `This message contains aggressive language: "${hostile.phrase}". A neutral tone may be more effective.`,
        excerpt: body.substring(0, 80),
        messageTimestamp: message.sentAt,
        dismissed: false,
      });
    }

    // 4. Accusatory
    const accus = detectAccusatory(body);
    if (accus) {
      warnings.push({
        id: `${message.id}-accus`,
        messageId: message.id,
        senderName,
        category: "accusatory_language",
        severity: accus,
        flaggedAt: message.sentAt,
        title: '"You Always/Never" Language',
        description: 'Accusatory language like "you always" or "you never" tends to escalate conflict.',
        excerpt: body.substring(0, 80),
        messageTimestamp: message.sentAt,
        dismissed: false,
      });
    }

    // 5. Sensitive Topic Escalation
    const sensitive = detectSensitiveTopicEscalation(body);
    if (sensitive) {
      warnings.push({
        id: `${message.id}-sensitive`,
        messageId: message.id,
        senderName,
        category: "sensitive_topic_escalation",
        severity: sensitive,
        flaggedAt: message.sentAt,
        title: "Sensitive Topic + Negative Tone",
        description:
          "This message addresses a sensitive topic (custody, finances, legal) with escalating language. Neutral framing may help.",
        excerpt: body.substring(0, 80),
        messageTimestamp: message.sentAt,
        dismissed: false,
      });
    }

    // 6. Delayed Response (if prior messages available)
    if (priorMessages.length > 0) {
      const previousFromOther = priorMessages.find((m) => m.senderId !== message.senderId);
      const delayed = detectDelayedResponse(message, previousFromOther);
      if (delayed) {
        warnings.push({
          id: `${message.id}-delay`,
          messageId: message.id,
          senderName,
          category: "delayed_response",
          severity: delayed,
          flaggedAt: message.sentAt,
          title: "Delayed Response",
          description:
            "This response came >48 hours after a direct question. Faster turn-around may prevent escalation.",
          excerpt: body.substring(0, 80),
          messageTimestamp: message.sentAt,
          dismissed: false,
        });
      }
    }

    return warnings;
  }

  /**
   * Batch analyse all messages in a family thread and return a sorted warning list.
   *
   * Performance optimized for large message sets:
   * - For < 100 messages: analyze all messages
   * - For 100-500 messages: analyze all but limit processing time
   * - For > 500 messages: sample recent messages (last 200) + random sample of older messages
   *
   * Complexity: O(M × W) where M = messages analyzed, W = warning rules (constant).
   * Target: Complete analysis in < 3 seconds for 500+ messages.
   *
   * @param messages  All messages in the conversation
   * @returns Sorted list of warnings (most severe, most recent first)
   */
  analyzeThread(messages: Message[]): WarningSignal[] {
    const startTime = Date.now();
    const allWarnings: WarningSignal[] = [];

    // Sort by time for context
    const sorted = [...messages].sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
    );

    let messagesToAnalyze: Message[];

    if (sorted.length <= SMALL_DATASET_THRESHOLD) {
      // Analyze all messages for small datasets
      messagesToAnalyze = sorted;
    } else if (sorted.length <= LARGE_DATASET_THRESHOLD) {
      // Analyze all but with time limit
      messagesToAnalyze = sorted;
    } else {
      // For large datasets (>500 messages), use sampling strategy:
      // - Always analyze the most recent 100 messages
      // - Sample messages from the older messages (random sampling)
      const recentMessages = sorted.slice(-RECENT_MESSAGE_COUNT);
      const olderMessages = sorted.slice(0, -RECENT_MESSAGE_COUNT);

      // Random sample from older messages (about 50% of older messages, max 100)
      const sampleSize = Math.min(RECENT_MESSAGE_COUNT, Math.floor(olderMessages.length * 0.5));
      const sampledOlderMessages: Message[] = [];

      if (sampleSize > 0 && olderMessages.length > 0) {
        const step = Math.max(1, Math.floor(olderMessages.length / sampleSize));
        for (let i = 0; i < olderMessages.length && sampledOlderMessages.length < sampleSize; i += step) {
          sampledOlderMessages.push(olderMessages[i]);
        }
      }

      messagesToAnalyze = [...sampledOlderMessages, ...recentMessages];
    }

    // Analyze selected messages
    for (let i = 0; i < messagesToAnalyze.length; i++) {
      // Time limit check - stop if we've been processing for > 2.5 seconds
      if (Date.now() - startTime > MAX_ANALYSIS_TIME_MS) {
        // Use console.info instead of console.warn for allowed console methods
        console.info(`MediationAnalyzer: Stopping analysis early after ${Date.now() - startTime}ms to prevent timeout`);
        break;
      }

      const message = messagesToAnalyze[i];
      const prior: Message[] = [];
      if (i > 0) {
        prior.push(messagesToAnalyze[i - 1]);
      }
      const senderName = messages
        .find((m) => m.id === message.id)
        ?.senderId.substring(0, 10) ?? "Unknown";

      const warnings = this.analyzeSingleMessage(message, senderName, prior);
      allWarnings.push(...warnings);
    }

    // Sort by severity (high → medium → low) then by recency
    allWarnings.sort((a, b) => {
      const severityRank: Record<WarningSeverity, number> = { high: 0, medium: 1, low: 2 };
      const saDiff = severityRank[a.severity] - severityRank[b.severity];
      if (saDiff !== 0) return saDiff;
      return new Date(b.flaggedAt).getTime() - new Date(a.flaggedAt).getTime();
    });

    const analysisTime = Date.now() - startTime;
    if (analysisTime > ANALYSIS_TIMEOUT_WARNING_MS) {
      console.info(`MediationAnalyzer: Analyzed ${messagesToAnalyze.length}/${sorted.length} messages in ${analysisTime}ms`);
    }

    return allWarnings;
  }

  /**
   * Compute an overall Communication Health Score (0–100).
   *
   * Based on:
   *   40% tone (inverse of climate tension)
   *   20% response timeliness
   *   20% topic-based risk
   *   20% warning signal density
   *
   * Complexity: O(M)
   */
  computeHealthScore(
    messages: Message[],
    windowDays: number = 30
  ): CommunicationHealthScore {
    const now = new Date();
    const windowStartMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000;

    const windowMessages = messages.filter(
      (m) => new Date(m.sentAt).getTime() >= windowStartMs
    );

    if (windowMessages.length === 0) {
      return {
        score: 75, // Neutral if no messages
        status: "stable",
        trendPercent: 0,
        windowDays,
        factors: {
          toneFactor: 75,
          responseTimelinessFactor: 100,
          topicRiskFactor: 75,
          warningSignalFactor: 100,
        },
      };
    }

    // 1. Tone Factor (40%) — inverse of tension score
    const warnings = this.analyzeThread(windowMessages);
    const warningCount = warnings.filter((w) => w.severity === "high").length;
    const toneFactor = Math.max(0, 100 - warningCount * 15);

    // 2. Response Timeliness (20%) — average response time
    const responseTimes: number[] = [];
    for (let i = 1; i < windowMessages.length; i++) {
      const current = windowMessages[i];
      const previous = windowMessages[i - 1];
      if (current.senderId !== previous.senderId) {
        const diffHours =
          (new Date(current.sentAt).getTime() - new Date(previous.sentAt).getTime()) /
          (60 * 60 * 1000);
        responseTimes.push(diffHours);
      }
    }
    const avgResponseHours = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b) / responseTimes.length
      : 12;
    const responseTimelinessFactor = Math.max(0, 100 - Math.min(avgResponseHours, 72) * 0.8);

    // 3. Topic Risk (20%) — % of messages touching sensitive topics
    const sensitiveCount = windowMessages.filter((m) =>
      /\bcustody\b|\blawyer\b|\bcourt\b|\bchild support\b/i.test(m.body)
    ).length;
    const topicRiskFactor = Math.max(
      50,
      100 - (sensitiveCount / windowMessages.length) * 50
    );

    // 4. Warning Signal Factor (20%)
    const totalWarnings = warnings.length;
    const warningSignalFactor = Math.max(
      0,
      100 - (totalWarnings / windowMessages.length) * 20
    );

    // Composite score
    const score = Math.round(
      toneFactor * 0.4 +
        responseTimelinessFactor * 0.2 +
        topicRiskFactor * 0.2 +
        warningSignalFactor * 0.2
    );

    const status: "excellent" | "stable" | "at_risk" | "crisis" =
      score >= 80
        ? "excellent"
        : score >= 60
        ? "stable"
        : score >= 40
        ? "at_risk"
        : "crisis";

    return {
      score,
      status,
      trendPercent: 5, // Placeholder – would compute vs previous period
      windowDays,
      factors: {
        toneFactor,
        responseTimelinessFactor,
        topicRiskFactor,
        warningSignalFactor,
      },
    };
  }
}
