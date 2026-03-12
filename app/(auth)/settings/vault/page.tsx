import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/persistence';
import Link from 'next/link';
import { VaultPageClient } from '@/components/vault/vault-page-client';

export const metadata = {
  title: 'School Vault — KidSchedule',
  description: 'Manage and store important school documents for your family',
};

/**
 * School Vault Page
 *
 * Server component that fetches the user's family ID, then renders the client component.
 * This pattern ensures the familyId is available for all vault operations.
 */
export default async function VaultPage() {
  const user = await requireAuth();
  const db = getDb();

  // Fetch family to get family ID
  const family = await db.families.findByParentUserId(user.userId);
  if (!family) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-light p-4 dark:bg-background-dark">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <h2 className="text-lg font-semibold text-red-900 dark:text-red-200">
            Family Not Found
          </h2>
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">
            You must have a family created to access the vault. Please contact support if you need assistance.
          </p>
          <Link
            href="/settings"
            className="mt-4 inline-block rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
          >
            Back to Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-light py-8 dark:bg-background-dark">
      <div className="mx-auto w-full max-w-4xl px-4 md:px-8">
        {/* Breadcrumbs */}
        <nav className="mb-6 flex items-center gap-2 text-sm">
          <Link
            href="/settings"
            className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Settings
          </Link>
          <span className="text-slate-400 dark:text-slate-600">/</span>
          <Link
            href="/settings"
            className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          >
            School
          </Link>
          <span className="text-slate-400 dark:text-slate-600">/</span>
          <span className="text-slate-900 dark:text-slate-200">Vault</span>
        </nav>

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            School Vault Documents
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Securely store and manage important school documents for your family.
          </p>
        </div>

        {/* Help Section */}
        <div className="mb-8 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex gap-3">
            <span className="material-symbols-outlined flex-shrink-0 text-blue-600 dark:text-blue-400">
              info
            </span>
            <div className="flex-1 text-sm">
              <h3 className="font-semibold text-blue-900 dark:text-blue-200">
                About School Vault
              </h3>
              <ul className="mt-2 space-y-1 text-blue-800 dark:text-blue-300">
                <li>
                  Store documents up to your plan&apos;s storage quota
                </li>
                <li>
                  Supported formats: PDF, Word, Excel, JPG, PNG (max 20MB each)
                </li>
                <li>
                  Soft delete: Documents are retained for 30 days before permanent removal
                </li>
                <li>
                  Shared access: All family members can view and manage documents
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Client Component */}
        <VaultPageClient familyId={family.id} />
      </div>
    </div>
  );
}
