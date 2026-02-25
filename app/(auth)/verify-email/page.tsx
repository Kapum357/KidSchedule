import Link from "next/link";
import { verifyEmailAddress } from "@/lib/auth";

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VerifyEmailPage({ searchParams }: Readonly<PageProps>) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  const result = token
    ? await verifyEmailAddress(token)
    : {
        success: false,
        errorMessage: "Missing verification token. Please use the link in your email.",
      };

  const title = result.success
    ? result.alreadyVerified
      ? "Email already verified"
      : "Email verified successfully"
    : "Email verification failed";

  const description = result.success
    ? result.alreadyVerified
      ? "Your email is already verified. You can log in now."
      : "Great! Your account is now active. You can log in and continue onboarding."
    : result.errorMessage ?? "The verification link is invalid or expired.";

  return (
    <main className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{description}</p>

        <div className="mt-6 flex gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-white font-semibold hover:bg-primary-hover transition-colors"
          >
            Go to login
          </Link>
          {!result.success && (
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Back to signup
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
