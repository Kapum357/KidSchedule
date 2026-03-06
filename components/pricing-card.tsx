"use client";

import { useRouter } from "next/navigation";
import type { DbPlanTier } from "@/lib/persistence/types";

interface PricingCardProps {
  tier: DbPlanTier;
  isPopular?: boolean;
  currentTier?: string | null;
}

export function PricingCard({ tier, isPopular = false, currentTier }: PricingCardProps) {
  const router = useRouter();
  const isCurrentPlan = currentTier === tier.id;
  const monthlyPrice = (tier.monthlyPriceCents / 100).toFixed(2);

  async function handleSelectPlan() {
    try {
      const response = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId: tier.stripePriceId,
          successPath: "/billing/success",
          cancelPath: "/settings/billing",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("Checkout error:", error.message);
        return;
      }

      const { checkoutUrl } = await response.json();
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      }
    } catch (error) {
      console.error("Failed to create checkout session:", error);
    }
  }

  return (
    <div
      className={`relative rounded-lg border p-8 transition-all ${
        isPopular
          ? "border-primary bg-primary/5 ring-2 ring-primary"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      }`}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 transform">
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
            Most Popular
          </span>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{tier.displayName}</h3>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-bold text-slate-900 dark:text-white">
            ${monthlyPrice}
          </span>
          <span className="text-slate-600 dark:text-slate-400">/month</span>
        </div>
      </div>

      <ul className="mb-6 space-y-2">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <span className="text-primary">✓</span>
            {feature}
          </li>
        ))}
      </ul>

      <div className="mb-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        <p>
          <span className="font-semibold">Max children:</span> {tier.maxChildren}
        </p>
        <p>
          <span className="font-semibold">Max documents:</span> {tier.maxDocuments}
        </p>
      </div>

      <button
        onClick={handleSelectPlan}
        disabled={isCurrentPlan}
        className={`w-full rounded-lg px-4 py-2 font-semibold transition ${
          isCurrentPlan
            ? "cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-700"
            : "bg-primary text-white hover:opacity-90"
        }`}
      >
        {isCurrentPlan ? "Current Plan" : "Choose Plan"}
      </button>
    </div>
  );
}
