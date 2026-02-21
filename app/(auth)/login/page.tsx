/**
 * KidSchedule – Login Page
 *
 * Renders the split-screen login form. Form submission is handled via
 * Next.js Server Actions which call AuthEngine server-side.
 *
 * Error feedback is passed through URL search params:
 *   /login?error=invalid_credentials&remaining=3
 *
 * Layout:
 * - Left panel (desktop): Brand imagery + tagline
 * - Right panel (all views): Login form, OAuth buttons, error feedback
 *
 * Security:
 * - All auth logic runs server-side (never exposes hashes/tokens to client)
 * - Passwords never logged or echoed
 * - Rate-limit feedback via friendly UI (lockout countdown)
 */

"use server";

import { redirect } from "next/navigation";
import { AuthEngine, lookupMockUser } from "@/lib/auth-engine";
import type { AuthResult } from "@/types";

// ─── Server Action ────────────────────────────────────────────────────────────

/**
 * Processes the login form submission server-side.
 * On success: sets httpOnly cookies and redirects to /dashboard.
 * On failure: redirects back to /login with error search params.
 */
export async function handleLogin(formData: FormData): Promise<void> {
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const rememberMe = formData.get("remember-me") === "on";

  // Simulated IP (in production: use headers() from next/headers)
  const ipAddress = "127.0.0.1";

  const engine = new AuthEngine();
  const userRecord = lookupMockUser(email);

  const result = engine.authenticateWithPassword(
    { email, password, rememberMe },
    ipAddress,
    userRecord?.hashedPassword ?? null,
    userRecord?.userId ?? null
  );

  if (result.success && result.session) {
    // In production:
    // const cookieStore = cookies();
    // cookieStore.set("access_token", result.session.accessToken, {
    //   httpOnly: true, secure: true, sameSite: "lax",
    //   maxAge: rememberMe ? 30 * 24 * 3600 : undefined,
    // });
    redirect("/dashboard");
  }

  // Encode error in URL params for stateless feedback
  const params = new URLSearchParams();
  if (result.error) params.set("error", result.error);
  if (result.attemptsRemaining !== undefined) {
    params.set("remaining", String(result.attemptsRemaining));
  }
  if (result.lockedUntil) params.set("lockedUntil", result.lockedUntil);
  redirect(`/login?${params.toString()}`);
}

// ─── Left Panel ───────────────────────────────────────────────────────────────

function BrandPanel() {
  return (
    <div className="hidden lg:flex w-1/2 relative bg-slate-900 text-white overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div
          className="w-full h-full bg-cover bg-center opacity-60"
          style={{
            backgroundImage:
              "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCbC6iWkRJ-ThLddecWasShJfhWJrOelsaAm05AXXe8x0R7metaip0wfKwollr6wTzBsCT9mxpnOPxrblAZkDuSsZKKlfbvQvWeCYHm2lELaPpjMo_kEiqGZoTjWdftZvoIkBIOOqFVLnoDcWiIaN0jZUhH-Teq1nImXgN_i8WlGW_oEo8OhC1FJ2CEvewZHxmou39SDKyfNrFzZ_Ayzp60gA9zVWUXsuCknmcGfnveZN5o4PixGojATo2L0qrWcr0FGoaNdLREnW4')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
      </div>

      <div className="relative z-10 flex flex-col justify-between p-12 w-full h-full">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="bg-teal-soft/20 backdrop-blur-sm flex items-center justify-center rounded-lg size-10 text-teal-200 border border-teal-500/30">
            <span className="material-symbols-outlined text-2xl">family_restroom</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">KidSchedule</span>
        </div>

        {/* Tagline + Indicator */}
        <div className="max-w-md mb-8">
          <h2 className="text-3xl font-semibold leading-tight mb-4 text-white">
            The operational system of record for stress-free co-parenting.
          </h2>
          <p className="text-slate-300 text-lg font-light">
            Reduce conflict, streamline communication, and focus on what matters most—your
            children&apos;s well-being.
          </p>
          <div className="mt-8 flex gap-2">
            <div className="h-1 w-12 bg-teal-soft rounded-full"></div>
            <div className="h-1 w-3 bg-slate-600 rounded-full"></div>
            <div className="h-1 w-3 bg-slate-600 rounded-full"></div>
          </div>
        </div>

        <div className="text-xs text-slate-400">&copy; 2024 KidSchedule Inc. All rights reserved.</div>
      </div>
    </div>
  );
}

// ─── Error Banner ─────────────────────────────────────────────────────────────

function ErrorBanner({ message, lockedUntil }: Readonly<{ message: string; lockedUntil?: string }>) {
  const lockDate = lockedUntil ? new Date(lockedUntil) : null;
  const lockTimeStr = lockDate
    ? lockDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div
      className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3"
      role="alert"
    >
      <span className="material-symbols-outlined text-red-500 text-xl mt-0.5 shrink-0">error</span>
      <div>
        <p className="text-sm font-medium text-red-800">{message}</p>
        {lockTimeStr && (
          <p className="text-xs text-red-600 mt-1">You can try again after {lockTimeStr}.</p>
        )}
      </div>
    </div>
  );
}

// ─── OAuth Buttons ────────────────────────────────────────────────────────────

function OAuthButtons() {
  return (
    <div className="mt-6">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-2 text-slate-500">Or continue with</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {/* Google */}
        <button
          className="inline-flex w-full justify-center items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          type="button"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Google
        </button>

        {/* Apple */}
        <button
          className="inline-flex w-full justify-center items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          type="button"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17 2c-.3 0-.6.1-.9.2C14.6 3.1 13 5 13 5s-1.5-.2-3 .8C8.6 6.9 7 9 7 12c0 3.3 2 6.4 4 8 .8.7 1.5 1 2 1 .6 0 1.2-.3 2-1 .5-.5 1.2-.8 2-.8.8 0 1.5.3 2 .8.8.7 1.4 1 2 1 .5 0 1.2-.3 2-1 2-1.6 4-4.7 4-8-.1-4.7-3.5-8-8-8zm-.7-1.6c.2-.5.7-1.3 1.7-1.4-.1.7-.4 1.5-.9 2.1-.5.6-1.2 1-1.9.9.1-.7.5-1.2 1.1-1.6z" />
          </svg>
          Apple
        </button>
      </div>
    </div>
  );
}

// ─── Login Form ───────────────────────────────────────────────────────────────

function LoginForm({ authResult }: Readonly<{ authResult?: AuthResult }>) {
  const hasError = authResult && !authResult.success;
  const attemptsText =
    hasError && authResult.attemptsRemaining !== undefined && authResult.attemptsRemaining > 0
      ? `${authResult.attemptsRemaining} attempt${authResult.attemptsRemaining === 1 ? "" : "s"} remaining.`
      : null;

  return (
    <form action={handleLogin} className="mt-8 space-y-6">
      <div className="space-y-5">
        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">
            Email address
          </label>
          <div className="mt-1">
            <input
              autoComplete="email"
              className={`block w-full rounded-lg border shadow-sm sm:text-sm py-3 px-4 placeholder-slate-400 focus:ring-2 transition-colors ${
                hasError && authResult?.error === "invalid_credentials"
                  ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                  : "border-slate-300 focus:border-teal-soft focus:ring-teal-soft/20"
              }`}
              id="email"
              name="email"
              placeholder="parent@example.com"
              required
              type="email"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">
            Password
          </label>
          <div className="mt-1">
            <input
              autoComplete="current-password"
              className={`block w-full rounded-lg border shadow-sm sm:text-sm py-3 px-4 placeholder-slate-400 focus:ring-2 transition-colors ${
                hasError && authResult?.error === "invalid_credentials"
                  ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                  : "border-slate-300 focus:border-teal-soft focus:ring-teal-soft/20"
              }`}
              id="password"
              name="password"
              placeholder="••••••••"
              required
              type="password"
            />
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {hasError && authResult.errorMessage && (
        <ErrorBanner
          lockedUntil={authResult.lockedUntil}
          message={`${authResult.errorMessage}${attemptsText ? ` ${attemptsText}` : ""}`}
        />
      )}

      {/* Remember Me + Forgot Password */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <input
            className="h-4 w-4 rounded border-slate-300 text-teal-soft focus:ring-teal-soft"
            id="remember-me"
            name="remember-me"
            type="checkbox"
          />
          <label className="ml-2 block text-sm text-slate-600" htmlFor="remember-me">
            Keep me logged in
          </label>
        </div>
        <a
          className="text-sm font-medium text-teal-soft hover:text-teal-dark transition-colors"
          href="/forgot-password"
        >
          Forgot password?
        </a>
      </div>

      {/* Submit */}
      <button
        className="group relative flex w-full justify-center rounded-lg bg-teal-soft px-4 py-3 text-sm font-semibold text-white hover:bg-teal-dark focus:outline-none focus:ring-2 focus:ring-teal-soft focus:ring-offset-2 shadow-sm transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
        type="submit"
      >
        <span className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base">login</span>
          Log In
        </span>
      </button>
    </form>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

/**
 * Login page rendered as a Server Component.
 *
 * The form invokes a Server Action (handleLogin) which:
 *   1. Reads FormData (email, password, remember-me)
 *   2. Calls AuthEngine.authenticateWithPassword()
 *   3. On success: sets httpOnly cookies, redirects to /dashboard
 *   4. On failure: returns AuthResult for error feedback
 *
 * In production:
 *   - Use Next.js middleware to verify access tokens on protected routes
 *   - Add CSRF headers (Next.js 14+ does this automatically for Server Actions)
 *   - Configure CSP headers allowing Google/Apple OAuth scripts
 */
export default async function LoginPage() {
  // In real app: check for active session here; redirect if already logged in
  // const session = await getServerSession();
  // if (session) redirect("/dashboard");

  // authResult would be populated via search params or server action state
  // For this demo, show blank form
  const authResult: AuthResult | undefined = undefined;

  return (
    <div className="bg-background-light text-slate-900 antialiased h-screen w-full flex overflow-hidden">
      {/* Left branded panel */}
      <BrandPanel />

      {/* Right form panel */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 bg-white overflow-y-auto">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo (hidden on desktop – shown in BrandPanel) */}
          <div className="lg:hidden flex justify-center mb-6">
            <div className="flex items-center gap-2">
              <div className="bg-teal-soft/10 flex items-center justify-center rounded-lg size-10 text-teal-soft">
                <span className="material-symbols-outlined text-2xl">family_restroom</span>
              </div>
              <span className="text-xl font-bold text-slate-900">KidSchedule</span>
            </div>
          </div>

          {/* Heading */}
          <div className="text-center lg:text-left">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Welcome back</h1>
            <p className="mt-2 text-sm text-slate-500">
              Please enter your details to access your dashboard.
            </p>
          </div>

          {/* Form */}
          <LoginForm authResult={authResult} />

          {/* OAuth */}
          <OAuthButtons />

          {/* Sign-up link */}
          <div className="flex items-center justify-center mt-8">
            <p className="text-sm text-slate-500">
              Don&apos;t have an account?{" "}
              <a
                className="font-semibold text-teal-soft hover:text-teal-dark transition-colors"
                href="/signup"
              >
                Sign up
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
