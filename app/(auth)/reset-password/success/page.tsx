/**
 * KidSchedule – Password Reset Success Page
 *
 * Shown after successful password reset.
 * Informs user that their password has been changed and prompts them to log in.
 */


export default async function ResetSuccessPage() {
  return (
    <>
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
            <h2 className="text-4xl font-bold mb-4 leading-tight">All set!</h2>
            <p className="text-teal-100/80 text-lg font-light">
              Your password has been successfully reset. You&apos;re ready to log in and get back to managing
              your family&apos;s schedule.
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

          {/* Success icon & heading */}
          <div>
            <div className="inline-flex items-center justify-center size-20 rounded-full bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 mb-6 animate-bounce">
              <span className="material-symbols-outlined text-5xl">check_circle</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Password reset!
            </h1>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-400">
              Your password has been successfully changed. You can now log in with your new password.
            </p>
          </div>

          {/* CTA */}
          <a
            className="inline-block rounded-lg bg-primary hover:bg-primary-dark text-white px-8 py-3 font-semibold transition-colors"
            href="/login"
          >
            Log in now
          </a>

          {/* Security tip */}
          <div className="mt-10 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
            <div className="flex gap-3">
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 shrink-0">
                info
              </span>
              <div className="text-left">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                  Security tip
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  If you didn&apos;t request this password reset, you can ignore this message. Your old password is no longer
                  valid.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
