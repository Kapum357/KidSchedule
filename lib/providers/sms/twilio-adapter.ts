/**
 * KidSchedule – Twilio SMS Adapter
 *
 * Production SMS sending via Twilio Programmable Messaging API.
 *
 * Required environment variables:
 *   TWILIO_ACCOUNT_SID - Twilio account SID
 *   TWILIO_AUTH_TOKEN - Twilio auth token
 *   TWILIO_MESSAGING_SERVICE_SID - Messaging service SID (or TWILIO_FROM_NUMBER)
 *
 * Message Templates:
 *   Templates are stored in code (not Twilio) for flexibility.
 *   Variables are interpolated before sending.
 *
 * @see https://www.twilio.com/docs/messaging/api/message-resource
 */

import type { SmsSender, SmsSendOptions, SmsSendResult } from "../types";
import { getProxyNumberForFamily } from "./proxy-number";
import { createSmsDeliveryRecord, updateSmsDeliveryStatus } from "./status-tracker";

// SMS message templates with {{variable}} placeholders
const SMS_TEMPLATES: Record<string, string> = {
  "otp-verification": "Your KidSchedule verification code is {{otp}}. Expires in {{expiryMinutes}} minutes. Do not share this code.",
  "phone-verification-success": "Your phone number ({{phone}}) has been verified for KidSchedule.",
  "custody-transition-alert": "Reminder: Custody transition to {{toParent}} at {{time}} today.",
  "urgent-message": "KidSchedule: You have an urgent message from {{fromParent}}. Open the app to view.",
};

export class TwilioAdapter implements SmsSender {
  readonly providerName = "twilio";

  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly messagingServiceSid: string | null;
  private readonly fromNumber: string | null;
  private readonly statusCallbackUrl: string | null;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
    this.authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
    this.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID ?? null;
    this.fromNumber = process.env.TWILIO_FROM_NUMBER ?? null;
    this.statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL ?? null;
    this.maxRetries = Number(process.env.TWILIO_MAX_RETRIES ?? "3");
    this.baseBackoffMs = Number(process.env.TWILIO_BACKOFF_BASE_MS ?? "250");

    if (!this.accountSid || !this.authToken) {
      console.warn("[TwilioAdapter] Twilio credentials not configured");
    }
    if (!this.messagingServiceSid && !this.fromNumber) {
      console.warn("[TwilioAdapter] Either TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER required");
    }
  }

  async send(options: SmsSendOptions): Promise<SmsSendResult> {
    const { to, templateId, variables, from, familyId } = options;

    // Get template and interpolate variables
    const template = SMS_TEMPLATES[templateId];
    if (!template) {
      return {
        success: false,
        error: `Unknown SMS template: ${templateId}`,
        errorCode: "TEMPLATE_NOT_FOUND",
      };
    }

    const body = this.interpolateTemplate(template, variables);

    // Build request body
    const formData = new URLSearchParams({
      To: to,
      Body: body,
    });

    if (this.statusCallbackUrl) {
      formData.append("StatusCallback", this.statusCallbackUrl);
    }

    const proxyNumber = familyId ? getProxyNumberForFamily(familyId) : null;

    // Use messaging service SID (preferred) or from number
    if (from) {
      formData.append("From", from);
    } else if (proxyNumber) {
      formData.append("From", proxyNumber);
    } else if (this.messagingServiceSid) {
      formData.append("MessagingServiceSid", this.messagingServiceSid);
    } else if (this.fromNumber) {
      formData.append("From", this.fromNumber);
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");

    try {
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        });

        const data = await response.json();

        if (response.ok) {
          if (data?.sid) {
            createSmsDeliveryRecord({
              messageId: data.sid,
              to,
              familyId,
              status: "queued",
              providerStatus: data.status,
            });
          }

          return {
            success: true,
            messageId: data.sid,
            status: "queued",
            providerStatus: data.status,
            retryCount: attempt,
          };
        }

        const isRateLimited = response.status === 429 || data?.code?.toString() === "20429";
        if (isRateLimited && attempt < this.maxRetries) {
          const retryAfterHeader = response.headers.get("retry-after");
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
          const fallbackBackoffMs = this.baseBackoffMs * 2 ** attempt;
          const backoffMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0
            ? retryAfterMs
            : fallbackBackoffMs;

          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        console.error("[TwilioAdapter] Send failed:", data);

        if (data?.sid) {
          updateSmsDeliveryStatus({
            messageId: data.sid,
            status: "failed",
            providerStatus: data.status,
            errorCode: data.code?.toString(),
            errorMessage: data.message,
          });
        }

        return {
          success: false,
          error: data.message ?? `Twilio API error: ${response.status}`,
          errorCode: data.code?.toString() ?? `HTTP_${response.status}`,
          status: "failed",
          providerStatus: data.status,
          retryCount: attempt,
        };
      }

      return {
        success: false,
        error: "Twilio API retry attempts exhausted",
        errorCode: "RETRY_EXHAUSTED",
        status: "failed",
        retryCount: this.maxRetries,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[TwilioAdapter] Network error:", message);

      return {
        success: false,
        error: `Network error: ${message}`,
        errorCode: "NETWORK_ERROR",
      };
    }
  }

  /**
   * Interpolate {{variable}} placeholders in template.
   */
  private interpolateTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
  }

  async verifyConfiguration(): Promise<boolean> {
    if (!this.accountSid || !this.authToken) {
      return false;
    }

    // Verify credentials by fetching account info
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
