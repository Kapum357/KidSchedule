import { MediationSuggestionEngine } from "@/lib/mediation-suggestion-engine";
import type { Message } from "@/types";
import { redactPIIForClaude, runClaudeJsonWithGuardrails } from "./claude-adapter";
import { logEvent } from "@/lib/observability/logger";

export interface MediationAssistantResult {
  conflictLevel: "low" | "medium" | "high";
  deescalationTips: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMediationResult(value: unknown): MediationAssistantResult {
  if (!isRecord(value)) {
    throw new Error("Mediation response is not an object");
  }

  const conflictLevelRaw = value.conflictLevel;
  const conflictLevel: "low" | "medium" | "high" =
    conflictLevelRaw === "medium" || conflictLevelRaw === "high" ? conflictLevelRaw : "low";

  const deescalationTips = Array.isArray(value.deescalationTips)
    ? value.deescalationTips.filter((tip): tip is string => typeof tip === "string").slice(0, 5)
    : [];

  return {
    conflictLevel,
    deescalationTips,
  };
}

function buildFallbackTips(messages: Message[]): MediationAssistantResult {
  const latest = messages[0];
  const topic = latest ? latest.body.slice(0, 80) : "co-parenting plans";
  const suggestionEngine = new MediationSuggestionEngine();
  const generated = suggestionEngine.generateSuggestions({
    topic,
    messages,
    parentNames: ["Parent A", "Parent B"],
  });

  const fallbackTips = generated
    .map((suggestion) => suggestion.reasoning)
    .filter((reasoning): reasoning is string => reasoning.length > 0)
    .slice(0, 3);

  if (fallbackTips.length > 0) {
    return {
      conflictLevel: "medium",
      deescalationTips: fallbackTips,
    };
  }

  return {
    conflictLevel: "low",
    deescalationTips: [
      "Keep your next message short, factual, and centered on the child’s immediate needs.",
      "Use an 'I' statement instead of blame language (for example: 'I’m available after 5 PM').",
      "Offer one specific compromise with a clear date/time to reduce back-and-forth.",
    ],
  };
}

export async function getMediationAssistantTips(
  userId: string,
  recentMessages: Message[]
): Promise<MediationAssistantResult> {
  const fallback = buildFallbackTips(recentMessages);

  const condensedConversation = recentMessages
    .slice(0, 15)
    .map((message) => `${message.sentAt}: ${redactPIIForClaude(message.body)}`)
    .join("\n");

  return await runClaudeJsonWithGuardrails<MediationAssistantResult>({
    userId,
    operation: "mediation_assistant",
    model: process.env.CLAUDE_MEDIATION_MODEL ?? "claude-3-5-haiku-latest",
    maxTokens: 420,
    fallback,
    systemPrompt: `You are a co-parenting mediation assistant.
Return ONLY valid JSON in this exact shape:
{
  "conflictLevel": "low" | "medium" | "high",
  "deescalationTips": string[]
}

Rules:
- Provide 3 to 5 practical, calm, child-focused de-escalation tips.
- Avoid legal advice and threats.
- Tips must be neutral and actionable.
- No markdown and no extra keys.`,
    userPrompt: `Based on this recent conversation, provide de-escalation tips as JSON only:\n\n${condensedConversation}`,
    validate: parseMediationResult,
  });
}

/**
 * Adjust a suggestion's tone using Claude
 * Supported adjustments: gentler, shorter, more_formal, warmer
 */
export async function adjustSuggestion(
  userId: string,
  text: string,
  adjustment: "gentler" | "shorter" | "more_formal" | "warmer"
): Promise<string> {
  if (!text || !text.trim()) {
    return text;
  }

  const adjustmentPrompts: Record<string, string> = {
    gentler: "Make this tone more gentle and less confrontational, while keeping the same message.",
    shorter: "Make this message shorter (max 2 sentences), keeping the key points.",
    more_formal: "Rewrite this in a more formal tone suitable for legal documentation.",
    warmer: "Make this tone warmer and more collaborative, showing willingness to work together.",
  };

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const isClaudeEnabled = typeof apiKey === "string" && apiKey.length > 0;
    if (!isClaudeEnabled) {
      return text;
    }

    const response = await fetch(process.env.ANTHROPIC_API_URL ?? "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_TONE_MODEL ?? "claude-opus-4-6",
        max_tokens: 1024,
        temperature: 0,
        system: "You are a co-parenting communication expert. Adjust the given message as requested. Return only the adjusted text, no preamble or explanation.",
        messages: [
          {
            role: "user",
            content: `${adjustmentPrompts[adjustment]}\n\nOriginal message: "${text}"\n\nAdjusted message (no preamble):`,
          },
        ],
      }),
    });

    if (!response.ok) {
      await response.text();
      logEvent("error", "Claude API request failed for suggestion adjustment", {
        status: response.status,
        operation: "adjust_suggestion",
        userId,
      });
      return text;
    }

    const payload = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
      error?: { message?: string };
    };

    const textContent = payload.content?.find((c) => c.type === "text" && typeof c.text === "string");
    if (textContent && "text" in textContent && typeof textContent.text === "string") {
      return textContent.text.trim();
    }

    return text;
  } catch (error) {
    logEvent("error", "Failed to adjust suggestion tone", {
      userId,
      adjustment,
      error: error instanceof Error ? error.message : String(error),
    });
    return text;
  }
}
