/**
 * KidSchedule – SendGrid Email Adapter
 *
 * Production email sending via SendGrid API v3.
 * Uses dynamic templates for transactional emails.
 *
 * Required environment variables:
 *   SENDGRID_API_KEY - SendGrid API key with Mail Send permissions
 *   SENDGRID_FROM_EMAIL - Verified sender email (e.g., noreply@kidschedule.com)
 *   SENDGRID_FROM_NAME - Display name (e.g., "KidSchedule")
 *
 * Dynamic Template Setup:
 *   1. Create templates in SendGrid Dashboard → Email API → Dynamic Templates
 *   2. Use template IDs matching EMAIL_TEMPLATES constants
 *   3. Template variables use {{variable_name}} syntax
 *
 * @see https://docs.sendgrid.com/api-reference/mail-send/mail-send
 */

import type { EmailSender, EmailSendOptions, EmailSendResult } from "../types";

// SendGrid API endpoint
const SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send";

// Template ID mapping: our internal IDs → SendGrid template IDs
// In production, store these in environment variables or database
const SENDGRID_TEMPLATE_MAP: Record<string, string> = {
  "password-reset": process.env.SENDGRID_TEMPLATE_PASSWORD_RESET ?? "d-xxxxxxxxxxxxx",
  "password-reset-confirmation": process.env.SENDGRID_TEMPLATE_PASSWORD_RESET_CONFIRMATION ?? "d-xxxxxxxxxxxxx",
  "email-verification": process.env.SENDGRID_TEMPLATE_EMAIL_VERIFICATION ?? "d-xxxxxxxxxxxxx",
  "welcome": process.env.SENDGRID_TEMPLATE_WELCOME ?? "d-xxxxxxxxxxxxx",
  "phone-verified": process.env.SENDGRID_TEMPLATE_PHONE_VERIFIED ?? "d-xxxxxxxxxxxxx",
  "session-revoked": process.env.SENDGRID_TEMPLATE_SESSION_REVOKED ?? "d-xxxxxxxxxxxxx",
};

export class SendGridAdapter implements EmailSender {
  readonly providerName = "sendgrid";

  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor() {
    this.apiKey = process.env.SENDGRID_API_KEY ?? "";
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL ?? "noreply@kidschedule.com";
    this.fromName = process.env.SENDGRID_FROM_NAME ?? "KidSchedule";

    if (!this.apiKey) {
      console.warn("[SendGridAdapter] SENDGRID_API_KEY not configured");
    }
  }

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    const { to, subject, templateId, variables, replyTo, tags } = options;

    // Map internal template ID to SendGrid template ID
    const sendgridTemplateId = SENDGRID_TEMPLATE_MAP[templateId];
    if (!sendgridTemplateId || sendgridTemplateId.startsWith("d-xxx")) {
      // Fallback: send plain text email if template not configured
      return this.sendPlainText(to, subject, this.renderFallbackText(templateId, variables));
    }

    const payload = {
      personalizations: [
        {
          to: [{ email: to }],
          dynamic_template_data: variables,
        },
      ],
      from: {
        email: this.fromEmail,
        name: this.fromName,
      },
      reply_to: replyTo ? { email: replyTo } : undefined,
      template_id: sendgridTemplateId,
      categories: tags,
      tracking_settings: {
        click_tracking: { enable: true },
        open_tracking: { enable: true },
      },
    };

    try {
      const response = await fetch(SENDGRID_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        // SendGrid returns message ID in X-Message-Id header
        const messageId = response.headers.get("X-Message-Id") ?? undefined;
        return { success: true, messageId };
      }

      const errorBody = await response.text();
      console.error("[SendGridAdapter] Send failed:", response.status, errorBody);

      return {
        success: false,
        error: `SendGrid API error: ${response.status}`,
        errorCode: `HTTP_${response.status}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[SendGridAdapter] Network error:", message);

      return {
        success: false,
        error: `Network error: ${message}`,
        errorCode: "NETWORK_ERROR",
      };
    }
  }

  /**
   * Send plain text email when template is not configured.
   * Used as fallback during development or when templates are not set up.
   */
  private async sendPlainText(
    to: string,
    subject: string,
    text: string
  ): Promise<EmailSendResult> {
    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: this.fromEmail, name: this.fromName },
      subject,
      content: [{ type: "text/plain", value: text }],
    };

    try {
      const response = await fetch(SENDGRID_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const messageId = response.headers.get("X-Message-Id") ?? undefined;
        return { success: true, messageId };
      }

      return {
        success: false,
        error: `SendGrid API error: ${response.status}`,
        errorCode: `HTTP_${response.status}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message, errorCode: "NETWORK_ERROR" };
    }
  }

  /**
   * Render fallback plain text when template is not configured.
   */
  private renderFallbackText(templateId: string, variables: Record<string, string>): string {
    switch (templateId) {
      case "password-reset":
        return `Reset your KidSchedule password:\n\n${variables.resetLink}\n\nThis link expires in ${variables.expiryTime}.`;
      case "otp-verification":
        return `Your KidSchedule verification code is: ${variables.otp}\n\nExpires in ${variables.expiryMinutes} minutes.`;
      default:
        return `KidSchedule notification\n\n${JSON.stringify(variables, null, 2)}`;
    }
  }

  async verifyConfiguration(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    // Verify API key by checking account info
    try {
      const response = await fetch("https://api.sendgrid.com/v3/user/profile", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
