/**
 * Webhook Error Handler Tests
 *
 * Tests for error classification and detailed logging.
 *
 * Coverage:
 * - Test 1: Zod validation error → ValidationError, not retryable
 * - Test 2: Duplicate event → IdempotencyError, not retryable
 * - Test 3: Network timeout → SystemError, retryable
 * - Test 4: Database error → SystemError, retryable
 * - Test 5: Processing failure → ProcessingError, retryable
 * - Test 6: Auth signature failure → AuthError, not retryable
 * - Test 7: Logged events include stack traces and context
 * - Test 8: Retryable flag correctly set based on error type
 */

import { ZodError } from "zod";
import {
  classifyError,
  ErrorClassification,
  formatErrorLog,
  getStatusCodeForError,
} from "@/lib/providers/webhook-error-handler";

describe("Webhook Error Handler", () => {
  // ─── Test 1: Zod Validation Error ─────────────────────────────────────────

  it("Test 1: Zod validation error → ValidationError, not retryable", () => {
    // Create a ZodError by parsing invalid data
    const zodError = new ZodError([
      {
        code: "invalid_type",
        expected: "string" as any,
        received: "undefined" as any,
        path: ["phoneNumber"],
        message: "Required",
      } as any,
    ]);

    const result = classifyError(zodError);

    expect(result.type).toBe("ValidationError");
    expect(result.isRetryable).toBe(false);
  });

  // ─── Test 2: Duplicate Event ──────────────────────────────────────────────

  it("Test 2: Duplicate event → IdempotencyError, not retryable", () => {
    const error = new Error("UNIQUE constraint failed: twilio_webhook_events.message_sid");

    const result = classifyError(error);

    expect(result.type).toBe("IdempotencyError");
    expect(result.isRetryable).toBe(false);
  });

  it("Test 2b: Duplicate error with 'Duplicate' prefix", () => {
    const error = new Error("Duplicate key violation");

    const result = classifyError(error);

    expect(result.type).toBe("IdempotencyError");
    expect(result.isRetryable).toBe(false);
  });

  // ─── Test 3: Network Timeout ──────────────────────────────────────────────

  it("Test 3: Network timeout → SystemError, retryable", () => {
    const error = new Error("ETIMEDOUT: connection timeout");

    const result = classifyError(error);

    expect(result.type).toBe("SystemError");
    expect(result.isRetryable).toBe(true);
  });

  it("Test 3b: ECONNREFUSED error", () => {
    const error = new Error("ECONNREFUSED: connection refused");

    const result = classifyError(error);

    expect(result.type).toBe("SystemError");
    expect(result.isRetryable).toBe(true);
  });

  it("Test 3c: Socket hang up error", () => {
    const error = new Error("socket hang up");

    const result = classifyError(error);

    expect(result.type).toBe("SystemError");
    expect(result.isRetryable).toBe(true);
  });

  // ─── Test 4: Database Error ───────────────────────────────────────────────

  it("Test 4: Database error → SystemError, retryable", () => {
    const error = new Error("database connection pool exhausted");

    const result = classifyError(error);

    expect(result.type).toBe("SystemError");
    expect(result.isRetryable).toBe(true);
  });

  it("Test 4b: SQL error", () => {
    const error = new Error("SQL syntax error near 'SELECT'");

    const result = classifyError(error);

    expect(result.type).toBe("SystemError");
    expect(result.isRetryable).toBe(true);
  });

  it("Test 4c: DB_ prefixed error", () => {
    const error = new Error("DB_CONNECTION_TIMEOUT");

    const result = classifyError(error);

    expect(result.type).toBe("SystemError");
    expect(result.isRetryable).toBe(true);
  });

  // ─── Test 5: Processing Failure ───────────────────────────────────────────

  it("Test 5: Processing failure → ProcessingError, retryable", () => {
    const error = new Error("Failed to update SMS delivery status");

    const result = classifyError(error);

    expect(result.type).toBe("ProcessingError");
    expect(result.isRetryable).toBe(true);
  });

  it("Test 5b: Generic error", () => {
    const error = new Error("Unknown processing error");

    const result = classifyError(error);

    expect(result.type).toBe("ProcessingError");
    expect(result.isRetryable).toBe(true);
  });

  // ─── Test 6: Auth Signature Failure ────────────────────────────────────────

  it("Test 6: Auth signature failure → AuthError, not retryable", () => {
    const error = new Error("Invalid Twilio signature");

    const result = classifyError(error);

    expect(result.type).toBe("AuthError");
    expect(result.isRetryable).toBe(false);
  });

  it("Test 6b: invalid_signature error", () => {
    const error = new Error("invalid_signature");

    const result = classifyError(error);

    expect(result.type).toBe("AuthError");
    expect(result.isRetryable).toBe(false);
  });

  // ─── Test 7: Error Logging with Stack Traces ──────────────────────────────

  it("Test 7: Logged events include stack traces and context", () => {
    const error = new Error("Test processing error");
    error.stack = "Error: Test processing error\n    at someFunction (file.ts:10)";

    const context = {
      requestId: "req-123",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      messageSid: "SM123456",
      familyId: "family-789",
    };

    const log = formatErrorLog(error, context, 500);

    expect(log.errorType).toBe("ProcessingError");
    expect(log.errorMessage).toBe("Test processing error");
    expect(log.stackTrace).toBeDefined();
    expect(log.stackTrace).toContain("someFunction");
    expect(log.context).toEqual(context);
    expect(log.statusCode).toBe(500);
    expect(log.isRetryable).toBe(true);
  });

  it("Test 7b: Stack trace only for Error objects", () => {
    const stringError = "String error message";
    const context = { requestId: "req-456" };

    const log = formatErrorLog(stringError, context, 400);

    expect(log.errorMessage).toBe("String error message");
    expect(log.stackTrace).toBeUndefined();
  });

  it("Test 7c: Context preserved in error log", () => {
    const error = new Error("Some error");
    const context = {
      requestId: "req-789",
      phoneNumber: "+15557654321",
      operation: "update_sms_status",
      messageSize: 256,
    };

    const log = formatErrorLog(error, context, 500);

    expect(log.context).toEqual(context);
  });

  // ─── Test 8: Retryable Flag ───────────────────────────────────────────────

  it("Test 8: Retryable flag correctly set for all error types", () => {
    const testCases: Array<[string, boolean]> = [
      // Not retryable
      ["ValidationError from ZodError", false],
      ["IdempotencyError from duplicate", false],
      ["AuthError from signature", false],
      // Retryable
      ["SystemError from network", true],
      ["SystemError from database", true],
      ["ProcessingError default", true],
    ];

    const errors: Array<[string, Error | ZodError]> = [
      ["ValidationError from ZodError", new ZodError([{
        code: "invalid_type",
        expected: "string" as any,
        received: "undefined" as any,
        path: ["test"],
        message: "Required",
      } as any])],
      ["IdempotencyError from duplicate", new Error("UNIQUE constraint failed")],
      ["AuthError from signature", new Error("Invalid Twilio signature")],
      ["SystemError from network", new Error("ETIMEDOUT")],
      ["SystemError from database", new Error("database connection error")],
      ["ProcessingError default", new Error("Some random processing error")],
    ];

    errors.forEach(([description, error], index) => {
      const result = classifyError(error);
      const [_, expectedRetryable] = testCases[index];

      expect(result.isRetryable).toBe(expectedRetryable);
    });
  });

  // ─── Test 9: HTTP Status Code Mapping ─────────────────────────────────────

  it("Test 9: Status code mapping for error types", () => {
    const testCases: Array<[ErrorClassification, number]> = [
      [{ type: "ValidationError", isRetryable: false }, 400],
      [{ type: "IdempotencyError", isRetryable: false }, 400],
      [{ type: "AuthError", isRetryable: false }, 401],
      [{ type: "ProcessingError", isRetryable: true }, 500],
      [{ type: "SystemError", isRetryable: true }, 500],
    ];

    testCases.forEach(([classification, expectedStatus]) => {
      const status = getStatusCodeForError(classification);
      expect(status).toBe(expectedStatus);
    });
  });

  // ─── Test 10: Edge Cases ──────────────────────────────────────────────────

  it("Test 10: Classifying non-Error objects", () => {
    const stringError = "String error";
    const nullError = null;
    const undefinedError = undefined;

    expect(classifyError(stringError)).toEqual({
      type: "ProcessingError",
      isRetryable: true,
    });

    expect(classifyError(nullError)).toEqual({
      type: "ProcessingError",
      isRetryable: true,
    });

    expect(classifyError(undefinedError)).toEqual({
      type: "ProcessingError",
      isRetryable: true,
    });
  });

  it("Test 10b: Error with multiple keywords", () => {
    // Database error with timeout should still be SystemError
    const error = new Error("database connection timeout");

    const result = classifyError(error);

    expect(result.type).toBe("SystemError");
    expect(result.isRetryable).toBe(true);
  });

  it("Test 10c: Case-insensitive keyword matching", () => {
    const errors = [
      new Error("DUPLICATE key"),
      new Error("duplicate key"),
      new Error("DuPlIcAtE key"),
    ];

    errors.forEach((error) => {
      const result = classifyError(error);
      expect(result.type).toBe("IdempotencyError");
    });
  });

  // ─── Test 11: Complex Error Log Scenarios ─────────────────────────────────

  it("Test 11: Error log with Zod error and full context", () => {
    const zodError = new ZodError([
      {
        code: "invalid_type",
        expected: "string" as any,
        received: "number" as any,
        path: ["phoneNumber"],
        message: "Expected string, received number",
      } as any,
    ]);

    const context = {
      requestId: "req-001",
      phoneNumber: "+15551234567",
      eventType: "DeliveryReceipt",
      messageSid: "SM1234567890abcdef",
      familyId: "family-123",
      operation: "validate_webhook_payload",
    };

    const log = formatErrorLog(zodError, context, 400);

    expect(log.errorType).toBe("ValidationError");
    expect(log.statusCode).toBe(400);
    expect(log.isRetryable).toBe(false);
    expect(log.context).toEqual(context);
  });

  it("Test 11b: Error log with network error and operation info", () => {
    const error = new Error("ECONNREFUSED: Failed to connect to Twilio API");

    const context = {
      requestId: "req-002",
      phoneNumber: "+15551234567",
      operation: "call_twilio_opt_out_api",
      statusCode: 503,
    };

    const log = formatErrorLog(error, context, 500);

    expect(log.errorType).toBe("SystemError");
    expect(log.isRetryable).toBe(true);
    expect(log.stackTrace).toBeDefined();
  });

  // ─── Test 12: Error Classification Consistency ────────────────────────────

  it("Test 12: Same error type always returns consistent classification", () => {
    const error = new Error("database pool timeout");

    const result1 = classifyError(error);
    const result2 = classifyError(error);
    const result3 = classifyError(error);

    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
  });

  it("Test 12b: Different error instances of same type classify consistently", () => {
    const error1 = new Error("ETIMEDOUT");
    const error2 = new Error("ETIMEDOUT: connection timeout");

    const result1 = classifyError(error1);
    const result2 = classifyError(error2);

    expect(result1.type).toBe(result2.type);
    expect(result1.isRetryable).toBe(result2.isRetryable);
  });
});
