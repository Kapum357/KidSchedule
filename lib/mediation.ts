/**
 * KidSchedule – MediationAnalyzer
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

/**
 * KidSchedule – MediationSuggestionEngine
 */

// ─── Public Types ────────────────────────────────────────────────────────────

export type DisputeCategory =
  | "schedule_adjustment"
  | "financial"
  | "medical_education"
  | "activity_fees"
  | "parenting_decision"
  | "miscommunication";

export interface MediationSuggestion {
  id: string;
  /** Template ID for analytics */
  templateId: string;
  category: DisputeCategory;
  /** 0–100 feasibility score */
  feasibilityScore: number;
  /** The actual text the parent can copy/send */
  draftText: string;
  /** Brief explanation of why this is neutral */
  reasoning: string;
  /** Suggested expiration date for the offer */
  expiresAt?: string;
}

export interface MediationContext {
  /** The current dispute topic being mediated */
  topic: string;
  /** Recent messages in this thread */
  messages: Message[];
  /** Names of both parents (for personalization) */
  parentNames: [string, string];
  /** Description of current custody arrangement */
  custodyContext?: string;
  /** Any known court order constraints */
  legalConstraints?: string;
}

// ─── Suggestion Templates ─────────────────────────────────────────────────────

interface SuggestionTemplate {
  id: string;
  category: DisputeCategory;
  pattern: RegExp; // Topic matcher
  templates: Array<{
    text: string;
    reasoning: string;
    baseScore: number;
  }>;
}

const SUGGESTION_TEMPLATES: SuggestionTemplate[] = [
  {
    id: "schedule_holiday",
    category: "schedule_adjustment",
    pattern: /\b(thanksgiving|christmas|easter|halloween|birthday|holiday)\b/i,
    templates: [
      {
        text: "Regarding this year's {{holiday}}, I am willing to adjust the transition time to {{newTime}} instead of {{oldTime}} to accommodate {{reasoning}}. This would still respect the agreed custody schedule. Please let me know if this works for your plans.",
        reasoning: "Addresses specific timing while respecting the existing custody agreement",
        baseScore: 75,
      },
      {
        text: "I propose we alternate {{holiday}} custody each year, starting with {{year}}: I take {{year}}, you take {{nextYear}}, and so on. This gives both of us predictable planning for a meaningful holiday.",
        reasoning: "Creates a fair pattern that both parents can plan around",
        baseScore: 80,
      },
      {
        text: "For this {{holiday}}, I'm open to extending your time by {{hours}} hours if you can commit to the return time by {{time}}. Our child's continuity of care is the priority.",
        reasoning: "Offers flexibility while maintaining firmness on return times",
        baseScore: 70,
      },
    ],
  },
  {
    id: "financial_split",
    category: "financial",
    pattern: /\b(fee|expense|cost|payment|tuition|medical|doctor)\b/i,
    templates: [
      {
        text: "I'm willing to cover {{percentage}}% of the {{expense}} cost ({{amount}}) as outlined in our agreement. I can pay by {{date}} if you send me the invoice.",
        reasoning: "Acknowledges the shared cost and commits to a specific timeline",
        baseScore: 75,
      },
      {
        text: "For {{expense}}, I propose we split the cost 50/50. I'll cover {{ourShare}} and you cover {{theirShare}}. Once you receive the bill, please forward it and I'll pay within 5 business days.",
        reasoning: "Fair split with clear payment terms",
        baseScore: 78,
      },
      {
        text: "I understand {{expense}} is important for our child's development. While I'm unable to cover the full {{amount}}, I can contribute {{ourShare}} toward the {{expense}}. The remaining {{theirShare}} would be your responsibility.",
        reasoning: "Honest about limitations while still contributing; avoids blame",
        baseScore: 65,
      },
    ],
  },
  {
    id: "medical_decision",
    category: "medical_education",
    pattern: /\b(doctor|medical|health|therapy|medication|vaccine|consent)\b/i,
    templates: [
      {
        text: "For this {{medicalIssue}}, I propose we jointly consult with {{provider}} to make the best decision for our child. I'm happy to attend the appointment with you or to hear your feedback after you meet with them.",
        reasoning: "Establishes shared decision-making for major health issues",
        baseScore: 82,
      },
      {
        text: "I've made an appointment with {{provider}} on {{date}} at {{time}} for our child's {{medicalIssue}}. I'd like you to either attend or to join a follow-up call to discuss the results and next steps.",
        reasoning: "Takes action while keeping the other parent informed and involved",
        baseScore: 75,
      },
    ],
  },
  {
    id: "activity_decision",
    category: "activity_fees",
    pattern: /\b(soccer|sport|activity|class|lesson|club|fee|signup)\b/i,
    templates: [
      {
        text: "I think {{activity}} is a great opportunity for our child. The cost is {{amount}}. I'm willing to cover {{weShare}} if you can cover {{theyShare}}. The registration deadline is {{date}}.",
        reasoning: "Proposes cost-sharing for child's enrichment with clear deadlines",
        baseScore: 77,
      },
      {
        text: "I prefer not to enroll our child in {{activity}} at this time because {{reason}}. Perhaps we could revisit this in {{timeframe}} when circumstances change.",
        reasoning: "Respectfully declines while leaving door open for future reconsideration",
        baseScore: 60,
      },
    ],
  },
  {
    id: "miscommunication_reset",
    category: "miscommunication",
    pattern: /\b(misunderstand|confused|upset|argument|disagree)\b/i,
    templates: [
      {
        text: "I realize we may have misunderstood each other's intentions. I want to clarify: I'm committed to what's best for our child. Can we reset and discuss this {{topic}} calmly? I'm happy to listen to your perspective.",
        reasoning: "Acknowledges the misunderstanding and resets tone without blame",
        baseScore: 72,
      },
      {
        text: "I may have reacted too quickly. Let me restate my position more clearly: {{clearedUpPosition}}. I'd appreciate your thoughts on how we can move forward together.",
        reasoning: "Takes responsibility and reframes the issue constructively",
        baseScore: 70,
      },
    ],
  },
];

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Extract key phrases/offers from the message thread.
 * Used to fill in template placeholders.
 */
function extractContext(messages: Message[], topic: string): Record<string, string> {
  const context: Record<string, string> = {
    topic: topic,
    holiday: new RegExp(/thanksgiving|christmas|easter|halloween/i).exec(topic)?.[0] || "event",
    date: new Date().toISOString().split("T")[0],
  };

  const fullThread = messages.map((m) => m.body).join(" ");

  // Try to find specific times/amounts/dates mentioned
  const timeMatch = /\b(\d{1,2}):(\d{2})\s*(?:am|pm)\b/i.exec(fullThread);
  if (timeMatch) context.newTime = timeMatch[0];

  const amountMatch = /\$([\d,]+\.?\d*)/.exec(fullThread);
  if (amountMatch) context.amount = amountMatch[1];

  const dateMatch = new RegExp(/\b(jan|feb|march|apr|may|june|july|aug|sep|oct|nov|dec)[a-z]* \d{1,2}\b/i).exec(fullThread);
  if (dateMatch) context.eventDate = dateMatch[0];

  return context;
}

/**
 * Score a suggestion draft based on feasibility criteria.
 *
 * Complexity: O(1)
 */
function scoreFeasibility(draft: string): number {
  let score = 0;

  // Has specific dates/times (not vague)
  const monthKeywordMatch = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;
  const isoDateMatch = /\b\d{4}-\d{2}-\d{2}\b/.test(draft);
  const timeSlotMatch = /\b\d{1,2}:\d{2}\b/.test(draft);
  if (monthKeywordMatch.test(draft) || isoDateMatch || timeSlotMatch) {
    score += 15;
  }

  // Mentions child's needs
  if (/\bour child|child's|the child\b/i.test(draft)) {
    score += 15;
  }

  // Frame is collaborative ("I propose", "I'm willing")
  if (/\bi'?m willing|i propose|suggest|can we|let's\b/i.test(draft)) {
    score += 20;
  }

  // Acknowledges other parent's position
  if (/\bi understand|you|your\b/i.test(draft)) {
    score += 10;
  }

  // Is time-limited (not open-ended)
  if (/\bby|deadline|until|expires|valid\b/i.test(draft)) {
    score += 10;
  }

  // Mentions custody schedule / court order
  if (/\bagreed|schedule|court|arrangement\b/i.test(draft)) {
    score += 30;
  }

  // Avoid negative framing
  if (/\byou always|you never|your fault|unacceptable\b/i.test(draft)) {
    score -= 30;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Fill in template placeholders from context.
 */
function fillTemplate(template: string, context: Record<string, string>): string {
  let filled = template;
  for (const [key, value] of Object.entries(context)) {
    filled = filled.replaceAll(new RegExp(`{{${key}}}`, "g"), value);
  }
  return filled;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class MediationSuggestionEngine {
  /**
   * Generate mediation suggestions for a dispute.
   *
   * Complexity: O(T) where T = number of templates (~5). Effectively O(1).
   *
   * @param context  Information about the dispute context
   * @returns Top 3 suggestions, sorted by feasibility score
   *
   * @example
   * const engine = new MediationSuggestionEngine();
   * const suggestions = engine.generateSuggestions({
   *   topic: "Thanksgiving Schedule",
   *   messages: [...],
   *   parentNames: ["Alex", "Sarah"],
   * });
   * // Returns 3 drafted messages the parent can send
   */
  generateSuggestions(context: MediationContext): MediationSuggestion[] {
    const threadContext = extractContext(context.messages, context.topic);

    const suggestions = this.collectSuggestions(context.topic, threadContext);
    suggestions.sort((a, b) => b.feasibilityScore - a.feasibilityScore);
    this.ensureGenericReset(suggestions, context.topic);

    return suggestions.slice(0, 3); // Return top 3
  }

  /**
   * Check if a user's draft suggestion is neutral enough before sending.
   * Returns a score (0–100) and feedback.
   *
   * Complexity: O(draft.length) ≈ O(1)
   */
  validateNeutrality(draft: string): { score: number; feedback: string[] } {
    const feedback: string[] = [];
    let score = 100;

    // Check for accusatory language
    if (/\byou always|you never|your fault\b/i.test(draft)) {
      feedback.push("Avoid accusatory language like 'you always' or 'you never'.");
      score -= 30;
    }

    // Check for demands vs. proposals
    if (/\byou must|you have to|you need to\b/i.test(draft)) {
      feedback.push("Rephrase demands as proposals ('I propose' or 'Would you be open to')");
      score -= 15;
    }

    // Check for threats
    if (/\bi'll get you in court|i'm calling dcfs\b/i.test(draft)) {
      feedback.push(
        "Legal threats or agency mentions will escalate conflict. Reframe through proper legal channels."
      );
      score -= 50;
    }

    // Check for specificity
    const amountOrDateMention =
      /\b\d{1,2}:\d{2}\b/.test(draft) ||
      /\b\d{4}-\d{2}-\d{2}\b/.test(draft) ||
      /\b\d{1,2}%/.test(draft) ||
      /\$\d+/.test(draft);
    if (!amountOrDateMention) {
      feedback.push("More specific dates/times/amounts strengthen the offer.");
      score -= 5;
    }

    // Positive: mentions child
    if (/\bour child|child's best\b/i.test(draft)) {
      score += 10;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      feedback,
    };
  }

  private collectSuggestions(
    topic: string,
    context: Record<string, string>
  ): MediationSuggestion[] {
    return SUGGESTION_TEMPLATES.flatMap((templateGroup) =>
      templateGroup.pattern.test(topic)
        ? buildSuggestionsFromGroup(templateGroup, context)
        : []
    );
  }

  private ensureGenericReset(suggestions: MediationSuggestion[], topic: string): void {
    if (suggestions.length > 0) return;

    suggestions.push(this.buildGenericResetSuggestion(topic));
  }

  private buildGenericResetSuggestion(topic: string): MediationSuggestion {
    return {
      id: "generic-reset",
      templateId: "miscommunication_reset",
      category: "miscommunication",
      feasibilityScore: 65,
      draftText: `I want to work together to resolve this. Can we discuss ${topic} calmly and focus on what's best for our child? I'm open to your perspective.`,
      reasoning: "Generic reset to restore positive communication",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
}

function buildSuggestionsFromGroup(
  templateGroup: SuggestionTemplate,
  context: Record<string, string>
): MediationSuggestion[] {
  return templateGroup.templates
    .map((template) => createSuggestion(templateGroup, template, context))
    .filter((suggestion): suggestion is MediationSuggestion =>
      suggestion.feasibilityScore >= 60
    );
}

function createSuggestion(
  templateGroup: SuggestionTemplate,
  template: SuggestionTemplate["templates"][number],
  context: Record<string, string>
): MediationSuggestion {
  const draftText = fillTemplate(template.text, context);
  const feasibilityScore = scoreFeasibility(draftText);

  return {
    id: `${templateGroup.id}-${Math.random()}`,
    templateId: templateGroup.id,
    category: templateGroup.category,
    feasibilityScore,
    draftText,
    reasoning: template.reasoning,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
