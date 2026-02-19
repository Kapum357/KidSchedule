'use client';

import Header from '@/app/components/Header';
import HeroSection from '@/app/components/HeroSection';
import UseCasesGrid from '@/app/components/UseCasesGrid';
import PricingSection from '@/app/components/PricingSection';
import CTASection from '@/app/components/CTASection';
import Footer from '@/app/components/Footer';

export default function Home() {
  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden bg-white text-gray-900 antialiased">
      <Header />
      <main className="flex-grow">
        <HeroSection />
        <UseCasesGrid />
        <PricingSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
