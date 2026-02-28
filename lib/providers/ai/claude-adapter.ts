import { incrementCounter, observeDuration } from "@/lib/observability/metrics";
import { logEvent } from "@/lib/observability/logger";

export interface ToneAnalysisResult {
  isHostile: boolean;
  indicators: string[];
  neutralRewrite: string;
}

type ClaudeUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

type ClaudeResponseContent = {
  type: string;
  text?: string;
};

type ClaudeMessagesApiResponse = {
  content?: ClaudeResponseContent[];
  usage?: ClaudeUsage;
  error?: {
    message?: string;
    type?: string;
  };
};

type UserRateState = {
  windowStartedAtMs: number;
  count: number;
};

type CircuitState = {
  windowStartedAtMs: number;
  totalRequests: number;
  totalErrors: number;
  openUntilMs: number;
};

type ClaudeRuntimeState = {
  userRateLimitMap: Map<string, UserRateState>;
  circuit: CircuitState;
};

type RunClaudeJsonInput<T> = {
  userId: string;
  operation: "tone_analysis" | "mediation_assistant";
  model: string;
  maxTokens: number;
  systemPrompt: string;
  userPrompt: string;
  fallback: T;
  validate: (value: unknown) => T;
};

const CLAUDE_PER_MINUTE_LIMIT = 100;
const RATE_WINDOW_MS = 60_000;
const CIRCUIT_WINDOW_MS = 5 * 60_000;
const CIRCUIT_OPEN_MS = 60_000;
const CLAUDE_RUNTIME_KEY = "__kidschedule_claude_runtime__";

const SAFE_TONE_ANALYSIS: ToneAnalysisResult = {
  isHostile: false,
  indicators: [],
  neutralRewrite: "",
};

const MODEL_COST_PER_MILLION: Readonly<Record<string, { inputUsd: number; outputUsd: number }>> = {
  "claude-3-5-haiku-latest": { inputUsd: 0.8, outputUsd: 4 },
  "claude-3-5-sonnet-latest": { inputUsd: 3, outputUsd: 15 },
};

function getRuntimeState(): ClaudeRuntimeState {
  const globalStore = globalThis as typeof globalThis & {
    [CLAUDE_RUNTIME_KEY]?: ClaudeRuntimeState;
  };

  if (!globalStore[CLAUDE_RUNTIME_KEY]) {
    globalStore[CLAUDE_RUNTIME_KEY] = {
      userRateLimitMap: new Map<string, UserRateState>(),
      circuit: {
        windowStartedAtMs: Date.now(),
        totalRequests: 0,
        totalErrors: 0,
        openUntilMs: 0,
      },
    };
  }

  return globalStore[CLAUDE_RUNTIME_KEY]!;
}

function isClaudeEnabled(): boolean {
  if (process.env.CLAUDE_ENABLED === "false") {
    return false;
  }

  return typeof process.env.ANTHROPIC_API_KEY === "string" && process.env.ANTHROPIC_API_KEY.length > 0;
}

function checkUserRateLimit(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
  const runtime = getRuntimeState();
  const now = Date.now();
  const current = runtime.userRateLimitMap.get(userId);

  if (!current || now - current.windowStartedAtMs >= RATE_WINDOW_MS) {
    runtime.userRateLimitMap.set(userId, {
      windowStartedAtMs: now,
      count: 1,
    });
    return { allowed: true };
  }

  if (current.count >= CLAUDE_PER_MINUTE_LIMIT) {
    const retryAfterMs = RATE_WINDOW_MS - (now - current.windowStartedAtMs);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  runtime.userRateLimitMap.set(userId, {
    windowStartedAtMs: current.windowStartedAtMs,
    count: current.count + 1,
  });

  return { allowed: true };
}

function isCircuitBreakerOpen(): boolean {
  const runtime = getRuntimeState();
  return Date.now() < runtime.circuit.openUntilMs;
}

function recordCircuitOutcome(success: boolean): void {
  const runtime = getRuntimeState();
  const now = Date.now();

  if (now - runtime.circuit.windowStartedAtMs >= CIRCUIT_WINDOW_MS) {
    runtime.circuit.windowStartedAtMs = now;
    runtime.circuit.totalRequests = 0;
    runtime.circuit.totalErrors = 0;
    runtime.circuit.openUntilMs = 0;
  }

  runtime.circuit.totalRequests += 1;
  if (!success) {
    runtime.circuit.totalErrors += 1;
  }

  const errorRate = runtime.circuit.totalErrors / Math.max(1, runtime.circuit.totalRequests);
  if (runtime.circuit.totalRequests >= 4 && errorRate > 0.5) {
    runtime.circuit.openUntilMs = now + CIRCUIT_OPEN_MS;
    logEvent("warn", "Claude circuit breaker opened", {
      errorRate,
      totalRequests: runtime.circuit.totalRequests,
      totalErrors: runtime.circuit.totalErrors,
      openForMs: CIRCUIT_OPEN_MS,
    });
  }
}

export function redactPIIForClaude(value: string): string {
  let redacted = value;

  redacted = redacted.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted_email]");
  redacted = redacted.replace(/\+?\d[\d\s().-]{8,}\d/g, "[redacted_phone]");
  redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted_ssn]");
  redacted = redacted.replace(/\b(?:\d[ -]*?){13,19}\b/g, "[redacted_card]");

  return redacted;
}

function estimateCostUsd(model: string, usage: ClaudeUsage | undefined): number {
  const pricing = MODEL_COST_PER_MILLION[model];
  if (!pricing) {
    return 0;
  }

  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;

  return inputTokens * (pricing.inputUsd / 1_000_000) + outputTokens * (pricing.outputUsd / 1_000_000);
}

function extractJsonObject(rawText: string): unknown {
  const trimmed = rawText.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("Claude response did not include a JSON object");
  }

  const jsonSlice = trimmed.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonSlice) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseToneResult(value: unknown): ToneAnalysisResult {
  if (!isRecord(value)) {
    throw new Error("Tone analysis response is not an object");
  }

  const isHostile = value.isHostile;
  const indicators = value.indicators;
  const neutralRewrite = value.neutralRewrite;

  if (typeof isHostile !== "boolean") {
    throw new Error("Tone analysis missing boolean isHostile");
  }

  const normalizedIndicators = Array.isArray(indicators)
    ? indicators.filter((indicator): indicator is string => typeof indicator === "string")
    : [];

  return {
    isHostile,
    indicators: normalizedIndicators,
    neutralRewrite: typeof neutralRewrite === "string" ? neutralRewrite : "",
  };
}

export async function runClaudeJsonWithGuardrails<T>(
  input: RunClaudeJsonInput<T>
): Promise<T> {
  if (!isClaudeEnabled()) {
    return input.fallback;
  }

  const rateLimit = checkUserRateLimit(input.userId);
  if (!rateLimit.allowed) {
    logEvent("warn", "Claude rate limit exceeded", {
      userId: input.userId,
      operation: input.operation,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      limitPerMinute: CLAUDE_PER_MINUTE_LIMIT,
    });
    return input.fallback;
  }

  if (isCircuitBreakerOpen()) {
    logEvent("warn", "Claude request skipped because circuit breaker is open", {
      userId: input.userId,
      operation: input.operation,
    });
    return input.fallback;
  }

  const startedAt = performance.now();

  try {
    const response = await fetch(process.env.ANTHROPIC_API_URL ?? "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: input.maxTokens,
        temperature: 0,
        system: input.systemPrompt,
        messages: [
          {
            role: "user",
            content: input.userPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API request failed (${response.status}): ${errorText.slice(0, 500)}`);
    }

    const payload = (await response.json()) as ClaudeMessagesApiResponse;
    const textBlock = payload.content?.find((contentPart) => contentPart.type === "text" && typeof contentPart.text === "string");

    if (!textBlock?.text) {
      throw new Error("Claude API did not return text content");
    }

    const parsed = extractJsonObject(textBlock.text);
    const validated = input.validate(parsed);

    const elapsedMs = performance.now() - startedAt;
    observeDuration("api.request.duration", elapsedMs, {
      integration: "claude",
      operation: input.operation,
    });

    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;
    const totalTokens = inputTokens + outputTokens;
    const estimatedCostUsd = estimateCostUsd(input.model, payload.usage);

    logEvent("info", "Claude token usage", {
      userId: input.userId,
      operation: input.operation,
      model: input.model,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    });

    recordCircuitOutcome(true);
    return validated;
  } catch (error) {
    recordCircuitOutcome(false);
    incrementCounter("error.count", 1, {
      source: "claude",
      operation: input.operation,
    });
    logEvent("error", "Claude request failed", {
      userId: input.userId,
      operation: input.operation,
      error,
    });
    return input.fallback;
  }
}

export async function analyzeMessageTone(
  userId: string,
  messageText: string
): Promise<ToneAnalysisResult> {
  const redactedMessage = redactPIIForClaude(messageText);

  return await runClaudeJsonWithGuardrails<ToneAnalysisResult>({
    userId,
    operation: "tone_analysis",
    model: process.env.CLAUDE_TONE_MODEL ?? "claude-3-5-haiku-latest",
    maxTokens: 280,
    fallback: SAFE_TONE_ANALYSIS,
    systemPrompt: `You are a co-parenting communication safety assistant.
Return ONLY valid JSON with exactly this shape:
{
  "isHostile": boolean,
  "indicators": string[],
  "neutralRewrite": string
}

Rules:
- Flag hostility for insults, threats, contempt, harassment, aggressive blame, all-caps yelling, or repeated aggressive punctuation.
- Keep indicators short and specific.
- If hostile, provide a short neutral rewrite in plain language.
- If not hostile, neutralRewrite should be an empty string.
- No markdown, no commentary, no extra keys.`,
    userPrompt: `Analyze this message text and return JSON only:\n\n${redactedMessage}`,
    validate: parseToneResult,
  });
}
