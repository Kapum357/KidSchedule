import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/persistence";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function VaultPage() {
  const user = await requireAuth();
  const currentParent = await db.parents.findByUserId(user.userId);

  if (!currentParent) {
    redirect("/calendar/wizard?onboarding=1");
  }

  const docs = await db.schoolVaultDocuments.findByFamilyId(currentParent.familyId);

  return (
    <main className="min-h-screen bg-background-light dark:bg-background-dark p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Family Vault</h1>
          <a
            href="/dashboard"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Back to Dashboard
          </a>
        </div>

        {docs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            No vault documents yet. Uploaded school and family files will appear here.
          </div>
        ) : (
          <ul className="space-y-3">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{doc.title}</p>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(doc.addedAt)}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {doc.statusLabel} • {doc.fileType.toUpperCase()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
