/**
 * KidSchedule – Audit Logger
 *
 * Structured audit logging for security-relevant events.
 * Logs are stored in database AND optionally sent to external systems.
 *
 * Security principles:
 *   - Never log PII beyond what's necessary for audit (no passwords, full tokens)
 *   - Tokens are logged as hashes or prefixes only
 *   - IP addresses are logged for security investigations
 *   - User agents are logged for device fingerprinting
 *
 * Log destinations:
 *   - Database (via AuditLogRepository) for compliance/retention
 *   - Console (structured JSON) for log aggregation (Datadog, CloudWatch, etc.)
 */

import type { AuditAction, DbAuditLog } from "../persistence/types";
import { db } from "../persistence";

// ─── Audit Event Types ────────────────────────────────────────────────────────

export interface AuditContext {
  userId?: string;
  ip?: string;
  userAgent?: string;
}

export interface AuditMetadata {
  [key: string]: string | number | boolean | null | undefined;
}

// ─── PII Sanitization ─────────────────────────────────────────────────────────

/**
 * Masks email address for logging.
 * user@example.com → u***@example.com
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const maskedLocal = local.length > 1 ? local[0] + "***" : "***";
  return `${maskedLocal}@${domain}`;
}

/**
 * Masks phone number for logging.
 * +12345678901 → +1****8901
 */
function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length < 4) return "***";

  const last4 = trimmed.slice(-4);
  const prefix = trimmed.startsWith("+") && trimmed.length >= 2
    ? trimmed.slice(0, 2)
    : "+*";

  return `${prefix}****${last4}`;
}

/**
 * Truncates token to safe prefix for logging.
 * abc123xyz789... → abc123...
 */
function truncateToken(token: string, prefixLength = 8): string {
  if (token.length <= prefixLength) return "***";
  return token.slice(0, prefixLength) + "...";
}

/**
 * Sanitizes metadata to remove or mask sensitive values.
 */
function sanitizeMetadata(metadata: AuditMetadata): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;

    // Mask known sensitive keys
    if (/email/i.test(key) && typeof value === "string") {
      sanitized[key] = maskEmail(value);
    } else if (/phone/i.test(key) && typeof value === "string") {
      sanitized[key] = maskPhone(value);
    } else if (/token|secret|password|otp/i.test(key) && typeof value === "string") {
      sanitized[key] = truncateToken(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ─── Audit Logger Class ───────────────────────────────────────────────────────

class AuditLogger {
  private readonly enableConsole: boolean;

  constructor() {
    // Enable console logging in all environments for log aggregation
    this.enableConsole = true;
  }

  /**
   * Log an audit event.
   * Writes to both database and console (for log aggregation).
   */
  async log(
    action: AuditAction,
    context: AuditContext,
    metadata: AuditMetadata = {}
  ): Promise<DbAuditLog | null> {
    const sanitizedMetadata = sanitizeMetadata(metadata);
    const timestamp = new Date().toISOString();

    // Console log (structured JSON for log aggregation)
    if (this.enableConsole) {
      const logEntry = {
        level: "audit",
        action,
        userId: context.userId,
        ip: context.ip,
        // Truncate user agent for log brevity
        ua: context.userAgent?.slice(0, 100),
        metadata: sanitizedMetadata,
        timestamp,
      };

      // Use JSON format for machine parsing
      console.log(JSON.stringify(logEntry));
    }

    // Database log (async, non-blocking)
    try {
      return await db.auditLogs.create({
        userId: context.userId,
        action,
        metadata: sanitizedMetadata,
        ip: context.ip,
        userAgent: context.userAgent,
      });
    } catch (error) {
      // Log database failures but don't throw – audit should never break the flow
      console.error("[AuditLogger] Database write failed:", error);
      return null;
    }
  }

  // ─── Convenience Methods ──────────────────────────────────────────────────

  async loginSuccess(context: AuditContext, email: string): Promise<void> {
    await this.log("user.login", context, { email, success: true });
  }

  async loginFailed(context: AuditContext, email: string, reason: string): Promise<void> {
    await this.log("user.login_failed", context, { email, reason });
  }

  async logout(context: AuditContext): Promise<void> {
    await this.log("user.logout", context);
  }

  async register(context: AuditContext, email: string): Promise<void> {
    await this.log("user.register", context, { email });
  }

  async passwordResetRequest(context: AuditContext, email: string): Promise<void> {
    await this.log("user.password_reset_request", context, { email });
  }

  async passwordResetComplete(context: AuditContext, email: string): Promise<void> {
    await this.log("user.password_reset_complete", context, { email });
  }

  async phoneVerifyRequest(context: AuditContext, phone: string): Promise<void> {
    await this.log("user.phone_verify_request", context, { phone });
  }

  async phoneVerifySuccess(context: AuditContext, phone: string): Promise<void> {
    await this.log("user.phone_verify_success", context, { phone });
  }

  async phoneVerifyFailed(
    context: AuditContext,
    phone: string,
    attemptsRemaining: number
  ): Promise<void> {
    await this.log("user.phone_verify_failed", context, { phone, attemptsRemaining });
  }

  async sessionCreate(context: AuditContext, sessionId: string): Promise<void> {
    await this.log("session.create", context, { sessionId: truncateToken(sessionId) });
  }

  async sessionRefresh(context: AuditContext, sessionId: string): Promise<void> {
    await this.log("session.refresh", context, { sessionId: truncateToken(sessionId) });
  }

  async sessionRevoke(context: AuditContext, sessionId: string, reason?: string): Promise<void> {
    await this.log("session.revoke", context, { sessionId: truncateToken(sessionId), reason });
  }

  async sessionRevokeAll(context: AuditContext, reason?: string): Promise<void> {
    await this.log("session.revoke_all", context, { reason });
  }

  async rateLimitTriggered(context: AuditContext, key: string, type: string): Promise<void> {
    // Don't log the full key (may contain email)
    const sanitizedKey = key.split(":")[0] + ":***";
    await this.log("rate_limit.triggered", context, { keyType: sanitizedKey, limitType: type });
  }

  async suspiciousActivity(
    context: AuditContext,
    reason: string,
    details: AuditMetadata = {}
  ): Promise<void> {
    await this.log("security.suspicious_activity", context, { reason, ...details });
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const audit = new AuditLogger();
