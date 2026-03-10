"use client";

import React, { useState } from "react";
import type { AuthResult } from "@/lib";
import Script from "next/script";

export default function SignupForm({
  authResult,
  recaptchaSiteKey,
  handleSignup,
}: Readonly<{
  authResult?: AuthResult;
  recaptchaSiteKey?: string;
  handleSignup: (formData: FormData) => Promise<void>;
}>) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const hasError = authResult && !authResult.success;
  const errorMessage = hasError ? authResult.errorMessage : null;

  const errorMessages: Record<string, string> = {
    passwords_dont_match: "Passwords do not match.",
    must_agree_terms: "You must agree to the Terms of Service and Privacy Policy.",
    recaptcha_failed: "Security verification failed. Please complete the CAPTCHA and try again.",
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
              aria-invalid={hasError ? "true" : "false"}
              aria-describedby={hasError ? "signup-error" : undefined}
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
              aria-invalid={hasError ? "true" : "false"}
              aria-describedby={hasError ? "signup-error" : undefined}
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
              type={passwordVisible ? "text" : "password"}
              aria-invalid={hasError && (authResult?.error as string) === "passwords_dont_match" ? "true" : "false"}
              aria-describedby={hasError ? "signup-error" : undefined}
            />
            <button
              className="absolute right-4 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              type="button"
              aria-pressed={passwordVisible}
              aria-label={passwordVisible ? "Hide password" : "Show password"}
              onClick={() => setPasswordVisible((v) => !v)}
            >
              <span className="material-symbols-outlined text-xl">
                {passwordVisible ? "visibility" : "visibility_off"}
              </span>
            </button>
          </div>

          {/* Password Strength Indicator */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1 bg-primary rounded-full" />
            <div className="flex-1 h-1 bg-primary rounded-full" />
            <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
            <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
            <span className="text-xs font-medium text-slate-500 ml-2">Medium</span>
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
              type={confirmVisible ? "text" : "password"}
              aria-invalid={hasError && (authResult?.error as string) === "passwords_dont_match" ? "true" : "false"}
              aria-describedby={hasError ? "signup-error" : undefined}
            />
            <button
              className="absolute right-4 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              type="button"
              aria-pressed={confirmVisible}
              aria-label={confirmVisible ? "Hide confirm password" : "Show confirm password"}
              onClick={() => setConfirmVisible((v) => !v)}
            >
              <span className="material-symbols-outlined text-xl">
                {confirmVisible ? "visibility" : "visibility_off"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {hasError && displayError && <div id="signup-error" className="mt-2"><div className="rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 px-4 py-3 flex items-start gap-3" role="alert"><span className="material-symbols-outlined text-red-500 dark:text-red-400 text-xl mt-0.5 shrink-0">error</span><div><p className="text-sm font-medium text-red-800 dark:text-red-300">{displayError}</p></div></div></div>}

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
          <a className="text-primary hover:underline font-semibold" href="/terms">Terms of Service</a>{" "}
          and{" "}
          <a className="text-primary hover:underline font-semibold" href="/privacy">Privacy Policy</a>.
        </label>
      </div>

      {/* CAPTCHA */}
      {recaptchaSiteKey && (
        <div className="flex justify-center">
          <div className="g-recaptcha" data-sitekey={recaptchaSiteKey} />
        </div>
      )}

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
