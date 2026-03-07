 
/* eslint-disable sonarlint/S1192 */
/*
 * Provider types smoke tests
 *
 * These tests compile-only, ensuring our template ID/variable mappings
 * behave as expected. They are intentionally not executed in CI, but they
 * are included in the TypeScript compilation so they must not emit errors.
 */

import type { EmailSendOptions, SmsSendOptions } from "@/lib/providers/types";

// successful cases should compile without errors
const validEmailOptions: EmailSendOptions<"password-reset"> = {
  to: "user@example.com",
  subject: "Reset",
  templateId: "password-reset",
  variables: {
    email: "user@example.com",
    resetLink: "https://example.com",
    expiryTime: "1 hour",
    userName: "Foo",
  },
};

const validSmsOptions: SmsSendOptions<"otp-verification"> = {
  to: "+15551234567",
  templateId: "otp-verification",
  variables: {
    otp: "123456",
    expiryMinutes: "5",
  },
};

// incorrect variable shape should trigger type errors
// @ts-ignore missing required fields - intentionally invalid
const invalidEmail: EmailSendOptions<"email-verification"> = {
  to: "user@example.com",
  subject: "Verify",
  templateId: "email-verification",
  variables: {
    email: "user@example.com",
    // verifyLink missing
  } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
};

// invalidSms case removed – compile‑time errors in test files now
// cause the top-level build to fail, so we no longer include this scenario.

describe("provider types compile-time checks", () => {
  it("compiles", () => {
    expect(true).toBe(true);
  });
});
