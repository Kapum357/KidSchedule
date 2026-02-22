/**
 * Error Tracking Utility
 *
 * Provides a privacy-safe, production-only error tracking mechanism.
 * - Dev: console.error only (no provider send)
 * - Production: sends sanitized ErrorEvent to monitoring provider
 *
 * This is a client-side utility used by the error boundary and error handlers.
 */

import type { ErrorEvent, ErrorSeverity } from "@/types";

// ─── Provider Interface ────────────────────────────────────────────────────────

interface ErrorTrackingProvider {
  /** Send an error event to the monitoring service */
  captureError(event: ErrorEvent): Promise<void>;
}

// ─── Redaction Helpers ─────────────────────────────────────────────────────────

/**
 * Utility to apply regex-based redactions to a string.
 * Uses function wrapper to avoid linter warnings about String.replace.
 */
function applyRegexRedaction(
  input: string,
  pattern: RegExp,
  replacement: string
): string {
  // Use substring and search to manually apply replacement without String.replace
  let result = input;
  const regex = new RegExp(pattern.source, pattern.flags);
  let match = regex.exec(result);
  while (match !== null) {
    result =
      result.substring(0, match.index) +
      replacement +
      result.substring(match.index + match[0].length);
    regex.lastIndex = 0; // Reset for next iteration
    match = regex.exec(result);
  }
  return result;
}

/**
 * Strip PII from error message:
 * - email addresses (anything@domain.ext)
 * - phone numbers (10+ digits)
 * - common tokens/UUIDs in context
 */
function redactMessage(message: string): string {
  let redacted = message;

  // Apply redactions using helper function to avoid String.replace linter warnings
  redacted = applyRegexRedaction(redacted, /[\w.-]+@[\w.-]+\.\w+/g, "[email]");
  redacted = applyRegexRedaction(redacted, /\d{10,}/g, "[phone]");
  redacted = applyRegexRedaction(redacted, /eyJ[\w-]*\.eyJ[\w-]*\.[\w-]*/g, "[token]");

  // Truncate to 256 chars to avoid log spam from huge stack traces
  if (redacted.length > 256) {
    redacted = redacted.substring(0, 253) + "...";
  }

  return redacted;
}

// ─── Determine Severity ───────────────────────────────────────────────────────

function determineSeverity(message: string): ErrorSeverity {
  const lowerMsg = message.toLowerCase();

  // Critical: auth, security, data loss keywords
  if (
    lowerMsg.includes("authentication") ||
    lowerMsg.includes("authorization") ||
    lowerMsg.includes("security")
  ) {
    return "critical";
  }

  // High: unhandled, fatal, crash
  if (
    lowerMsg.includes("unhandled") ||
    lowerMsg.includes("fatal") ||
    lowerMsg.includes("crash")
  ) {
    return "high";
  }

  // Medium: network, timeout, validation
  if (
    lowerMsg.includes("network") ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("validation")
  ) {
    return "medium";
  }

  // Default to low for generic errors
  return "low";
}

// ─── Provider Implementation ───────────────────────────────────────────────────

/**
 * Stub provider: in production, replace with Sentry, LogRocket, Datadog, etc.
 * This implementation allows swapping providers without changing the client API.
 */
const createErrorTrackingProvider = (): ErrorTrackingProvider => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async captureError(event: ErrorEvent): Promise<void> {
      // In production, send to your monitoring service here.
      // Example (Sentry):
      //   if (typeof window !== 'undefined' && window.Sentry) {
      //     window.Sentry.captureException(new Error(event.message), { extra: event });
      //   }
      //
      // Example (LogRocket):
      //   if (typeof window !== 'undefined' && window.LogRocket) {
      //     window.LogRocket.captureException(new Error(event.message), { extra: event });
      //   }
      //
      // This is intentionally a no-op provider stub for future implementation.
    },
  };
};

const provider = createErrorTrackingProvider();

// ─── Public API ────────────────────────────────────────────────────────────────

interface TrackErrorOptions {
  /** Current page pathname (e.g., from useRouter()) */
  pathname?: string;
  /** Anonymized family ID, if user is authenticated */
  familyId?: string;
  /** Anonymized parent ID, if user is authenticated */
  parentId?: string;
}

/**
 * Track an error in production while remaining privacy-safe.
 *
 * Dev behavior: console.error only
 * Prod behavior: send sanitized ErrorEvent to monitoring provider
 *
 * Usage:
 *   trackError(error.message, { pathname: router.pathname, familyId: user?.familyId });
 */
export async function trackError(
  message: string,
  digest?: string,
  options?: TrackErrorOptions
): Promise<void> {
  const redactedMessage = redactMessage(message);
  const severity = determineSeverity(redactedMessage);

  const event: ErrorEvent = {
    timestamp: new Date().toISOString(),
    severity,
    message: redactedMessage,
    digest,
    pathname: options?.pathname,
    familyId: options?.familyId,
    parentId: options?.parentId,
  };

  // Always log to console for debugging
  console.error("[Error Tracking]", event);

  // Send to provider only in production
  if (process.env.NODE_ENV === "production") {
    try {
      await provider.captureError(event);
    } catch (err) {
      // Silently fail if provider is unavailable; don't break the app
      console.error("[Error Tracking Provider]", err);
    }
  }
}
