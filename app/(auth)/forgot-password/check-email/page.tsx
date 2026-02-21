/**
 * KidSchedule – Check Email Confirmation Page
 *
 * Shown after user submits password reset request.
 * Instructs user to check their email for the reset link.
 *
 * No Server Actions needed – purely informational.
 */

export default async function CheckEmailPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? decodeURIComponent(params.email) : null;

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white antialiased h-screen w-full flex overflow-hidden">
      {/* Desktop left panel */}
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
            <h2 className="text-4xl font-bold mb-4 leading-tight">Check your inbox.</h2>
            <p className="text-teal-100/80 text-lg font-light">
              We&apos;ve sent a password reset link to your email. Click it to set a new password.
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

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 sm:p-12 bg-white dark:bg-background-dark overflow-y-auto">
        <div className="w-full max-w-md space-y-8 text-center">
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
          <div>
            <div className="inline-flex items-center justify-center size-16 rounded-full bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 mb-6">
              <span className="material-symbols-outlined text-4xl">mail_outline</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Check your email
            </h1>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-400 leading-relaxed">
              We&apos;ve sent a password reset link to{" "}
              {email ? (
                <>
                  <span className="font-semibold text-slate-900 dark:text-white">{email}</span>
                </>
              ) : (
                "the email address on your account"
              )}
              .
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4 mt-8 text-left">
            <div className="flex gap-4 items-start">
              <div className="flex items-center justify-center size-8 rounded-full bg-primary text-white font-semibold text-sm shrink-0">
                1
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Open the email</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Look for an email from KidSchedule (check spam if needed).
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex items-center justify-center size-8 rounded-full bg-primary text-white font-semibold text-sm shrink-0">
                2
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Click the reset link</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  The link expires in 1 hour for security.
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex items-center justify-center size-8 rounded-full bg-primary text-white font-semibold text-sm shrink-0">
                3
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Set a new password</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Choose a strong password you haven&apos;t used before.
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Didn&apos;t receive the email?</p>
            <a
              className="inline-block rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white px-6 py-2 font-medium transition-colors"
              href="/forgot-password"
            >
              Try again
            </a>
          </div>

          {/* Back to login */}
          <div>
            <a
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary transition-colors dark:text-slate-400 dark:hover:text-primary"
              href="/login"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              Return to login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
