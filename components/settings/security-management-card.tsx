import Link from "next/link";

interface SecurityManagementCardProps {
  phone?: string;
  phoneVerified: boolean;
}

export function SecurityManagementCard({ phone, phoneVerified }: Readonly<SecurityManagementCardProps>) {
  const returnTo = encodeURIComponent("/settings#security");
  const manageHref = `/phone-verify?returnTo=${returnTo}`;

  const title = phoneVerified ? "Phone verification is ACTIVE" : "Phone verification is NOT completed";
  const description = phone
    ? "Manage or re-verify your phone to keep your account recovery and sign-in checks current."
    : "Add a phone number in Profile Settings, then verify it here for security checks.";

  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white shadow-sm dark:bg-neutral-dark"
      id="security"
    >
      <div className="border-b border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-bold text-slate-600 dark:text-slate-900">Security &amp; Privacy</h3>
        <p className="text-sm text-slate-500">Manage password and compliance settings.</p>
      </div>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-600 dark:text-slate-900" htmlFor="phone-verification-status">
            Phone Verification
          </label>
          <div
            className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-primary/5 p-4"
            id="phone-verification-status"
          >
            <span className="material-symbols-outlined text-primary">security</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-600 dark:text-slate-900">{title}</p>
              <p className="text-xs text-slate-500">{description}</p>
            </div>
            <Link className="text-xs font-bold text-primary underline" href={manageHref}>
              Manage
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-900">GDPR &amp; Consent (FR-12)</p>
          <div className="space-y-3">
            <label className="flex items-start gap-3">
              <input defaultChecked className="mt-1 rounded text-primary focus:ring-primary" type="checkbox" />
              <span className="text-sm text-slate-700 dark:text-slate-800">
                I consent to the processing of my communication data for the purpose of mediation analysis.
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input defaultChecked className="mt-1 rounded text-primary focus:ring-primary" type="checkbox" />
              <span className="text-sm text-slate-700 dark:text-slate-800">
                Allow legal export of my communication logs for mediation purposes.
              </span>
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}
