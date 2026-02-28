import { MediationSuggestionEngine } from "@/lib/mediation-suggestion-engine";
import type { Message } from "@/types";
import { redactPIIForClaude, runClaudeJsonWithGuardrails } from "./claude-adapter";

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
