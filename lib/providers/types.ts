/**
 * KidSchedule – Provider Interface Types
 *
 * Common types shared across all communication providers (email, SMS).
 * Providers are pluggable adapters that implement a standard interface.
 */

// ─── Email Provider Types ─────────────────────────────────────────────────────

export interface EmailSendOptions {
  to: string;
  subject: string;
  templateId: string;
  variables: Record<string, string>;
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

export interface SmsSendOptions {
  to: string;
  templateId: string;
  variables: Record<string, string>;
  /** Optional sender ID or messaging service SID */
  from?: string;
}

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
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

// ─── SMS Template IDs ────────────────────────────────────────────────────────

export const SMS_TEMPLATES = {
  OTP_VERIFICATION: "otp-verification",
  PHONE_VERIFICATION_SUCCESS: "phone-verification-success",
  CUSTODY_TRANSITION_ALERT: "custody-transition-alert",
  URGENT_MESSAGE: "urgent-message",
} as const;

export type SmsTemplateId = (typeof SMS_TEMPLATES)[keyof typeof SMS_TEMPLATES];

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
