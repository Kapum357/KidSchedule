import type { DbUser } from "@/lib/persistence/types";

interface ProfileSettingsFormProps {
  profile: DbUser | null;
  submitAction: (formData: FormData) => Promise<void>;
  status?: "success" | "error";
  message?: string;
}

export function ProfileSettingsForm({
  profile,
  submitAction,
  status,
  message,
}: Readonly<ProfileSettingsFormProps>) {
  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white shadow-sm dark:bg-neutral-dark"
      id="profile"
    >
      <div className="border-b border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-bold text-slate-600 dark:text-slate-900">Profile Settings</h3>
        <p className="text-sm text-slate-600 dark:text-slate-900">
          Update your personal identification and contact details.
        </p>
      </div>

      <form action={submitAction} className="flex flex-col gap-6 p-6">
        {status && message && (
          <p
            className={`rounded-md border px-3 py-2 text-sm ${
              status === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-200"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/40 dark:bg-rose-900/20 dark:text-rose-200"
            }`}
            role="status"
          >
            {message}
          </p>
        )}

        <div className="flex flex-col gap-4 md:flex-row">
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-sm font-semibold text-slate-600 dark:text-slate-900" htmlFor="fullName">
              Full Name
            </label>
            <input
              id="fullName"
              name="fullName"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background-light p-3 text-slate-700 focus:border-primary focus:ring-primary dark:bg-background-dark dark:text-slate-800"
              type="text"
              defaultValue={profile?.fullName ?? ""}
              required
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-sm font-semibold text-slate-600 dark:text-slate-900" htmlFor="emailAddress">
              Email Address
            </label>
            <input
              id="emailAddress"
              name="email"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background-light p-3 text-slate-700 focus:border-primary focus:ring-primary dark:bg-background-dark dark:text-slate-800"
              type="email"
              defaultValue={profile?.email ?? ""}
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-600 dark:text-slate-900" htmlFor="phoneNumber">
            Phone Number (used for security verification)
          </label>
          <div className="flex gap-2">
            <input
              id="phoneNumber"
              name="phone"
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-background-light p-3 text-slate-700 focus:border-primary focus:ring-primary dark:bg-background-dark dark:text-slate-800"
              type="tel"
              defaultValue={profile?.phone ?? ""}
              placeholder="+15551234567"
            />
            {profile?.phoneVerified && (
              <div className="flex items-center gap-1 rounded-lg bg-green-100 px-3 text-xs font-bold uppercase tracking-wider text-green-700">
                <span className="material-symbols-outlined text-sm">verified</span>
                Verified
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <button className="rounded-lg bg-primary px-6 py-2 font-bold text-white transition-colors hover:bg-primary/90" type="submit">
            Save Changes
          </button>
        </div>
      </form>
    </section>
  );
}
