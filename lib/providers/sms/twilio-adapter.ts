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

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
    this.authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
    this.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID ?? null;
    this.fromNumber = process.env.TWILIO_FROM_NUMBER ?? null;

    if (!this.accountSid || !this.authToken) {
      console.warn("[TwilioAdapter] Twilio credentials not configured");
    }
    if (!this.messagingServiceSid && !this.fromNumber) {
      console.warn("[TwilioAdapter] Either TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER required");
    }
  }

  async send(options: SmsSendOptions): Promise<SmsSendResult> {
    const { to, templateId, variables, from } = options;

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

    // Use messaging service SID (preferred) or from number
    if (from) {
      formData.append("From", from);
    } else if (this.messagingServiceSid) {
      formData.append("MessagingServiceSid", this.messagingServiceSid);
    } else if (this.fromNumber) {
      formData.append("From", this.fromNumber);
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");

    try {
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
        return {
          success: true,
          messageId: data.sid,
        };
      }

      console.error("[TwilioAdapter] Send failed:", data);

      return {
        success: false,
        error: data.message ?? `Twilio API error: ${response.status}`,
        errorCode: data.code?.toString() ?? `HTTP_${response.status}`,
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
