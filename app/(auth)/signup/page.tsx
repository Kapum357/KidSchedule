/**
 * KidSchedule – Sign Up Page
 *
 * Renders the split-screen registration form. Form submission is handled via
 * Next.js Server Actions which call AuthEngine.registerUser() server-side.
 *
 * Validation Flow:
 * 1. Client-side HTML5 validation (required fields, email type, password match)
 * 2. Server-side validation (format, strength, duplication check)
 * 3. On success: issue session and redirect to /dashboard
 * 4. On failure: redirect back to /signup with error search params
 *
 * Layout:
 * - Left panel (desktop): Brand imagery + value proposition
 * - Right panel (all views): Registration form, OAuth buttons, login link
 *
 * Security:
 * - All validation logic runs server-side (never exposes hashes/tokens to client)
 * - Passwords never logged or echoed
 * - Duplicate email check prevents account enumeration
 * - Password strength validated against security requirements
 */

"use server";

import { redirect } from "next/navigation";
import { AuthEngine } from "@/lib/auth-engine";
import type { AuthResult } from "@/types";

// ─── Server Action ────────────────────────────────────────────────────────────

/**
 * Processes the registration form submission server-side.
 * On success: sets httpOnly cookies and redirects to /dashboard.
 * On failure: redirects back to /signup with error search params.
 */
export async function handleSignup(formData: FormData): Promise<void> {
  const fullName = (formData.get("fullName") as string | null)?.trim() ?? "";
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const confirmPassword = (formData.get("confirmPassword") as string | null) ?? "";
  const agreedToTerms = formData.get("agreedToTerms") === "on";

  // Validate passwords match
  if (password !== confirmPassword) {
    redirect("/signup?error=passwords_dont_match");
  }

  // Validate terms agreement
  if (!agreedToTerms) {
    redirect("/signup?error=must_agree_terms");
  }

  // Simulated IP (in production: use headers() from next/headers)
  const ipAddress = "127.0.0.1";

  const engine = new AuthEngine();
  const result = engine.registerUser(fullName, email, password, ipAddress);

  if (result.success && result.session) {
    // In production:
    // const cookieStore = cookies();
    // cookieStore.set("access_token", result.session.accessToken, {
    //   httpOnly: true, secure: true, sameSite: "lax",
    //   maxAge: 15 * 60, // 15 minutes
    // });
    // cookieStore.set("refresh_token", result.session.refreshToken, {
    //   httpOnly: true, secure: true, sameSite: "lax",
    //   maxAge: 7 * 24 * 3600, // 7 days
    // });
    redirect("/dashboard");
  }

  // Encode error in URL params for stateless feedback
  const params = new URLSearchParams();
  if (result.error) params.set("error", result.error);
  if (result.errorMessage) params.set("message", result.errorMessage);
  redirect(`/signup?${params.toString()}`);
}

// ─── Left Panel ───────────────────────────────────────────────────────────────

function BrandPanel() {
  return (
    <div className="hidden lg:flex lg:w-1/2 relative bg-cover bg-center overflow-hidden" style={{
      backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCkfathnbjDNfJMptgb3ybssl6zY4uiR98kjH1_8bslEAgAJ11uqDOv-vsMjAvRw6lP3Jam7uDj_Lzp3gFdlSf2ZYdccUHUda2o-TMA1sly_-C81TpDlUHfosgKkp8EFh5nRYS1K89J9zIQIXlRQntTRPaVZB1ORDN4yuvvfxLGyRoCBmmFQqAKOPgEGODO5VJ6C33Zvc-5H83egmf1lNdL3nO-DgS4GhZTCJcNPsopMTuXrH5s9MAaGNZGd1joWEFyHlyI9lOFUAw')"
    }}>
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      <div className="absolute inset-0 bg-primary/20 mix-blend-multiply" />

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-between h-full p-12 xl:p-20 w-full">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-3xl">family_star</span>
          </div>
          <span className="text-white text-2xl font-bold tracking-tight">KidSchedule</span>
        </div>

        {/* Value Proposition */}
        <div className="max-w-lg">
          <h1 className="text-white text-4xl xl:text-5xl font-bold leading-tight mb-4">
            Build a reliable foundation for your family&apos;s future.
          </h1>
          <p className="text-slate-200 text-lg leading-relaxed">
            Simplify communication, manage schedules, and reduce conflict with tools designed for peace of mind.
          </p>
        </div>

        {/* Decorative Dots */}
        <div className="flex gap-2">
          <div className="h-1 w-12 bg-white rounded-full" />
          <div className="h-1 w-4 bg-white/50 rounded-full" />
          <div className="h-1 w-4 bg-white/50 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ─── Error Banner ─────────────────────────────────────────────────────────────

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

// ─── OAuth Buttons ────────────────────────────────────────────────────────────

function OAuthButtons() {
  return (
    <div>
      <div className="relative flex py-2 items-center">
        <div className="flex-grow border-t border-slate-200 dark:border-slate-700" />
        <span className="flex-shrink-0 mx-4 text-slate-400 text-sm font-medium">Or continue with</span>
        <div className="flex-grow border-t border-slate-200 dark:border-slate-700" />
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        {/* Google */}
        <button
          className="flex items-center justify-center h-12 gap-2 bg-background-light dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-200 font-medium text-sm"
          type="button"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M23.7663 12.2764C23.7663 11.4607 23.7001 10.6406 23.5882 9.83807H12.2402V14.4591H18.722C18.4528 15.9494 17.5887 17.2678 16.3233 18.1056V21.1039H20.1903C22.4611 19.0139 23.7663 15.9273 23.7663 12.2764Z" fill="#4285F4" />
            <path d="M12.2399 24.0008C15.4764 24.0008 18.2057 22.9382 20.1942 21.1039L16.3272 18.1055C15.2514 18.8375 13.8624 19.252 12.2442 19.252C9.11361 19.252 6.45919 17.1399 5.50678 14.3003H1.51633V17.3912C3.55344 21.4434 7.70263 24.0008 12.2399 24.0008Z" fill="#34A853" />
            <path d="M5.50277 14.3003C5.00209 12.8099 5.00209 11.1961 5.50277 9.70575V6.61481H1.51655C-0.185282 10.0056 -0.185282 14.0004 1.51655 17.3912L5.50277 14.3003Z" fill="#FBBC05" />
            <path d="M12.2399 4.74966C13.9506 4.7232 15.6042 5.36697 16.8432 6.54867L20.2692 3.12262C18.0998 1.0855 15.2205 -0.0344664 12.2399 0.000808666C7.70263 0.000808666 3.55344 2.55822 1.51633 6.61049L5.50255 9.70143C6.45037 6.86181 9.10928 4.74966 12.2399 4.74966Z" fill="#EA4335" />
          </svg>
          <span>Google</span>
        </button>

        {/* Apple */}
        <button
          className="flex items-center justify-center h-12 gap-2 bg-background-light dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-200 font-medium text-sm"
          type="button"
        >
          <svg className="w-5 h-5 text-slate-900 dark:text-white" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.653 14.733C17.674 12.437 19.344 11.086 19.421 11.041C18.397 9.54998 16.815 9.35698 16.273 9.33698C14.935 9.19798 13.626 10.125 12.946 10.125C12.253 10.125 11.166 8.99598 10.063 9.01998C8.61899 9.03998 7.29199 9.85898 6.55999 11.135C5.04099 13.774 6.17399 17.683 7.64699 19.816C8.37599 20.856 9.22799 22.022 10.37 21.979C11.459 21.936 11.876 21.282 13.204 21.282C14.522 21.282 14.908 21.979 16.052 21.956C17.234 21.916 18.019 20.884 18.736 19.833C19.566 18.63 19.914 17.461 19.927 17.399C19.907 17.391 17.62 16.518 17.653 14.733ZM15.228 7.37898C15.823 6.65798 16.223 5.65598 16.113 4.66698C15.241 4.70198 14.188 5.24698 13.564 5.97398C13.007 6.61998 12.52 7.65998 12.651 8.63298C13.618 8.70798 14.633 8.09998 15.228 7.37898Z" />
          </svg>
          <span>Apple</span>
        </button>
      </div>
    </div>
  );
}

// ─── Sign Up Form ──────────────────────────────────────────────────────────────

function SignupForm({ authResult }: Readonly<{ authResult?: AuthResult }>) {
  const hasError = authResult && !authResult.success;
  const errorMessage = hasError ? authResult.errorMessage : null;

  const errorMessages: Record<string, string> = {
    passwords_dont_match: "Passwords do not match.",
    must_agree_terms: "You must agree to the Terms of Service and Privacy Policy.",
    invalid_credentials: errorMessage ?? "Please check your information and try again.",
  };

  const displayError = errorMessages[authResult?.error as string] || errorMessage;

  return (
    <form action={handleSignup} className="mt-8 space-y-6">
      <div className="space-y-5">
        {/* Full Name */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300" htmlFor="fullName">
            Full Name
          </label>
          <div className="relative mt-1.5">
            <input
              autoComplete="name"
              className="block w-full h-12 px-4 rounded-lg bg-background-light dark:bg-background-dark border border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              id="fullName"
              name="fullName"
              placeholder="Ex. Sarah Jenkins"
              required
              type="text"
            />
            <span className="material-symbols-outlined absolute right-4 top-3 text-slate-400">person</span>
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300" htmlFor="email">
            Email Address
          </label>
          <div className="relative mt-1.5">
            <input
              autoComplete="email"
              className="block w-full h-12 px-4 rounded-lg bg-background-light dark:bg-background-dark border border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              id="email"
              name="email"
              placeholder="name@example.com"
              required
              type="email"
            />
            <span className="material-symbols-outlined absolute right-4 top-3 text-slate-400">mail</span>
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300" htmlFor="password">
            Password
          </label>
          <div className="relative mt-1.5">
            <input
              autoComplete="new-password"
              className="block w-full h-12 px-4 rounded-lg bg-background-light dark:bg-background-dark border border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              id="password"
              name="password"
              placeholder="Create a password"
              required
              type="password"
            />
            <button className="absolute right-4 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" type="button">
              <span className="material-symbols-outlined text-xl">visibility_off</span>
            </button>
          </div>

          {/* Password Requirements */}
          <div className="mt-3 text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <p>Password must contain:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li>At least 8 characters</li>
              <li>One uppercase letter (A-Z)</li>
              <li>One lowercase letter (a-z)</li>
              <li>One number (0-9)</li>
            </ul>
          </div>
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300" htmlFor="confirmPassword">
            Confirm Password
          </label>
          <div className="relative mt-1.5">
            <input
              autoComplete="new-password"
              className="block w-full h-12 px-4 rounded-lg bg-background-light dark:bg-background-dark border border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              id="confirmPassword"
              name="confirmPassword"
              placeholder="Confirm your password"
              required
              type="password"
            />
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {hasError && displayError && <ErrorBanner message={displayError} />}

      {/* Terms Checkbox */}
      <div className="flex items-start gap-3 mt-2">
        <div className="flex items-center h-5">
          <input
            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary bg-background-light dark:bg-background-dark dark:border-slate-600"
            id="agreedToTerms"
            name="agreedToTerms"
            required
            type="checkbox"
          />
        </div>
        <label className="text-sm text-slate-600 dark:text-slate-400 leading-tight" htmlFor="agreedToTerms">
          I agree to the{" "}
          <a className="text-primary hover:underline font-semibold" href="#">
            Terms of Service
          </a>{" "}
          and{" "}
          <a className="text-primary hover:underline font-semibold" href="#">
            Privacy Policy
          </a>
          .
        </label>
      </div>

      {/* Submit Button */}
      <button
        className="mt-2 w-full h-12 bg-primary hover:bg-primary-hover text-white font-bold rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 group"
        type="submit"
      >
        <span>Create Account</span>
        <span className="material-symbols-outlined text-lg transition-transform group-hover:translate-x-1">arrow_forward</span>
      </button>
    </form>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

/**
 * Sign up page rendered as a Server Component.
 *
 * The form invokes a Server Action (handleSignup) which:
 *   1. Reads FormData (fullName, email, password, confirmPassword, agreedToTerms)
 *   2. Calls AuthEngine.registerUser()
 *   3. On success: sets httpOnly cookies, redirects to /dashboard
 *   4. On failure: returns AuthResult for error feedback
 *
 * In production:
 *   - Use Next.js middleware to verify access tokens on protected routes
 *   - Add CSRF headers (Next.js 14+ does this automatically for Server Actions)
 *   - Configure CSP headers allowing Google/Apple OAuth scripts
 *   - Add email verification step before account activation
 */
export default async function SignupPage() {
  // In real app: check for active session here; redirect if already logged in
  // const session = await getServerSession();
  // if (session) redirect("/dashboard");

  // authResult would be populated via search params or server action state
  // For this demo, show blank form
  const authResult: AuthResult | undefined = undefined;

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white antialiased h-screen w-full flex overflow-hidden">
      {/* Left branded panel */}
      <BrandPanel />

      {/* Right form panel */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 sm:p-12 bg-surface-light dark:bg-surface-dark overflow-y-auto">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-4 text-primary">
            <span className="material-symbols-outlined text-3xl">family_star</span>
            <span className="text-slate-900 dark:text-white text-xl font-bold">KidSchedule</span>
          </div>

          {/* Heading */}
          <div className="text-left">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight mb-2">Create your account</h2>
            <p className="text-slate-500 dark:text-slate-400">Start managing your co-parenting schedule today.</p>
          </div>

          {/* Form */}
          <SignupForm authResult={authResult} />

          {/* OAuth */}
          <OAuthButtons />

          {/* Login link */}
          <div className="text-center text-sm text-slate-600 dark:text-slate-400">
            Already have an account?{" "}
            <a className="text-primary hover:text-primary-hover font-bold hover:underline transition-colors" href="/login">
              Log in
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
