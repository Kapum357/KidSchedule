/**
 * KidSchedule – AWS SNS SMS Adapter
 *
 * Production SMS sending via AWS Simple Notification Service.
 *
 * Required environment variables:
 *   AWS_ACCESS_KEY_ID - IAM credentials with SNS publish permissions
 *   AWS_SECRET_ACCESS_KEY - IAM secret key
 *   AWS_SNS_REGION - SNS region (e.g., "us-east-1")
 *   SNS_SENDER_ID - Optional sender ID (supported in some regions)
 *
 * SMS Types:
 *   - Transactional: OTP, verification codes (high priority)
 *   - Promotional: Marketing messages (lower cost)
 *
 * @see https://docs.aws.amazon.com/sns/latest/dg/sms_publish-to-phone.html
 */

import type { SmsSender, SmsSendOptions, SmsSendResult } from "../types";

const SNS_REGION = process.env.AWS_SNS_REGION ?? "us-east-1";

// SMS message templates with {{variable}} placeholders
const SMS_TEMPLATES: Record<string, string> = {
  "otp-verification": "Your KidSchedule code is {{otp}}. Expires in {{expiryMinutes}} min.",
  "phone-verification-success": "Your phone ({{phone}}) is now verified for KidSchedule.",
  "custody-transition-alert": "Reminder: Custody transition to {{toParent}} at {{time}} today.",
  "urgent-message": "KidSchedule: Urgent message from {{fromParent}}. Open app to view.",
};

export class SNSAdapter implements SmsSender {
  readonly providerName = "sns";

  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly senderId: string | null;

  constructor() {
    this.accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? "";
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? "";
    this.senderId = process.env.SNS_SENDER_ID ?? null;

    if (!this.accessKeyId || !this.secretAccessKey) {
      console.warn("[SNSAdapter] AWS credentials not configured");
    }
  }

  async send(options: SmsSendOptions): Promise<SmsSendResult> {
    const { to, templateId, variables } = options;

    // Get template and interpolate variables
    const template = SMS_TEMPLATES[templateId];
    if (!template) {
      return {
        success: false,
        error: `Unknown SMS template: ${templateId}`,
        errorCode: "TEMPLATE_NOT_FOUND",
      };
    }

    const message = this.interpolateTemplate(template, variables);

    /**
     * Production Implementation:
     *
     * import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
     *
     * const client = new SNSClient({ region: SNS_REGION });
     * const command = new PublishCommand({
     *   PhoneNumber: to,
     *   Message: message,
     *   MessageAttributes: {
     *     "AWS.SNS.SMS.SMSType": {
     *       DataType: "String",
     *       StringValue: "Transactional", // or "Promotional"
     *     },
     *     ...(this.senderId && {
     *       "AWS.SNS.SMS.SenderID": {
     *         DataType: "String",
     *         StringValue: this.senderId,
     *       },
     *     }),
     *   },
     * });
     *
     * try {
     *   const response = await client.send(command);
     *   return { success: true, messageId: response.MessageId };
     * } catch (error) {
     *   return { success: false, error: error.message };
     * }
     */

    // Placeholder implementation using raw API call
    const params = new URLSearchParams({
      Action: "Publish",
      Version: "2010-03-31",
      PhoneNumber: to,
      Message: message,
      "MessageAttributes.entry.1.Name": "AWS.SNS.SMS.SMSType",
      "MessageAttributes.entry.1.Value.DataType": "String",
      "MessageAttributes.entry.1.Value.StringValue": "Transactional",
    });

    if (this.senderId) {
      params.append("MessageAttributes.entry.2.Name", "AWS.SNS.SMS.SenderID");
      params.append("MessageAttributes.entry.2.Value.DataType", "String");
      params.append("MessageAttributes.entry.2.Value.StringValue", this.senderId);
    }

    try {
      const endpoint = `https://sns.${SNS_REGION}.amazonaws.com`;

      // In production, use proper AWS Signature V4 signing
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // AWS Signature V4 headers would go here
        },
        body: params.toString(),
      });

      if (response.ok) {
        const text = await response.text();
        const messageIdMatch = text.match(/<MessageId>(.+?)<\/MessageId>/);
        return {
          success: true,
          messageId: messageIdMatch?.[1],
        };
      }

      const errorText = await response.text();
      console.error("[SNSAdapter] Send failed:", response.status, errorText);

      return {
        success: false,
        error: `SNS API error: ${response.status}`,
        errorCode: `HTTP_${response.status}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[SNSAdapter] Network error:", message);

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
    if (!this.accessKeyId || !this.secretAccessKey) {
      return false;
    }

    /**
     * Production Implementation:
     *
     * import { SNSClient, GetSMSAttributesCommand } from "@aws-sdk/client-sns";
     * const client = new SNSClient({ region: SNS_REGION });
     * try {
     *   await client.send(new GetSMSAttributesCommand({}));
     *   return true;
     * } catch {
     *   return false;
     * }
     */

    return true; // Placeholder
  }
}
