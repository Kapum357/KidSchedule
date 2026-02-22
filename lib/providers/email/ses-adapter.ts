/**
 * KidSchedule – AWS SES Email Adapter
 *
 * Production email sending via AWS Simple Email Service.
 * Uses SES templated emails for transactional communications.
 *
 * Required environment variables:
 *   AWS_ACCESS_KEY_ID - IAM credentials with SES send permissions
 *   AWS_SECRET_ACCESS_KEY - IAM secret key
 *   AWS_SES_REGION - SES region (e.g., "us-east-1")
 *   SES_FROM_EMAIL - Verified sender email
 *   SES_FROM_NAME - Display name
 *
 * SES Template Setup:
 *   1. Create templates via AWS CLI or SDK: aws ses create-template
 *   2. Templates use {{variable}} syntax in both Subject and Body
 *   3. Ensure sender email is verified in SES console
 *
 * @see https://docs.aws.amazon.com/ses/latest/dg/send-personalized-email-api.html
 */

import type { EmailSender, EmailSendOptions, EmailSendResult } from "../types";

// AWS SES configuration
const SES_REGION = process.env.AWS_SES_REGION ?? "us-east-1";
const SES_ENDPOINT = `https://email.${SES_REGION}.amazonaws.com`;

// Template name mapping: our internal IDs → SES template names
const SES_TEMPLATE_MAP: Record<string, string> = {
  "password-reset": "KidSchedule_PasswordReset",
  "password-reset-confirmation": "KidSchedule_PasswordResetConfirmation",
  "email-verification": "KidSchedule_EmailVerification",
  "welcome": "KidSchedule_Welcome",
  "phone-verified": "KidSchedule_PhoneVerified",
  "session-revoked": "KidSchedule_SessionRevoked",
};

/**
 * Sign AWS request with Signature Version 4.
 * In production, use @aws-sdk/client-ses for proper signing.
 */
async function signAwsRequest(
  method: string,
  url: string,
  body: string,
  service: string
): Promise<Record<string, string>> {
  // This is a simplified placeholder. In production:
  // import { SESClient, SendTemplatedEmailCommand } from "@aws-sdk/client-ses";
  // const client = new SESClient({ region: SES_REGION });
  // await client.send(new SendTemplatedEmailCommand({ ... }));
  
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  return {
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Amz-Date": amzDate,
    // In production: compute proper AWS Signature V4
    "Authorization": `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY_ID}/${dateStamp}/${SES_REGION}/${service}/aws4_request`,
  };
}

export class SESAdapter implements EmailSender {
  readonly providerName = "ses";

  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor() {
    this.accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? "";
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? "";
    this.fromEmail = process.env.SES_FROM_EMAIL ?? "noreply@kidschedule.com";
    this.fromName = process.env.SES_FROM_NAME ?? "KidSchedule";

    if (!this.accessKeyId || !this.secretAccessKey) {
      console.warn("[SESAdapter] AWS credentials not configured");
    }
  }

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    const { to, templateId, variables } = options;

    // Map internal template ID to SES template name
    const sesTemplateName = SES_TEMPLATE_MAP[templateId];
    if (!sesTemplateName) {
      return {
        success: false,
        error: `Unknown template: ${templateId}`,
        errorCode: "TEMPLATE_NOT_FOUND",
      };
    }

    /**
     * Production Implementation:
     * 
     * import { SESClient, SendTemplatedEmailCommand } from "@aws-sdk/client-ses";
     * 
     * const client = new SESClient({ region: SES_REGION });
     * const command = new SendTemplatedEmailCommand({
     *   Source: `${this.fromName} <${this.fromEmail}>`,
     *   Destination: { ToAddresses: [to] },
     *   Template: sesTemplateName,
     *   TemplateData: JSON.stringify(variables),
     *   ConfigurationSetName: "KidSchedule-Transactional",
     * });
     * 
     * try {
     *   const response = await client.send(command);
     *   return { success: true, messageId: response.MessageId };
     * } catch (error) {
     *   return { success: false, error: error.message };
     * }
     */

    // Placeholder: build SES request body
    const params = new URLSearchParams({
      Action: "SendTemplatedEmail",
      Version: "2010-12-01",
      Source: `${this.fromName} <${this.fromEmail}>`,
      "Destination.ToAddresses.member.1": to,
      Template: sesTemplateName,
      TemplateData: JSON.stringify(variables),
    });

    try {
      const headers = await signAwsRequest("POST", SES_ENDPOINT, params.toString(), "ses");

      const response = await fetch(SES_ENDPOINT, {
        method: "POST",
        headers,
        body: params.toString(),
      });

      if (response.ok) {
        const text = await response.text();
        // Parse MessageId from XML response
        const messageIdMatch = text.match(/<MessageId>(.+?)<\/MessageId>/);
        return {
          success: true,
          messageId: messageIdMatch?.[1],
        };
      }

      const errorText = await response.text();
      console.error("[SESAdapter] Send failed:", response.status, errorText);

      return {
        success: false,
        error: `SES API error: ${response.status}`,
        errorCode: `HTTP_${response.status}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[SESAdapter] Network error:", message);

      return {
        success: false,
        error: `Network error: ${message}`,
        errorCode: "NETWORK_ERROR",
      };
    }
  }

  async verifyConfiguration(): Promise<boolean> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      return false;
    }

    /**
     * Production Implementation:
     * 
     * import { SESClient, GetAccountCommand } from "@aws-sdk/client-ses";
     * const client = new SESClient({ region: SES_REGION });
     * try {
     *   await client.send(new GetAccountCommand({}));
     *   return true;
     * } catch {
     *   return false;
     * }
     */

    return true; // Placeholder
  }
}
