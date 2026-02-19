'use client';

import { useState } from 'react';

export default function CTASection() {
  const [loading, setLoading] = useState(false);

  const handleCTAClick = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cta_click' }),
      });
      if (response.ok) {
        globalThis.location.href = '/signup';
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-blue-50/50 py-24">
      <div className="mx-auto max-w-4xl px-4 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Ready to stop the chaos?
        </h2>
        <p className="mt-4 text-lg text-gray-600">
          Join thousands of modern families who have reclaimed their time.
        </p>

        <div className="mt-8 flex justify-center gap-4">
          <button
            onClick={handleCTAClick}
            disabled={loading}
            className="inline-flex h-12 items-center justify-center rounded-lg bg-blue-600 px-8 text-base font-bold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Starting...' : 'Get Started Now'}
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-600">
          No credit card required for 60-day trial.
        </p>
      </div>
    </section>
  );
}
