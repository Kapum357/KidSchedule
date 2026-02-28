/**
 * KidSchedule – Email Provider Factory
 *
 * Returns the configured email sender based on EMAIL_PROVIDER environment variable.
 * Supports: sendgrid, ses, console (dev logging)
 */

import type { EmailSender, EmailSendOptions, EmailSendResult } from "../types";
import { SendGridAdapter } from "./sendgrid-adapter";

// ─── Console Adapter (Development) ────────────────────────────────────────────

/**
 * Development-only email sender that logs to console.
 * Never use in production – no emails are actually sent.
 */
class ConsoleEmailAdapter implements EmailSender {
  readonly providerName = "console";

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    const { to, subject, templateId, variables } = options;

    console.log("\n" + "=".repeat(60));
    console.log("📧 EMAIL (DEV MODE - NOT SENT)");
    console.log("=".repeat(60));
    console.log(`To:       ${to}`);
    console.log(`Subject:  ${subject}`);
    console.log(`Template: ${templateId}`);
    console.log("Variables:");
    Object.entries(variables).forEach(([key, value]) => {
      // Mask sensitive values (tokens, OTPs)
      const isSensitive = /token|otp|password|secret/i.test(key);
      const displayValue = isSensitive && value.length > 20
        ? `${value.slice(0, 8)}...${value.slice(-4)}`
        : value;
      console.log(`  ${key}: ${displayValue}`);
    });
    console.log("=".repeat(60) + "\n");

    return {
      success: true,
      messageId: `dev-${Date.now()}`,
    };
  }

  async verifyConfiguration(): Promise<boolean> {
    return true;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

let cachedSender: EmailSender | null = null;

/**
 * Returns the configured email sender instance.
 * Caches the instance for reuse across requests.
 *
 * Environment variable EMAIL_PROVIDER controls which adapter is used:
 *   - "sendgrid" → SendGridAdapter
 *   - "console" or undefined → ConsoleEmailAdapter (dev only)
 */
export function getEmailSender(): EmailSender {
  if (cachedSender) {
    return cachedSender;
  }

  const provider = process.env.EMAIL_PROVIDER?.toLowerCase() ?? "console";

  switch (provider) {
    case "sendgrid":
      cachedSender = new SendGridAdapter();
      break;
    case "console":
    default:
      if (process.env.NODE_ENV === "production") {
        console.warn(
          "[Email] Using console adapter in production. Set EMAIL_PROVIDER to sendgrid."
        );
      }
      cachedSender = new ConsoleEmailAdapter();
      break;
  }

  return cachedSender;
}

// Re-export types
export type { EmailSender, EmailSendOptions, EmailSendResult };
export { SendGridAdapter, ConsoleEmailAdapter };
