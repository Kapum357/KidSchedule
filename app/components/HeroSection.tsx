'use client';

import Image from 'next/image';
import { useState } from 'react';

export default function HeroSection() {
  const [loading, setLoading] = useState(false);

  const handleStartTrial = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_trial' }),
      });
      if (response.ok) {
        // Redirect to signup page or show success
        globalThis.location.href = '/signup';
      }
    } catch (error) {
      console.error('Error starting trial:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="relative overflow-hidden pt-16 pb-24 lg:pt-32 lg:pb-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="mx-auto max-w-4xl text-4xl font-black tracking-tight text-gray-900 sm:text-6xl mb-6 leading-tight">
          The family calendar that{' '}
          <span className="text-blue-600">actually works.</span>
        </h1>

        <p className="mx-auto max-w-2xl text-lg text-gray-600 mb-10 leading-relaxed">
          Coordinate schedules, expenses, and communication in one secure place.
          Built for modern families who need to handle the chaos so they can
          enjoy the moments.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <button
            onClick={handleStartTrial}
            disabled={loading}
            className="inline-flex h-12 items-center justify-center rounded-lg bg-blue-600 px-8 text-base font-bold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Starting...' : 'Start Free for 60 Days'}
          </button>

          <button className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-200 bg-white px-8 text-base font-bold text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-colors">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5 mr-2 text-blue-600"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            Watch Demo
          </button>
        </div>

        {/* Dashboard Preview */}
        <div className="relative mx-auto max-w-5xl rounded-2xl bg-gray-900/5 p-2 lg:p-4 ring-1 ring-gray-900/10">
          <div className="rounded-xl overflow-hidden shadow-2xl bg-white border border-gray-200">
            <div className="aspect-[16/10] w-full bg-gradient-to-br from-blue-50 to-indigo-50/50 relative overflow-hidden group">
              <Image
                alt="Dashboard calendar interface showing colorful event blocks"
                className="object-cover object-top opacity-90 transition-opacity duration-700 hover:opacity-100"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDTXL6SwNbjuHV1M05RYV7XHMnyPU5bz1tJ7G6Q6Tnf2nw3AwyK3xLrK-nTsmF9oN-UidB-IS2kbKEtHcoj_yi_kdxz46nIrjWXOtPPeNW8lXxg0HCA3_LCm2lnfmXam9HmxTOtYSrK1RaTj07D_PT_qwPk4ZtqaM9FdtzUpkewJzR2C_-KCOenjM0UVoPP8f2UaGacP6C9ka34lnDzJ-8QEf1_78TIiL2tf2RJwnKRfKF2wYv1B2mureuWu4M2ImPcHISGoHyPNxo"
                fill
                priority
                unoptimized
              />
            </div>
          </div>
        </div>

        {/* Trust badges */}
        <div className="mt-12 flex flex-col items-center gap-4">
          <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Trusted by 50,000+ happy families
          </p>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 opacity-50">
            <span className="text-xl font-bold font-serif">Parenting Today</span>
            <span className="text-xl font-bold font-mono">FamilyTech</span>
            <span className="text-xl font-bold italic">ModernMom</span>
            <span className="text-xl font-bold">TheDailyDad</span>
          </div>
        </div>
      </div>
    </section>
  );
}
