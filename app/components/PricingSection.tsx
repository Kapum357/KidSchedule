'use client';

import { useState } from 'react';

interface PricingTier {
  id: string;
  name: string;
  description: string;
  price: number;
  period: string;
  buttonText: string;
  buttonStyle: 'primary' | 'secondary';
  features: string[];
  highlighted: boolean;
}

export default function PricingSection() {
  const [billingMode, setBillingMode] = useState<'per-parent' | 'full-family'>(
    'per-parent'
  );

  const pricingTiers: PricingTier[] = [
    {
      id: 'essential',
      name: 'Essential',
      description: 'Perfect for getting organized.',
      price: 0,
      period: '/month',
      buttonText: 'Get Started Free',
      buttonStyle: 'secondary',
      features: [
        'Basic Shared Calendar',
        'Up to 2 Family Members',
        'Basic To-do Lists',
      ],
      highlighted: false,
    },
    {
      id: 'plus',
      name: 'Plus',
      description: 'For busy families needing more.',
      price: 9,
      period: '/month',
      buttonText: 'Start Free Trial',
      buttonStyle: 'primary',
      features: [
        'Everything in Essential',
        'Expense Tracking & Splitting',
        'Unlimited Family Members',
        'Secure Messaging',
      ],
      highlighted: true,
    },
    {
      id: 'complete',
      name: 'Complete',
      description: 'Total peace of mind.',
      price: 19,
      period: '/month',
      buttonText: 'Contact Sales',
      buttonStyle: 'secondary',
      features: [
        'Everything in Plus',
        'Legal Document Storage',
        'Priority Support',
        'Data Export for Court',
      ],
      highlighted: false,
    },
  ];

  return (
    <section className="py-24 bg-white relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Choose the plan that fits your family best.
          </p>

          {/* Toggle Switch */}
          <div className="inline-flex rounded-lg bg-gray-100 p-1 mb-8">
            <button
              onClick={() => setBillingMode('per-parent')}
              className={`rounded-md px-6 py-2 text-sm font-semibold transition-all ${
                billingMode === 'per-parent'
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Per Parent
            </button>
            <button
              onClick={() => setBillingMode('full-family')}
              className={`rounded-md px-6 py-2 text-sm font-medium transition-all ${
                billingMode === 'full-family'
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Full Family
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-8 items-start">
          {pricingTiers.map((tier) => (
            <div
              key={tier.id}
              className={`${
                tier.highlighted
                  ? 'relative rounded-2xl border-2 border-blue-600 bg-white p-8 shadow-xl transform scale-105 z-10'
                  : 'rounded-2xl border border-gray-200 bg-white p-8 shadow-sm'
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-sm">
                  Best Value
                </div>
              )}

              <h3 className="text-lg font-semibold text-gray-900">
                {tier.name}
              </h3>
              <p className="mt-4 text-sm text-gray-600">{tier.description}</p>

              <p className="mt-8 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-gray-900">
                  ${tier.price}
                </span>
                <span className="text-sm font-semibold text-gray-600">
                  {tier.period}
                </span>
              </p>

              <button
                className={`mt-8 block w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                  tier.buttonStyle === 'primary'
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-600/20'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                }`}
              >
                {tier.buttonText}
              </button>

              <ul className="mt-8 space-y-3 text-sm text-gray-600">
                {tier.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <svg
                      className="w-5 h-5 text-emerald-500 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {feature.includes('Everything in') ? (
                      <strong>{feature}</strong>
                    ) : (
                      feature
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
