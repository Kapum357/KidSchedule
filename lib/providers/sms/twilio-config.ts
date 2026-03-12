/**
 * KidSchedule – Twilio Configuration (Centralized Token Management)
 *
 * Centralized token management for Twilio integration.
 * All Twilio credentials are validated here on first access.
 *
 * Required environment variables:
 *   TWILIO_ACCOUNT_SID - Twilio account SID
 *   TWILIO_AUTH_TOKEN - Twilio auth token
 *   TWILIO_PHONE_NUMBER - Default Twilio phone number (optional)
 *
 * @module lib/providers/sms/twilio-config
 */

/**
 * Get Twilio auth token from environment.
 * Throws error if missing or empty.
 *
 * @returns The Twilio auth token
 * @throws Error if TWILIO_AUTH_TOKEN is not configured
 */
export function getTwilioAuthToken(): string {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken || authToken.trim() === "") {
    throw new Error("TWILIO_AUTH_TOKEN is not configured");
  }

  return authToken;
}

/**
 * Get Twilio account SID from environment.
 * Throws error if missing or empty.
 *
 * @returns The Twilio account SID
 * @throws Error if TWILIO_ACCOUNT_SID is not configured
 */
export function getTwilioAccountSid(): string {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;

  if (!accountSid || accountSid.trim() === "") {
    throw new Error("TWILIO_ACCOUNT_SID is not configured");
  }

  return accountSid;
}

/**
 * Get Twilio phone number from environment.
 * Returns null if not configured (optional).
 *
 * @returns The Twilio phone number or null if not configured
 */
export function getTwilioPhoneNumber(): string | null {
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  return phoneNumber && phoneNumber.trim() !== "" ? phoneNumber : null;
}
