"use client";

import { useEffect, useState } from "react";
import { PricingCard } from "./pricing-card";
import type { DbPlanTier, DbSubscription } from "@/lib/persistence/types";

interface BillingSectionProps {
  userId: string;
  currentPlanTier: string | null;
  subscription: DbSubscription | null;
}

export function BillingSection({ userId, currentPlanTier, subscription }: BillingSectionProps) {
  const [plans, setPlans] = useState<DbPlanTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPricingModal, setShowPricingModal] = useState(false);

  useEffect(() => {
    async function fetchPlans() {
      try {
        const response = await fetch("/api/billing/plans");
        const data = await response.json();
        setPlans(data.plans || []);
      } catch (error) {
        console.error("Failed to fetch plans:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchPlans();
  }, []);

  async function handleOpenPortal() {
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      });

      if (!response.ok) {
        console.error("Failed to open billing portal");
        return;
      }

      const { portalUrl } = await response.json();
      if (portalUrl) {
        window.location.href = portalUrl;
      }
    } catch (error) {
      console.error("Failed to open billing portal:", error);
    }
  }

  async function handleCancelSubscription() {
    if (!confirm("Are you sure? Your subscription will end at the end of your current billing period.")) {
      return;
    }

    try {
      const response = await fetch("/api/billing/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atPeriodEnd: true }),
      });

      if (!response.ok) {
        console.error("Failed to cancel subscription");
        return;
      }

      // Reload to reflect the change
      window.location.reload();
    } catch (error) {
      console.error("Failed to cancel subscription:", error);
    }
  }

  if (loading) {
    return <div className="text-center text-slate-600 dark:text-slate-400">Loading billing information...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Current Plan Section */}
      <div>
        <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">Your Current Plan</h2>

        {subscription ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">Plan</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white capitalize">
                {subscription.planTier}
              </p>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Status</p>
                <p className="font-semibold text-slate-900 dark:text-white capitalize">
                  {subscription.status}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Billing Period</p>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {subscription.currentPeriodStart
                    ? new Date(subscription.currentPeriodStart).toLocaleDateString()
                    : "—"}{" "}
                  to{" "}
                  {subscription.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                    : "—"}
                </p>
              </div>
            </div>

            {subscription.cancelAtPeriodEnd && (
              <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                Your subscription will be cancelled at the end of your current billing period.
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowPricingModal(true)}
                className="flex-1 rounded-lg bg-primary px-4 py-2 font-semibold text-white hover:opacity-90"
              >
                Upgrade/Downgrade Plan
              </button>
              <button
                onClick={handleOpenPortal}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:text-white dark:hover:bg-slate-800"
              >
                Manage Payment Methods
              </button>
              {!subscription.cancelAtPeriodEnd && (
                <button
                  onClick={handleCancelSubscription}
                  className="flex-1 rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Cancel Subscription
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-4 text-slate-600 dark:text-slate-400">You&apos;re currently on the Free Plan</p>
            <button
              onClick={() => setShowPricingModal(true)}
              className="rounded-lg bg-primary px-6 py-2 font-semibold text-white hover:opacity-90"
            >
              Upgrade to a Paid Plan
            </button>
          </div>
        )}
      </div>

      {/* Pricing Cards Modal/Section */}
      {showPricingModal && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Choose Your Plan</h2>
            <button
              onClick={() => setShowPricingModal(false)}
              className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              ✕
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <PricingCard
                key={plan.id}
                tier={plan}
                isPopular={plan.id === "plus"}
                currentTier={currentPlanTier}
              />
            ))}
          </div>
        </div>
      )}

      {/* Billing History Section */}
      <div>
        <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">Billing History</h2>
        <p className="text-slate-600 dark:text-slate-400">
          View and download invoices in the{" "}
          <button
            onClick={handleOpenPortal}
            className="font-semibold text-primary hover:underline"
          >
            Stripe Billing Portal
          </button>
          .
        </p>
      </div>
    </div>
  );
}
