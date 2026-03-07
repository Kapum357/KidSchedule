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
    <>
      <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white antialiased h-screen w-full flex overflow-hidden">
      {/* Desktop left panel */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-primary/20 items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-primary/10 mix-blend-multiply z-10" />
        <div
          className="absolute w-full h-full bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://lh3.googleusercontent.com/aida-public/AB6AXuB2qbnKpG-L3elt6G4F38crsBEeLy_FKkttGPLFQ3zjLrnVcly8wdAkrSEtr0dwVxvMHuu_TV_9RsSdAbn7L7hCBlIqugdKXJqknMW2QHa8PuLJ_wPeHDuJP3Ow6_RjD41iy3qvi-UVmXfHnrqAOTbdCDRxO14GUdvybrCEq0GiN3PnqN407nHlCxUL9zYmJVd0r7oVkcHsGK38jEWUCOErOCqfrSVUt76TtsQn43Bx2Mnfi6SfRnKx73xXAY0wPxW8eAJGJfx-TqA')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent z-20" />

        <div className="relative z-30 p-12 text-white max-w-lg">
          <div className="flex items-center gap-2 mb-6">
            <div className="bg-white/20 backdrop-blur-sm p-2 rounded-lg">
              <span className="material-symbols-outlined text-3xl">family_restroom</span>
            </div>
            <span className="text-2xl font-bold tracking-tight">KidSchedule</span>
          </div>
          <h2 className="text-4xl font-bold mb-4 leading-tight">
            Peaceful co-parenting starts here.
          </h2>
          <p className="text-lg text-white/90 leading-relaxed">
            Join thousands of parents managing schedules, expenses, and communication in one calm,
            secure place.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 sm:p-12 lg:p-24 bg-white dark:bg-background-dark overflow-y-auto relative">
        <div className="w-full max-w-md space-y-8 text-center">
          {/* Icon */}
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 dark:bg-primary/20">
            <span className="material-symbols-outlined text-5xl text-primary">mark_email_read</span>
          </div>

          {/* Heading */}
          <div className="space-y-4">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Check your email
            </h1>
            <p className="text-slate-600 dark:text-slate-300 text-base leading-relaxed">
              We have sent a password reset link to{" "}
              {email ? (
                <span className="font-semibold text-slate-900 dark:text-white">{email}</span>
              ) : (
                "the email address on your account"
              )}
              . Please check your inbox and follow the instructions to create a new password.
            </p>
          </div>

          <div className="h-4" />

          {/* Actions */}
          <div className="space-y-6">
            <a
              className="inline-flex w-full justify-center items-center rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-all duration-200"
              href="/login"
            >
              <span className="material-symbols-outlined mr-2 text-lg">arrow_back</span>
              Return to login
            </a>

            <div className="text-sm">
              <p className="text-slate-500 dark:text-slate-400">
                Didn&apos;t receive the email?{" "}
                <a
                  className="font-semibold text-primary hover:text-primary-dark transition-colors focus:outline-none focus:underline"
                  href="/forgot-password"
                >
                  Click to resend
                </a>
              </p>
            </div>
          </div>

          {/* Support link */}
          <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
            <a
              className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center gap-1 transition-colors"
              href="mailto:support@kidschedule.com"
            >
              <span className="material-symbols-outlined text-lg">help</span>
              Need help? Contact Support
            </a>
          </div>
        </div>

        {/* Mobile logo — absolute top-left */}
        <div className="absolute top-6 left-6 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 flex items-center justify-center rounded-lg size-8 text-primary">
              <span className="material-symbols-outlined text-xl">family_restroom</span>
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              KidSchedule
            </span>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
