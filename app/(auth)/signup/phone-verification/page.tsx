/**
 * KidSchedule – Phone Verification Page (Step 2 of 3)
 *
 * Shown after account creation to verify the user's phone number via OTP.
 * OTP input interactivity (auto-advance, countdown) lives in the Client
 * Component `otp-form.tsx`; form submission is handled by a Server Action.
 */

import { redirect } from "next/navigation";
import { verifyPhoneOTP } from "@/lib/auth";
import { getCurrentUser } from "@/lib";
import { OtpForm } from "./otp-form";

// ─── Server Action ─────────────────────────────────────────────────────────────

async function handlePhoneVerification(formData: FormData): Promise<void> {
  "use server";

  const otp = (formData.get("otp") as string | null)?.trim() ?? "";

  if (!/^\d{6}$/.test(otp)) {
    redirect("/signup/phone-verification?error=invalid_code");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?error=session_expired");
  }

  const result = await verifyPhoneOTP(user.userId, otp);

  if (result.success) {
    redirect("/dashboard");
  }

  const params = new URLSearchParams();
  params.set("error", result.error ?? "invalid_code");
  redirect(`/signup/phone-verification?${params.toString()}`);
}

// ─── Left Panel ───────────────────────────────────────────────────────────────

function SecurityPanel() {
  return (
    <div className="hidden md:flex md:w-5/12 lg:w-1/2 bg-background-light dark:bg-background-dark p-8 lg:p-12 flex-col justify-between border-r border-[#eaf1f0] dark:border-slate-800 relative overflow-hidden">
      {/* Background decorative blobs */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-primary/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-6">
          <span aria-hidden="true" className="material-symbols-outlined text-sm">security</span>
          Secure &amp; Private
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4 leading-tight">
          Building trust through transparent communication.
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed max-w-md">
          KidSchedule helps co-parents manage schedules without conflict. We verify every account to
          ensure a safe environment for your family.
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
            role="img"
            aria-label="A happy child smiling while playing"
          />
          <div className="bg-white dark:bg-slate-800 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <span aria-hidden="true" className="material-symbols-outlined">shield_person</span>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Identity Verified</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Your data is encrypted and secure.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_code: "The code you entered is incorrect. Please try again.",
  expired_code: "This code has expired. Please request a new one.",
  too_many_attempts: "Too many attempts. Please wait before trying again.",
};

export default async function PhoneVerificationPage({ searchParams }: Readonly<PageProps>) {
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const phone = typeof params.phone === "string" ? decodeURIComponent(params.phone) : "+1 (555) ***-88";

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white antialiased min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#eaf1f0] dark:border-slate-800 bg-white dark:bg-background-dark px-6 py-4 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 flex items-center justify-center rounded-lg size-8 text-primary">
            <span aria-hidden="true" className="material-symbols-outlined text-xl">family_restroom</span>
          </div>
          <span className="text-xl font-bold tracking-tight">KidSchedule</span>
        </div>
        <button className="flex min-w-[84px] cursor-pointer items-center justify-center rounded bg-transparent hover:bg-[#eaf1f0] dark:hover:bg-slate-800 text-slate-700 dark:text-white text-sm font-bold leading-normal tracking-wide transition-colors h-10 px-4">
          Help
        </button>
      </header>

      {/* Body */}
      <main className="flex-1 flex flex-col md:flex-row max-w-[1440px] mx-auto w-full">
        <SecurityPanel />

        {/* Right panel */}
        <div className="flex-1 flex flex-col justify-center items-center p-6 md:p-12 lg:p-20 bg-white dark:bg-background-dark">
          <div className="w-full max-w-md flex flex-col gap-8">

            {/* Progress stepper */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-900 dark:text-white text-sm font-bold">Step 2 of 3</span>
                <span className="text-slate-500 dark:text-slate-500 text-xs font-medium">Phone Verification</span>
              </div>
              <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-primary w-2/3 rounded-full" />
              </div>
            </div>

            {/* Heading */}
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <span aria-hidden="true" className="material-symbols-outlined text-2xl">sms</span>
              </div>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                Verify your mobile number
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-base leading-relaxed">
                We&apos;ve sent a 6-digit code to{" "}
                <span className="font-semibold text-slate-900 dark:text-white">{phone}</span>. Enter it
                below to secure your account.{" "}
                <a className="text-primary hover:underline text-sm font-medium" href="/signup">
                  Change number
                </a>
              </p>
            </div>

            {/* Error banner */}
            {errorKey && (
              <div
                className="rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 px-4 py-3 flex items-start gap-3"
                role="alert"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-red-500 text-xl mt-0.5 shrink-0">
                  error
                </span>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  {ERROR_MESSAGES[errorKey] ?? "An error occurred. Please try again."}
                </p>
              </div>
            )}

            {/* OTP form (client component) */}
            <OtpForm phone={phone} action={handlePhoneVerification} />

            {/* Footer */}
            <div className="mt-4 pt-6 border-t border-[#eaf1f0] dark:border-slate-800 text-center">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                By continuing, you agree to our{" "}
                <a className="underline hover:text-slate-900 dark:hover:text-white" href="/terms">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a className="underline hover:text-slate-900 dark:hover:text-white" href="/privacy">
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
