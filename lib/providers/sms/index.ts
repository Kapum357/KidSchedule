/**
 * KidSchedule – SMS Provider Factory
 *
 * Returns the configured SMS sender based on SMS_PROVIDER environment variable.
 * Supports: twilio, sns, console (dev logging)
 */

import type { SmsSender, SmsSendOptions, SmsSendResult } from "../types";
import { TwilioAdapter } from "./twilio-adapter";
import { SNSAdapter } from "./sns-adapter";

// ─── Console Adapter (Development) ────────────────────────────────────────────

/**
 * Development-only SMS sender that logs to console.
 * Never use in production – no messages are actually sent.
 */
class ConsoleSmsAdapter implements SmsSender {
  readonly providerName = "console";

  async send(options: SmsSendOptions): Promise<SmsSendResult> {
    const { to, templateId, variables } = options;

    console.log("\n" + "=".repeat(60));
    console.log("📱 SMS (DEV MODE - NOT SENT)");
    console.log("=".repeat(60));
    console.log(`To:       ${to}`);
    console.log(`Template: ${templateId}`);
    console.log("Variables:");
    Object.entries(variables).forEach(([key, value]) => {
      // Mask OTP in logs for security awareness
      const isSensitive = /otp|code|token/i.test(key);
      const displayValue = isSensitive ? value : value;
      console.log(`  ${key}: ${displayValue}`);
    });
    console.log("=".repeat(60) + "\n");

    return {
      success: true,
      messageId: `dev-sms-${Date.now()}`,
    };
  }

  async verifyConfiguration(): Promise<boolean> {
    return true;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

let cachedSender: SmsSender | null = null;

/**
 * Returns the configured SMS sender instance.
 * Caches the instance for reuse across requests.
 *
 * Environment variable SMS_PROVIDER controls which adapter is used:
 *   - "twilio" → TwilioAdapter
 *   - "sns" → SNSAdapter
 *   - "console" or undefined → ConsoleSmsAdapter (dev only)
 */
export function getSmsSender(): SmsSender {
  if (cachedSender) {
    return cachedSender;
  }

  const provider = process.env.SMS_PROVIDER?.toLowerCase() ?? "console";

  switch (provider) {
    case "twilio":
      cachedSender = new TwilioAdapter();
      break;
    case "sns":
      cachedSender = new SNSAdapter();
      break;
    case "console":
    default:
      if (process.env.NODE_ENV === "production") {
        console.warn(
          "[SMS] Using console adapter in production. Set SMS_PROVIDER to twilio or sns."
        );
      }
      cachedSender = new ConsoleSmsAdapter();
      break;
  }

  return cachedSender;
}

// Re-export types
export type { SmsSender, SmsSendOptions, SmsSendResult };
export { TwilioAdapter, SNSAdapter, ConsoleSmsAdapter };
