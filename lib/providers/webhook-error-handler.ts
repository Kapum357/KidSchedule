/**
 * Webhook Error Handler – Error Classification and Detailed Logging
 *
 * Provides error classification (ValidationError, IdempotencyError, ProcessingError, SystemError, AuthError)
 * and structured logging with full context (stack traces, requestId, phoneNumber, familyId, etc).
 *
 * Used by Task #60: Error classification and detailed logging
 */

import { ZodError } from "zod";

/**
 * Error type classification for webhook errors.
 * Helps downstream systems (Task #62) decide on retry strategy.
 */
export type ErrorType = "ValidationError" | "IdempotencyError" | "ProcessingError" | "SystemError" | "AuthError";

/**
 * Result of error classification.
 * Includes type and whether the error is retryable by Twilio.
 */
export interface ErrorClassification {
  type: ErrorType;
  isRetryable: boolean;
}

/**
 * Classify an error into a type and determine if it's retryable.
 *
 * Classification rules:
 * - ZodError → ValidationError (not retryable)
 * - "Duplicate" in message or "UNIQUE constraint" → IdempotencyError (not retryable)
 * - Network errors (ECONNREFUSED, ETIMEDOUT) → SystemError (retryable)
 * - Database errors (contains "database", "DB_", "sql") → SystemError (retryable)
 * - Handler exceptions → ProcessingError (retryable)
 * - "Invalid Twilio signature" → AuthError (not retryable)
 * - Default → ProcessingError (retryable as fallback)
 */
export function classifyError(error: unknown): ErrorClassification {
  // Zod validation errors
  if (error instanceof ZodError) {
    return {
      type: "ValidationError",
      isRetryable: false,
    };
  }

  // Extract error message
  const errorMessage = error instanceof Error ? error.message : String(error);
  const messageLower = errorMessage.toLowerCase();

  // Auth errors (signature verification) - check first to avoid false matches
  if (
    errorMessage.includes("Invalid Twilio signature") ||
    messageLower.includes("invalid_signature")
  ) {
    return {
      type: "AuthError",
      isRetryable: false,
    };
  }

  // Idempotency errors (duplicate detection) - check for exact database constraint matches
  if (
    errorMessage.includes("UNIQUE constraint") ||
    errorMessage.includes("Duplicate key") ||
    messageLower.includes("duplicate key") ||
    (messageLower.includes("duplicate") && messageLower.includes("constraint"))
  ) {
    return {
      type: "IdempotencyError",
      isRetryable: false,
    };
  }

  // Network errors (retryable system failures) - check BEFORE generic connection checks
  if (
    messageLower.includes("econnrefused") ||
    messageLower.includes("etimedout") ||
    messageLower.includes("ehostunreach") ||
    messageLower.includes("socket hang up") ||
    messageLower.includes("network error") ||
    // More specific timeout patterns
    (messageLower.includes("timeout") && (
      messageLower.includes("connection") ||
      messageLower.includes("socket") ||
      messageLower.includes("deadline")
    )) ||
    messageLower.includes("fetch failed")
  ) {
    return {
      type: "SystemError",
      isRetryable: true,
    };
  }

  // Database errors (retryable system failures) - specific database patterns
  if (
    messageLower.includes("db_") ||
    messageLower.includes("sql") ||
    messageLower.includes("database") ||
    (messageLower.includes("connection") && (
      messageLower.includes("db") ||
      messageLower.includes("database") ||
      messageLower.includes("pool") ||
      messageLower.includes("postgres")
    )) ||
    (messageLower.includes("pool") && messageLower.includes("database"))
  ) {
    return {
      type: "SystemError",
      isRetryable: true,
    };
  }

  // Default: ProcessingError (handler logic failure)
  // Retryable by default (Twilio will retry 5xx responses)
  return {
    type: "ProcessingError",
    isRetryable: true,
  };
}

/**
 * Error context information for structured logging.
 * Includes requestId, phoneNumber, eventType, familyId, and message size.
 */
export interface ErrorContext {
  requestId?: string;
  phoneNumber?: string;
  eventType?: string;
  familyId?: string;
  messageSize?: number;
  messageSid?: string;
  operation?: string;
  [key: string]: unknown;
}

/**
 * Structured error log entry.
 * Contains error type, message, stack trace, context, and HTTP metadata.
 */
export interface StructuredErrorLog {
  errorType: ErrorType;
  errorMessage: string;
  stackTrace?: string;
  context: ErrorContext;
  statusCode: number;
  isRetryable: boolean;
}

/**
 * Format an error into a structured log entry.
 *
 * @param error The error to format
 * @param context Additional context (requestId, phoneNumber, etc)
 * @param statusCode HTTP response status code
 * @returns Structured log object for use with logEvent()
 */
export function formatErrorLog(
  error: unknown,
  context: ErrorContext,
  statusCode: number
): StructuredErrorLog {
  const classification = classifyError(error);

  // Extract error details
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stackTrace = error instanceof Error ? error.stack : undefined;

  return {
    errorType: classification.type,
    errorMessage,
    stackTrace, // Only included for actual errors, not for normal flow
    context,
    statusCode,
    isRetryable: classification.isRetryable,
  };
}

/**
 * Determine HTTP status code from error classification.
 *
 * @param classification Error classification result
 * @param defaultStatus Default status if classification doesn't determine one (default 500)
 * @returns HTTP status code
 */
export function getStatusCodeForError(
  classification: ErrorClassification,
  defaultStatus: number = 500
): number {
  switch (classification.type) {
    case "ValidationError":
      return 400; // Bad Request
    case "IdempotencyError":
      return 400; // Bad Request (detected early) or 200 (expected case)
    case "AuthError":
      return 401; // Unauthorized
    case "ProcessingError":
    case "SystemError":
    default:
      return defaultStatus; // 500 for server errors, retryable by Twilio
  }
}
