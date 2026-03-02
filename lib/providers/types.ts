/**
 * KidSchedule – Provider Interface Types
 *
 * Common types shared across all communication providers (email, SMS).
 * Providers are pluggable adapters that implement a standard interface.
 */

// ─── Email Provider Types ─────────────────────────────────────────────────────

export interface EmailSendOptions<
  T extends EmailTemplateId = EmailTemplateId
> {
  to: string;
  subject: string;
  templateId: T;
  // variables object is keyed according to the chosen template; the helper
  // `EmailVariablesMap` provides concrete shapes for well-known templates.
  variables: EmailVariablesMap[T];
  /** Optional reply-to email address */
  replyTo?: string;
  /** Optional email categories/tags for tracking */
  tags?: string[];
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

export interface EmailSender {
  readonly providerName: string;
  send(options: EmailSendOptions): Promise<EmailSendResult>;
  /** Verify provider credentials are configured correctly */
  verifyConfiguration(): Promise<boolean>;
}

// ─── SMS Provider Types ──────────────────────────────────────────────────────

export interface SmsSendOptions<
  T extends SmsTemplateId = SmsTemplateId
> {
  to: string;
  templateId: T;
  variables: SmsVariablesMap[T];
  /** Optional sender ID or messaging service SID */
  from?: string;
  /** Optional family scope for deterministic proxy number assignment */
  familyId?: string;
}

export type SmsDeliveryStatus =
  | "queued"
  | "accepted"
  | "sent"
  | "delivered"
  | "undelivered"
  | "failed";

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  status?: SmsDeliveryStatus;
  providerStatus?: string;
  error?: string;
  errorCode?: string;
  retryCount?: number;
}

export interface SmsSender {
  readonly providerName: string;
  send(options: SmsSendOptions): Promise<SmsSendResult>;
  /** Verify provider credentials are configured correctly */
  verifyConfiguration(): Promise<boolean>;
}

// ─── Email Template IDs ───────────────────────────────────────────────────────

export const EMAIL_TEMPLATES = {
  PASSWORD_RESET: "password-reset",
  PASSWORD_RESET_CONFIRMATION: "password-reset-confirmation",
  EMAIL_VERIFICATION: "email-verification",
  WELCOME: "welcome",
  PHONE_VERIFIED: "phone-verified",
  SESSION_REVOKED: "session-revoked",
  CUSTODY_TRANSITION_REMINDER: "custody-transition-reminder",
  SCHEDULE_CHANGE_REQUEST: "schedule-change-request",
  SCHEDULE_CHANGE_RESPONSE: "schedule-change-response",
} as const;

export type EmailTemplateId = (typeof EMAIL_TEMPLATES)[keyof typeof EMAIL_TEMPLATES];

// Map each email template id to its expected variables shape.  New templates
// should extend this map so that callers receive compile‑time hints and
// the compiler enforces the presence/absence of required fields.
export interface EmailVariablesMap {
  [EMAIL_TEMPLATES.PASSWORD_RESET]: PasswordResetEmailVariables;
  [EMAIL_TEMPLATES.PASSWORD_RESET_CONFIRMATION]: {
    email: string;
    userName?: string;
  };
  [EMAIL_TEMPLATES.EMAIL_VERIFICATION]: {
    email: string;
    verifyLink: string;
    userName?: string;
    expiryHours: string;
  };
  [EMAIL_TEMPLATES.WELCOME]: {
    email: string;
    userName?: string;
  };
  [EMAIL_TEMPLATES.PHONE_VERIFIED]: {
    phone: string;
  };
  [EMAIL_TEMPLATES.SESSION_REVOKED]: {
    email: string;
    userName?: string;
  };
  [EMAIL_TEMPLATES.CUSTODY_TRANSITION_REMINDER]: Record<string, string>;
  [EMAIL_TEMPLATES.SCHEDULE_CHANGE_REQUEST]: Record<string, string>;
  [EMAIL_TEMPLATES.SCHEDULE_CHANGE_RESPONSE]: Record<string, string>;
}

// ─── SMS Template IDs ────────────────────────────────────────────────────────

export const SMS_TEMPLATES = {
  OTP_VERIFICATION: "otp-verification",
  PHONE_VERIFICATION_SUCCESS: "phone-verification-success",
  CUSTODY_TRANSITION_ALERT: "custody-transition-alert",
  URGENT_MESSAGE: "urgent-message",
} as const;

export type SmsTemplateId = (typeof SMS_TEMPLATES)[keyof typeof SMS_TEMPLATES];

export interface SmsVariablesMap {
  [SMS_TEMPLATES.OTP_VERIFICATION]: OtpSmsVariables;
  [SMS_TEMPLATES.PHONE_VERIFICATION_SUCCESS]: PhoneVerificationSuccessVariables;
  [SMS_TEMPLATES.CUSTODY_TRANSITION_ALERT]: Record<string, string>;
  [SMS_TEMPLATES.URGENT_MESSAGE]: Record<string, string>;
}

// ─── Template Variable Schemas ───────────────────────────────────────────────

export interface PasswordResetEmailVariables {
  email: string;
  resetLink: string;
  expiryTime: string;
  userName?: string;
}

export interface OtpSmsVariables {
  otp: string;
  expiryMinutes: string;
}

export interface PhoneVerificationSuccessVariables {
  phone: string;
}
