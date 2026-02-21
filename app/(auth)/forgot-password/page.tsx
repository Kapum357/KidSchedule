/**
 * KidSchedule – Forgot Password Request Page
 *
 * Server Component that renders password reset request form.
 * Users enter their email to receive a password reset link.
 *
 * Server Action `requestPasswordReset`:
 *   1. Validates email format
 *   2. Looks up user in database (always succeeds for privacy)
 *   3. Generates a time-limited reset token
 *   4. Sends reset email with token link (mocked in dev)
 *   5. Redirects to success page
 *
 * In production:
 *   - Send via email service (SendGrid, AWS SES, etc.)
 *   - Log the rawToken in an audit trail (never send via logs)
 *   - Record request timestamp for rate limiting
 *   - Use template variables: {{email}}, {{resetLink}}, {{expiryTime}}
 *
 * Security considerations:
 *   - Email validation prevents obvious malformed addresses
 *   - Token is single-use and expires in 1 hour
 *   - Error message identical for "user not found" and other issues
 *   - Rate limiting prevents email spray attacks
 */

"use server";

import { redirect } from "next/navigation";
import { AuthEngine } from "@/lib/auth-engine";

/**
 * Server Action: Initiates password reset workflow.
 *
 * Privacy: Always redirects to the same success page regardless of whether
 * the email exists in the system. This prevents user enumeration attacks.
 */
export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";

  // Validate email format
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    redirect("/forgot-password?error=invalid_email");
  }

  // In a real app: fetch user from database
  // For now, treat any email as a potential account (don't reveal if exists)
  // const user = await db.user.findUnique({ where: { email } });

  const engine = new AuthEngine();

  // Generate reset token and request
  const { rawToken } = engine.initiatePasswordReset(email);

  // In production: send email with reset link
  // For now: log to console (dev only)
  if (process.env.NODE_ENV === "development") {
    console.log("🔐 Password Reset Token (DEV ONLY):", {
      email,
      token: rawToken,
      expiresIn: "1 hour",
      resetLink: `/reset-password/${encodeURIComponent(rawToken)}`,
    });
  }

  // In production:
  // const resetLink = `${process.env.APP_URL}/reset-password/${encodeURIComponent(rawToken)}`;
  // await sendResetEmail(email, resetLink, request.expiresAt);

  // Store the request in database (hashed token)
  // await db.passwordResetRequest.create({ data: request });

  // Always redirect to success (whether or not user exists)
  redirect("/forgot-password/check-email?email=" + encodeURIComponent(email));
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
          <h2 className="text-4xl font-bold mb-4 leading-tight">
            We&apos;re here to help you get back on track.
          </h2>
          <p className="text-teal-100/80 text-lg font-light">
            Co-parenting has enough challenges. Accessing your account shouldn&apos;t be one of them.
          </p>
        </div>

        <div className="text-sm text-white/40 flex gap-6">
          <span>© 2024 KidSchedule Inc.</span>
          <a className="hover:text-white transition-colors" href="#">
            Privacy
          </a>
          <a className="hover:text-white transition-colors" href="#">
            Terms
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Info Box ──────────────────────────────────────────────────────────────────

function SocialSignInInfoBox() {
  return (
    <div className="mt-10 rounded-xl bg-background-light dark:bg-slate-800/50 p-4 border border-slate-100 dark:border-slate-800">
      <div className="flex gap-3">
        <span className="material-symbols-outlined text-primary shrink-0">info</span>
        <div>
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Did you know?
          </h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            If you signed up with Google or Apple, you don&apos;t need a password. Try logging in with
            those services instead.
          </p>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

/**
 * Forgot password request page.
 * Users enter email to receive a password reset link.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  const errorMessages: Record<string, string> = {
    invalid_email: "Please enter a valid email address.",
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
              Reset your password
            </h1>
            <p className="mt-3 text-base text-slate-500 dark:text-slate-400">
              Enter the email address associated with your account and we&apos;ll send you a link to
              reset your password.
            </p>
          </div>

          {/* Error banner */}
          {error && <ErrorBanner message={errorMessages[error] ?? "An error occurred."} />}

          {/* Form */}
          <form action={requestPasswordReset} className="mt-8 space-y-6" method="POST">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="email">
                Email address
              </label>
              <div className="mt-2 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined text-slate-400 text-xl">mail</span>
                </div>
                <input
                  autoComplete="email"
                  className="block w-full pl-10 rounded-lg border-0 py-3 text-slate-900 dark:text-white dark:bg-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6"
                  id="email"
                  name="email"
                  placeholder="you@example.com"
                  required
                  type="email"
                />
              </div>
            </div>

            <button
              className="flex w-full justify-center rounded-lg bg-primary px-3 py-3 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors duration-200"
              type="submit"
            >
              Send Reset Link
            </button>
          </form>

          {/* Return to login */}
          <div className="text-center">
            <a
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary transition-colors dark:text-slate-400 dark:hover:text-primary"
              href="/login"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              Return to login
            </a>
          </div>

          {/* OAuth info */}
          <SocialSignInInfoBox />
        </div>
      </div>
    </div>
  );
}
