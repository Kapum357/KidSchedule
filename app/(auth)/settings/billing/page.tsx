/**
 * Billing Settings Page
 *
 * Displays the user's current subscription plan and allows plan management.
 */

import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/persistence";
import { BillingSection } from "@/components/billing-section";

export const metadata = {
  title: "Billing Settings — KidSchedule",
  description: "Manage your subscription and billing information",
};

export default async function BillingSettingsPage() {
  const user = await requireAuth();

  // Fetch Stripe customer and subscription
  const stripeCustomer = await db.stripeCustomers.findByUserId(user.userId);
  let subscription = null;
  if (stripeCustomer) {
    subscription = await db.subscriptions.findByCustomer(stripeCustomer.id);
  }
  const currentPlanTier = subscription?.planTier ?? null;

  return (
    <div className="min-h-screen bg-background-light p-6 dark:bg-background-dark">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Billing Settings</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Manage your subscription plan, view invoices, and update payment methods.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <BillingSection
            userId={user.userId}
            currentPlanTier={currentPlanTier}
            subscription={subscription ?? null}
          />
        </div>
      </div>
    </div>
  );
}
