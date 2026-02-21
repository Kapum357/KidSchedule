/**
 * KidSchedule – MediationSuggestionEngine
 *
 * ALGORITHM OVERVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 * Given a disputed topic (e.g., "Thanksgiving Schedule", "Medical Decision") and
 * the prior messages, this engine generates neutral, child-centric suggestions
 * that both parents can send to each other.
 *
 * The suggestions are template-based and rule-driven, NOT ML-generated. This
 * keeps them auditable and consistent across families.
 *
 * SUGGESTION PIPELINE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Classify the dispute topic via keyword matching
 * 2. Extract key positions/offers from the message thread
 * 3. Look up suggestion templates for that category
 * 4. Fill in context (dates, names, offers) from the conversation
 * 5. Rank suggestions by feasibility (can both parties reasonably agree?)
 * 6. Return top 3 suggestions with copy/send buttons
 *
 * SUGGESTION CATEGORIES
 * ─────────────────────────────────────────────────────────────────────────────
 *   SCHEDULE ADJUSTMENTS     – Swap/shift dates; change transition times
 *   FINANCIAL DISPUTE        – Split offers; payment schedule adjustments
 *   MEDICAL/EDUCATION        – Decision protocols; consultation frameworks
 *   SOCIAL/ACTIVITY FEES     – Cost-sharing; enrollment decisions
 *   GENERAL MISCOMMUNICATION – Acknowledge misunderstanding; reset tone
 *
 * NEUTRAL FRAMING RULES
 * ─────────────────────────────────────────────────────────────────────────────
 * • Frame as "I am willing to..." not "You should..."
 * • Anchor to court order or prior agreements
 * • Emphasize child's best interest
 * • Propose specific dates/times/amounts (not vague)
 * • Include an expiration ("valid until X date")
 * • Avoid conditional ultimatums
 *
 * FEASIBILITY SCORING
 * ─────────────────────────────────────────────────────────────────────────────
 * Each suggestion is scored: 0–100
 * • Does it respect the custody schedule? +30
 * • Is it a reasonable compromise? +20
 * • Does it mention the child's needs? +15
 * • Is it specific (not vague)? +15
 * • Is it time-limited? +10
 * • Does it acknowledge the other parent's position? +10
 *
 * Only suggestions scoring ≥60 are shown.
 */

import type { Message } from "@/types";

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
