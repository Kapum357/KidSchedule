'use client';

import Header from './components/Header';
import HeroSection from './components/HeroSection';
import UseCasesGrid from './components/UseCasesGrid';
import PricingSection from './components/PricingSection';
import CTASection from './components/CTASection';
import Footer from './components/Footer';

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
