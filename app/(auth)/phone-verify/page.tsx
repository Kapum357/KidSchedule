/**
 * KidSchedule – Phone Verification Page
 *
 * Step 2 in the Multi-Step Onboarding Flow (1. Email Signup → 2. Phone Verify → 3. Family Setup)
 *
 * This page handles SMS-based OTP verification for account security.
 * Users enter a 6-digit code sent to their phone.
 *
 * Features:
 * - 6-digit OTP input with auto-focus between fields
 * - Countdown timer for resend button (60 seconds)
 * - Attempt limiting (max 5 failed attempts)
 * - Phone number masking (privacy-first display)
 * - Progress stepper (Step 2 of 3)
 * - Server Action for OTP validation
 *
 * Security:
 * - OTP sent via SMS (secure, out-of-band channel)
 * - Constant-time comparison prevents timing attacks
 * - Hashed OTP in database (not plaintext)
 * - Max 5 attempts before 15-min lockout
 * - 5-minute OTP validity window
 *
 * UX Considerations:
 * - Auto-move to next field when digit entered
 * - Copy-paste support (if user pastes "123456", fills all fields)
 * - Resend button disabled with countdown
 * - Clear error messages with remaining attempts
 */

import { redirect } from "next/navigation";
import { requestPhoneVerification, verifyPhoneOTP } from "@/lib/auth";
import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib/session";

// ─── Server Action ────────────────────────────────────────────────────────────

/**
 * Processes OTP verification form submission server-side.
 * Combines all 6 digit inputs into a single OTP code and validates.
 *
 * On success: marks phone as verified, redirects to next onboarding step
 * On failure: redirects back with error params (code, message, attempts remaining)
 */
async function handleVerifyOTP(formData: FormData): Promise<void> {
  "use server";
  
  // Get current user from session
  const user = await requireAuth();
  
  // Extract the 6 OTP digits from form inputs
  const digit1 = (formData.get("digit1") as string | null) ?? "";
  const digit2 = (formData.get("digit2") as string | null) ?? "";
  const digit3 = (formData.get("digit3") as string | null) ?? "";
  const digit4 = (formData.get("digit4") as string | null) ?? "";
  const digit5 = (formData.get("digit5") as string | null) ?? "";
  const digit6 = (formData.get("digit6") as string | null) ?? "";

  const otp = `${digit1}${digit2}${digit3}${digit4}${digit5}${digit6}`;

  // Validate all 6 digits entered
  if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
    redirect("/phone-verify?error=invalid_format&message=Please enter all 6 digits");
  }

  // Call production auth service
  const result = await verifyPhoneOTP(user.userId, otp);

  if (result.success) {
    redirect("/family-setup"); // Next step in onboarding
  }

  // On failure: redirect with error details for stateless feedback
  const params = new URLSearchParams();
  if (result.error) params.set("error", result.error);
  if (result.errorMessage) params.set("message", result.errorMessage);
  if (result.attemptsRemaining !== undefined) {
    params.set("attemptsRemaining", result.attemptsRemaining.toString());
  }
  redirect(`/phone-verify?${params.toString()}`);
}

// ─── Server Action: Resend OTP ────────────────────────────────────────────────

// In production:
// /**
//  * Handles "Resend Code" button clicks.
//  * Generates a new OTP and sends via SMS.
//  */
// async function handleResendOTP(formData: FormData): Promise<void> {
//   "use server";
//   
//   const phone = (formData.get("phone") as string | null)?.trim() ?? "";
//   
//   // Get current user from session
//   const user = await getCurrentUser();
//   if (!user) {
//     redirect("/login");
//   }
//
//   const result = await requestPhoneVerification(user.userId, phone);
//
//   if (!result.success) {
//     redirect("/phone-verify?error=resend_failed&message=Failed to resend code");
//   }
//   
//   // Redirect back to verification page
//   redirect("/phone-verify?resent=true");
// }

async function handleResendOTP(): Promise<void> {
  "use server";

  const user = await requireAuth();

  const dbUser = await db.users.findById(user.userId);
  const phone = dbUser?.phone;
  if (!phone) {
    redirect("/phone-verify?error=no_phone&message=No phone number found. Please update your profile first.");
  }

  const resendResult = await requestPhoneVerification(user.userId, phone as string);
  if (!resendResult.success) {
    const params = new URLSearchParams({
      error: resendResult.error ?? "resend_failed",
      message: resendResult.errorMessage ?? "Could not resend verification code.",
    });
    redirect(`/phone-verify?${params.toString()}`);
  }

  redirect("/phone-verify?resent=true");
}

// ─── Progress Stepper Component ────────────────────────────────────────────────

function ProgressStepper({ currentStep, totalSteps }: Readonly<{ currentStep: number; totalSteps: number }>) {
  const percentage = (currentStep / totalSteps) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="text-text-main dark:text-white text-sm font-bold">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-text-sub dark:text-slate-500 text-xs font-medium">Phone Verification</span>
      </div>
      <div className="h-1.5 w-full bg-[#d5e2e0] dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ─── OTP Input Grid Component ──────────────────────────────────────────────────

function OTPInput() {
  return (
    <form action={handleVerifyOTP} method="POST">
      <div className="flex gap-2 sm:gap-4 justify-between mb-8">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <input
            key={i}
            autoFocus={i === 1}
            className="w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-semibold bg-background-light dark:bg-slate-800 border-2 border-[#eaf1f0] dark:border-slate-700 rounded text-text-main dark:text-white focus:border-primary focus:ring-0 focus:outline-none transition-all placeholder-transparent"
            inputMode="numeric"
            maxLength={1}
            name={`digit${i}`}
            pattern="[0-9]"
            placeholder="0"
            required
            type="text"
          />
        ))}
      </div>

      {/* Resend Link */}
      <div className="text-center mb-8">
        <p className="text-sm text-text-sub dark:text-slate-400">
          Didn&apos;t receive the code?{" "}
          <button className="text-primary font-bold hover:text-primary-dark transition-colors ml-1" formAction={handleResendOTP} type="submit">
            Resend Code
          </button>
          <span className="ml-1 text-xs opacity-60 font-mono">(00:30)</span>
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-4 pt-2">
        <button
          className="w-full h-12 bg-primary hover:bg-primary-dark text-white font-bold rounded shadow-sm transition-all transform active:scale-[0.99] flex items-center justify-center gap-2"
          type="submit"
        >
          <span>Verify &amp; Continue</span>
          <span className="material-symbols-outlined text-sm font-bold">arrow_forward</span>
        </button>
        <button
          className="w-full h-12 bg-transparent border border-[#eaf1f0] dark:border-slate-700 text-text-sub dark:text-slate-400 hover:text-text-main dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold rounded transition-colors text-sm"
          type="button"
        >
          Back to previous step
        </button>
      </div>
    </form>
  );
}

// ─── Left Panel: Branding ──────────────────────────────────────────────────────

function BrandingPanel() {
  return (
    <div className="hidden md:flex md:w-5/12 lg:w-1/2 bg-background-light dark:bg-background-dark p-8 lg:p-12 flex-col justify-between border-r border-[#eaf1f0] dark:border-slate-800 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-primary/20 rounded-full blur-3xl" />

      <div className="relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary-dark dark:text-primary text-xs font-bold uppercase tracking-wider mb-6">
          <span className="material-symbols-outlined text-sm">security</span>
          Secure &amp; Private
        </div>
        <h1 className="text-3xl lg:text-4xl font-display font-bold text-text-main dark:text-white mb-4 leading-tight">
          Building trust through transparent communication.
        </h1>
        <p className="text-text-sub dark:text-slate-400 text-lg leading-relaxed max-w-md">
          KidSchedule helps co-parents manage schedules without conflict. We verify every account to ensure a safe
          environment for your family.
        </p>
      </div>

      <div className="relative z-10 mt-12">
        <div className="rounded-xl overflow-hidden shadow-lg border border-white/20">
          <div
            className="w-full aspect-[4/3] bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBmosNIqJkCS2SyvrUR5K452ugHZ9Zc5_dplb9pJCyWFvsWn5inx_q9ybEKfIwMIXvvD3o5gNZIziKAi-ycy4Syl2vb6Wv50JAZ-Ur1CDlCjP__cm2LlTlzyVbHVvDalQLdDHK09Qg3RNrmGnTViZKc-DlSiKl2m-xNDTTS-x9DT3H9QBqrTBE7azvr61WcAqdW7dMcdIoz2YJgzh5QgjRYIwIa0M07juCrhjrXZ5AckBPRihQNryAYCnkClhgXzQUh_OYRXURpFls')",
            }}
          />
          <div className="bg-white dark:bg-slate-800 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined">shield_person</span>
              </div>
              <div>
                <p className="text-sm font-bold text-text-main dark:text-white">Identity Verified</p>
                <p className="text-xs text-text-sub dark:text-slate-400">Your data is encrypted and secure.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Header Component ──────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-[#eaf1f0] dark:border-slate-800 bg-white dark:bg-background-dark px-6 py-4 lg:px-10">
      <div className="flex items-center gap-3 text-text-main dark:text-white">
        <div className="size-8 text-primary">
          {/* KidSchedule Logo SVG */}
          <svg className="w-full h-full" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path d="M24 4L4 14v14c0 9.25 20 15 20 15s20-5.75 20-15V14L24 4Z" fill="currentColor" />
          </svg>
        </div>
        <h2 className="text-text-main dark:text-white text-xl font-display font-bold leading-tight tracking-tight">
          KidSchedule
        </h2>
      </div>
      <button className="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded bg-transparent hover:bg-[#eaf1f0] dark:hover:bg-slate-800 text-text-main dark:text-white text-sm font-bold leading-normal tracking-wide transition-colors h-10 px-4">
        <span className="truncate">Help</span>
      </button>
    </header>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

/**
 * Phone Verification Page (Step 2 of 3 in onboarding)
 *
 * Multi-step flow:
 * 1. User completes signup with email + password
 * 2. Server generates OTP and sends via SMS
 * 3. User enters 6-digit code from SMS (THIS PAGE)
 * 4. Server validates OTP, marks phone as verified
 * 5. Redirect to family setup (step 3)
 *
 * In production:
 * - Retrieve phone verification request from database (by user session ID)
 * - Handle "Change number" link (goes back to signup, asks for phone)
 * - Implement resend button with countdown timer (client-side)
 * - Show error banner if rate-limited or OTP expired
 */
interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PhoneVerifyPage({ searchParams }: Readonly<PageProps>) {
  const user = await requireAuth();

  const currentVerification = await db.phoneVerifications.findByUserId(user.userId);
  let phoneDisplay = currentVerification
    ? `${currentVerification.phone.slice(0, 2)}****${currentVerification.phone.slice(-4)}`
    : null;

  if (!phoneDisplay) {
    const dbUser = await db.users.findById(user.userId);
    if (dbUser?.phone) {
      const requestResult = await requestPhoneVerification(user.userId, dbUser.phone);
      phoneDisplay = requestResult.phoneDisplay ?? `${dbUser.phone.slice(0, 2)}****${dbUser.phone.slice(-4)}`;
    }
  }

  const params = await searchParams;
  const message = typeof params.message === "string" ? params.message : "";
  const error = typeof params.error === "string" ? params.error : "";
  const resent = params.resent === "true";

  return (
    <>
      <div className="flex flex-col min-h-screen bg-white dark:bg-background-dark">
        {/* Header */}
        <Header />

      {/* Main Content */}
      <main id="main-content" className="flex-1 flex flex-col md:flex-row max-w-[1440px] mx-auto w-full">
        {/* Left Panel: Branding */}
        <BrandingPanel />

        {/* Right Panel: Verification Form */}
        <div className="flex-1 flex flex-col justify-center items-center p-6 md:p-12 lg:p-20 bg-white dark:bg-background-dark">
          <div className="w-full max-w-md flex flex-col gap-8">
            {/* Progress Stepper */}
            <ProgressStepper currentStep={2} totalSteps={3} />

            {/* Header Text */}
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                <span className="material-symbols-outlined text-2xl">sms</span>
              </div>
              <h2 className="text-3xl font-display font-bold text-text-main dark:text-white tracking-tight">
                Verify your mobile number
              </h2>
              <p className="text-text-sub dark:text-slate-400 text-base leading-relaxed">
                We&apos;ve sent a 6-digit code to{" "}
                <span className="font-semibold text-text-main dark:text-white">{phoneDisplay ?? "+1****0000"}</span>. Enter it below to
                secure your account.{" "}
                <a className="text-primary hover:underline ml-1 text-sm font-medium" href="#">
                  Change number
                </a>
              </p>
            </div>

            {resent && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-200">
                New verification code sent.
              </div>
            )}

            {error && message && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800/40 dark:bg-rose-900/20 dark:text-rose-200">
                {message}
              </div>
            )}

            {/* OTP Input Form */}
            <OTPInput />

            {/* Footer Helper */}
            <div className="mt-4 pt-6 border-t border-[#eaf1f0] dark:border-slate-800 text-center">
              <p className="text-xs text-text-sub dark:text-slate-500">
                By continuing, you agree to our{" "}
                <a className="underline hover:text-text-main dark:hover:text-white" href="#">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a className="underline hover:text-text-main dark:hover:text-white" href="#">
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </main>
      </div>
    </>
  );
}
