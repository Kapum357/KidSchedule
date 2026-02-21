/**
 * KidSchedule – Password Reset Confirmation Page
 *
 * Users arrive here via link in email containing the reset token.
 * They enter and confirm their new password.
 *
 * Server-side token validation:
 *   1. Extract token from URL
 *   2. Fetch reset request from DB using token hash
 *   3. Validate: not expired, not already used
 *   4. If valid: show password form
 *   5. On submit: hash password, update DB, mark token as used
 *
 * In production:
 *   - Log all password reset attempts for audit/security
 *   - Mark token usedAt = now() to prevent re-use
 *   - Consider sending confirmation email after successful reset
 *   - Revoke all active sessions for this user after reset
 */

"use server";

import { redirect } from "next/navigation";
import { validatePasswordStrength, AuthEngine } from "@/lib/auth-engine";
import type { PasswordResetRequest } from "@/types";

/**
 * Mock function to fetch password reset request from database.
 * In production: replace with actual DB query
 * 
 * Example:
 * const engine = new AuthEngine();
 * const hashedToken = await engine.hashPassword(rawToken); // or bcrypt.hash()
 * const resetRequest = await db.passwordResetRequest.findUnique({
 *   where: { token: hashedToken }
 * });
 */
async function fetchPasswordResetRequest(
  rawToken: string
): Promise<PasswordResetRequest | null> {
  // Mock implementation: simulate a valid reset request
  // In a real app, this would query the database
  
  // For demo purposes, accept any token that looks like a valid format
  if (!rawToken || rawToken.length < 10) {
    return null;
  }
  
  // Create a mock hash for the token (simulates what would be stored in DB)
  const engine = new AuthEngine();
  const hashedToken = engine.hashPassword(rawToken);
  
  // Simulate a valid unexpired token
  const now = new Date();
  const mockRequest: PasswordResetRequest = {
    id: "pr-mock-123",
    email: "user@example.com",
    token: hashedToken,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour from now
    createdAt: new Date(now.getTime() - 5 * 60 * 1000), // 5 minutes ago
    usedAt: undefined,
    ipAddress: "127.0.0.1",
  };
  
  return mockRequest;
}

/**
 * Server Action: Performs the actual password reset.
 *
 * Workflow:
 *   1. Validate new password meets requirements
 *   2. Verify token is still valid (not expired or used)
 *   3. Hash new password
 *   4. Update user record
 *   5. Mark reset token as used
 *   6. Clear all active sessions
 *   7. Redirect to success page
 */
async function performPasswordReset(formData: FormData): Promise<void> {
  const token = (formData.get("token") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const confirmPassword = (formData.get("confirm-password") as string | null) ?? "";

  // Validate passwords match
  if (password !== confirmPassword) {
    redirect(`/reset-password/${encodeURIComponent(token)}?error=passwords_dont_match`);
  }

  const validatePasswordCheck = validatePasswordStrength(password);
  if (!validatePasswordCheck.isValid) {
    const firstError = validatePasswordCheck.errors[0] ?? "Password does not meet requirements";
    redirect(`/reset-password/${encodeURIComponent(token)}?error=${encodeURIComponent(firstError)}`);
  }

  // In production: fetch the reset request from DB
  // const resetRequest = await db.passwordResetRequest.findUnique({
  //   where: { token: engine.mockHash(token) }
  // });

  // Validate token (mocked for demo)
  // const validation = engine.validatePasswordResetToken(token, resetRequest);
  // if (!validation.valid) {
  //   redirect(`/reset-password/${encodeURIComponent(token)}?error=${encodeURIComponent(validation.reason ?? "Invalid token")}`);
  // }

  // Hash new password
  // const hashedPassword = engine.hashPassword(password);

  // In production:
  // 1. Update user.passwordHash
  // await db.user.update({
  //   where: { email: resetRequest.email },
  //   data: { passwordHash: hashedPassword }
  // });

  // 2. Mark token as used
  // await db.passwordResetRequest.update({
  //   where: { id: resetRequest.id },
  //   data: { usedAt: new Date() }
  // });

  // 3. Revoke all sessions
  // await db.session.deleteMany({
  //   where: { userId: user.id }
  // });

  // 4. Log the reset for audit
  // await auditLog.create({
  //   action: "password_reset",
  //   userId: user.id,
  //   ipAddress: headers().get("x-forwarded-for"),
  //   timestamp: new Date()
  // });

  // Success
  redirect("/reset-password/success");
}

// ─── Left Panel ───────────────────────────────────────────────────────────────

function BrandPanel() {
  return (
    <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-60 mix-blend-overlay"
        style={{
          backgroundImage:
            "url('https://lh3.googleusercontent.com/aida-public/AB6AXuB3ZZUvm_udMqWsOMnM6zsvvgyd7QeNOptbu96Fsckw9EQokqiCh_U24zsYbX0Gtn35df-m85QP2kee_Sqz6o5ZRCCvEaJksIYcyCkPgsjReyZuZ0cG921yH0FGE1jY57HDjZR-EFNOKB4CQGvASUEDYU-5Y5qv34GNhXAY_uNUG4euMHh5KpV_ii5PGsgrzpCFCkuyljDkgG-yAX2GlCjfG5TN4aVJawfH_6WNc7PU5GF4bCEEF5H3k3ZF-1WV7vXtYfqxedx0z68')",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-teal-900/90 to-slate-900/40" />

      <div className="relative z-10 flex flex-col justify-between w-full h-full p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 backdrop-blur-sm flex items-center justify-center rounded-lg size-10">
            <span className="material-symbols-outlined text-2xl">family_restroom</span>
          </div>
          <span className="text-xl font-bold tracking-tight">KidSchedule</span>
        </div>

        <div className="max-w-md mb-12">
          <h2 className="text-4xl font-bold mb-4 leading-tight">Secure your account.</h2>
          <p className="text-teal-100/80 text-lg font-light">
            A strong password keeps your family&apos;s information safe and private.
          </p>
        </div>

        <div className="text-sm text-white/40 flex gap-6">
          <span>© 2024 KidSchedule Inc.</span>
          <a className="hover:text-white transition-colors" href="/privacy">
            Privacy
          </a>
          <a className="hover:text-white transition-colors" href="/terms">
            Terms
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Error Banner ──────────────────────────────────────────────────────────────

function ErrorBanner({ message }: Readonly<{ message: string }>) {
  return (
    <div
      className="rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 px-4 py-3 flex items-start gap-3"
      role="alert"
    >
      <span className="material-symbols-outlined text-red-500 dark:text-red-400 text-xl mt-0.5 shrink-0">
        error
      </span>
      <div>
        <p className="text-sm font-medium text-red-800 dark:text-red-300">{message}</p>
      </div>
    </div>
  );
}

// ─── Token Invalid Page ────────────────────────────────────────────────────────

/**
 * Displayed when the password reset token is invalid, expired, or already used.
 * Provides clear messaging and a path back to request a new reset link.
 */
function TokenInvalidPage({ reason }: Readonly<{ reason: string }>) {
  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white antialiased h-screen w-full flex overflow-hidden">
      <BrandPanel />

      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 sm:p-12 bg-white dark:bg-background-dark overflow-y-auto">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-8 justify-center">
            <div className="bg-primary/10 flex items-center justify-center rounded-lg size-10 text-primary">
              <span className="material-symbols-outlined text-2xl">family_restroom</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              KidSchedule
            </span>
          </div>

          {/* Error state */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center justify-center size-12 rounded-full bg-red-50 dark:bg-red-900/10 text-red-500 dark:text-red-400 mb-6">
              <span className="material-symbols-outlined text-2xl">error</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Invalid reset link
            </h1>
            <p className="mt-3 text-base text-slate-500 dark:text-slate-400">
              {reason}
            </p>
          </div>

          {/* Action buttons */}
          <div className="space-y-4">
            <a
              className="flex w-full justify-center rounded-lg bg-primary px-3 py-3 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors duration-200"
              href="/forgot-password"
            >
              Request a new reset link
            </a>
            <a
              className="flex w-full justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-3 text-sm font-semibold leading-6 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors duration-200"
              href="/login"
            >
              Return to login
            </a>
          </div>

          {/* Help text */}
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
            <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-2">
              Why did this happen?
            </h3>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>• Reset links expire after 1 hour for security</li>
              <li>• Each link can only be used once</li>
              <li>• The link may have been copied incorrectly</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Password Reset Form Page ──────────────────────────────────────────────────

/**
 * Password reset form page.
 * Displays form to enter new password.
 * Token is embedded in form as hidden field for validation on submit.
 *
 * In production: validate token server-side before rendering the form to catch
 * expired/invalid tokens before the user does the work of typing a password.
 */
export default async function ResetPasswordPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { token } = await params;
  const queryParams = await searchParams;
  const error = typeof queryParams.error === "string" ? queryParams.error : undefined;

  // Validate token before rendering the form
  const engine = new AuthEngine();
  const resetRequest = await fetchPasswordResetRequest(token);
  const validation = engine.validatePasswordResetToken(token, resetRequest);
  
  if (!validation.valid) {
    const errorMessage = validation.reason ?? "This reset link is no longer valid.";
    return <TokenInvalidPage reason={errorMessage} />;
  }

  const errorMessages: Record<string, string> = {
    passwords_dont_match: "Passwords do not match. Please try again.",
    invalid_email: "Please enter a valid email address.",
    token_expired: "This reset link has expired. Please request a new one.",
    token_invalid: "This reset link is invalid. Please request a new one.",
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white antialiased h-screen w-full flex overflow-hidden">
      {/* Desktop left panel */}
      <BrandPanel />

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 sm:p-12 bg-white dark:bg-background-dark overflow-y-auto">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-8 justify-center">
            <div className="bg-primary/10 flex items-center justify-center rounded-lg size-10 text-primary">
              <span className="material-symbols-outlined text-2xl">family_restroom</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              KidSchedule
            </span>
          </div>

          {/* Heading */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center justify-center size-12 rounded-full bg-primary/10 text-primary mb-6">
              <span className="material-symbols-outlined text-2xl">lock_reset</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Create a new password
            </h1>
            <p className="mt-3 text-base text-slate-500 dark:text-slate-400">
              Make it strong and unique. You won&apos;t be able to use a password you&apos;ve used before.
            </p>
          </div>

          {/* Error banner */}
          {error && <ErrorBanner message={errorMessages[error] ?? "An error occurred."} />}

          {/* Form */}
          <form action={performPasswordReset} className="mt-8 space-y-6" method="POST">
            {/* Hidden token field */}
            <input name="token" type="hidden" value={token} />

            {/* Password field */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="password">
                  New password
                </label>
              </div>
              <div className="mt-2 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-slate-400 text-xl">lock</span>
                </div>
                <input
                  autoComplete="new-password"
                  className="block w-full pl-10 rounded-lg border-0 py-3 text-slate-900 dark:text-white dark:bg-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6"
                  id="password"
                  name="password"
                  placeholder="••••••••"
                  required
                  type="password"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                At least 8 characters, with uppercase, lowercase, and numbers.
              </p>
            </div>

            {/* Confirm password field */}
            <div>
              <label
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                htmlFor="confirm-password"
              >
                Confirm password
              </label>
              <div className="mt-2 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-slate-400 text-xl">lock</span>
                </div>
                <input
                  autoComplete="new-password"
                  className="block w-full pl-10 rounded-lg border-0 py-3 text-slate-900 dark:text-white dark:bg-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6"
                  id="confirm-password"
                  name="confirm-password"
                  placeholder="••••••••"
                  required
                  type="password"
                />
              </div>
            </div>

            {/* Submit button */}
            <button
              className="flex w-full justify-center rounded-lg bg-primary px-3 py-3 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors duration-200"
              type="submit"
            >
              Reset password
            </button>
          </form>

          {/* Return to login */}
          <div className="text-center">
            <a
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary transition-colors dark:text-slate-400 dark:hover:text-primary"
              href="/login"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>{" "}
              Return to login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
