/**
 * KidSchedule – Structured JSON logger
 *
 * Outputs one JSON object per log line with severity and redacted context.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: LogLevel =
  process.env.LOG_LEVEL === "debug" ||
  process.env.LOG_LEVEL === "info" ||
  process.env.LOG_LEVEL === "warn" ||
  process.env.LOG_LEVEL === "error"
    ? process.env.LOG_LEVEL
    : "info";

const SENSITIVE_KEY_PATTERN =
  /(^|_)(email|phone|ssn|password|token|authorization|cookie|secret|api_key|apikey|access_key)($|_)/i;

function applyRegexRedaction(input: string, pattern: RegExp, replacement: string): string {
  let output = input;
  const regex = new RegExp(pattern.source, pattern.flags);
  let match = regex.exec(output);

  while (match !== null) {
    output =
      output.substring(0, match.index) +
      replacement +
      output.substring(match.index + match[0].length);
    regex.lastIndex = 0;
    match = regex.exec(output);
  }

  return output;
}

function redactString(value: string): string {
  let redacted = value;
  redacted = applyRegexRedaction(redacted, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
  redacted = applyRegexRedaction(redacted, /\b\d{3}-\d{2}-\d{4}\b/g, "[ssn]");
  redacted = applyRegexRedaction(redacted, /\+?\d[\d\s().-]{8,}\d/g, "[phone]");
  return redacted;
}

function sanitizeValue(value: unknown, depth = 0): JsonValue {
  if (depth > 4) return "[truncated]";

  if (value === null || value === undefined) return null;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const output: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(obj)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = "[redacted]";
      } else {
        output[key] = sanitizeValue(entry, depth + 1);
      }
    }
    return output;
  }

  return redactString(String(value));
}

export function logEvent(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[MIN_LEVEL]) return;

  const payload = {
    timestamp: new Date().toISOString(),
    severity: level,
    message: redactString(message),
    context: context ? sanitizeValue(context) : undefined,
  };

  const serialized = JSON.stringify(payload);
  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}
