import Link from "next/link";
import { AudienceDetector } from "./landing-client";
import type { Metadata } from "next";
import { generateDefaultMetadata } from "@/lib/og-images";
import { HeroBackground } from "@/components/optimized-image";

/**
 * Landing Page Metadata
 * 
 * Uses audience-aware OG images for better social media engagement.
 * The default metadata is for "family" audience.
 * 
 * For dynamic audience-specific OG images based on URL params,
 * this would need to be a dynamic route with generateMetadata().
 */
export const metadata: Metadata = generateDefaultMetadata();

/**
 * Landing Page – Root Route
 *
 * This is a Next.js Server Component that renders the marketing homepage.
 * Dynamic content (audience targeting) is handled by client components that
 * read URL params and localStorage.
 *
 * Structure:
 * - Hero with dynamic messaging
 * - Social proof bar
 * - Feature grid (#features)
 * - Pricing cards (#pricing)
 * - Final CTA + footer
 *
 * Social Targeting:
 * - URL param ?audience=coparent|family|team|pta
 * - Referrer detection (e.g., from divorce lawyer sites)
 * - localStorage persistence across visits
 */
export default function LandingPage() {
  return (
    <>
      {/* JSON-LD Structured Data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "@id": "https://kidschedule.com/#organization",
                "name": "KidSchedule",
                "url": "https://kidschedule.com",
                "logo": "https://kidschedule.com/logo.png",
                "description": "The trusted co-parenting platform for shared custody scheduling, expense splitting, and conflict-free communication.",
                "foundingDate": "2024",
                "sameAs": [
                  "https://twitter.com/kidschedule",
                  "https://facebook.com/kidschedule"
                ]
              },
              {
                "@type": "WebSite",
                "@id": "https://kidschedule.com/#website",
                "url": "https://kidschedule.com",
                "name": "KidSchedule",
                "publisher": {
                  "@id": "https://kidschedule.com/#organization"
                },
                "potentialAction": {
                  "@type": "SearchAction",
                  "target": "https://kidschedule.com/search?q={search_term_string}",
                  "query-input": "required name=search_term_string"
                }
              },
              {
                "@type": "SoftwareApplication",
                "name": "KidSchedule",
                "applicationCategory": "LifestyleApplication",
                "operatingSystem": "Web, iOS, Android",
                "offers": {
                  "@type": "Offer",
                  "price": "5.99",
                  "priceCurrency": "USD",
                  "priceValidUntil": "2027-12-31",
                  "availability": "https://schema.org/InStock",
                  "description": "60-day free trial, no credit card required"
                },
                "aggregateRating": {
                  "@type": "AggregateRating",
                  "ratingValue": "4.8",
                  "ratingCount": "2847",
                  "bestRating": "5"
                },
                "description": "Family calendar and co-parenting coordination platform with shared custody scheduling, expense tracking, and secure messaging."
              }
            ]
          }),
        }}
      />

      <script
        id="tailwind-config"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            theme: {
              extend: {
                colors: {
                  primary: "#6BCABD",
                  "primary-hover": "#5ab5a8",
                  "primary-dark": "#4a9d91",
                  "surface-dark": "#1c2b2a",
                  "surface-darker": "#12191a",
                  accent: "#FFA726",
                  "accent-hover": "#FB8C00",
                },
                fontFamily: {
                  sans: ["Nunito Sans", "system-ui", "sans-serif"],
                },
              },
            },
          }),
        }}
      />

      <AudienceDetector />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-primary text-3xl">
                calendar_month
              </span>
              <span className="font-bold text-xl text-gray-900">KidSchedule</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-700 hover:text-primary transition-colors">
                Features
              </a>
              <a href="#pricing" className="text-gray-700 hover:text-primary transition-colors">
                Pricing
              </a>
              <Link href="/blog" className="text-gray-700 hover:text-primary transition-colors">
                Blog
              </Link>
              <Link
                href="/school"
                className="text-gray-700 hover:text-primary transition-colors flex items-center space-x-1"
              >
                <span>For PTAs</span>
                <span className="text-xs bg-accent text-white px-1.5 py-0.5 rounded font-semibold">
                  NEW
                </span>
              </Link>
              <Link
                href="/login"
                className="text-gray-700 hover:text-primary transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                Get Started
              </Link>
            </div>
            <button
              className="mobile-menu-btn md:hidden text-gray-700 hover:text-primary transition-colors"
              aria-label="Open menu"
              aria-expanded="false"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-16 px-4 sm:px-6 lg:px-8 min-h-[600px] overflow-hidden">
        <HeroBackground
          src="/images/hero"
          alt="Families using KidSchedule calendar app to coordinate schedules"
          priority
          overlay
          className="absolute inset-0"
        />
        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <h1
              id="hero-headline"
              className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight"
              data-coparent="Co-parenting made peaceful. Court-ready when it&apos;s not."
              data-family="The family calendar that actually works."
              data-team="One calendar for the whole team."
              data-pta="Run your PTA without the chaos."
            >
              The family calendar that actually works.
            </h1>
            <p
              id="hero-subheadline"
              className="text-xl sm:text-2xl text-gray-600 mb-8 leading-relaxed"
              data-coparent="Tamper-proof messaging. Documented everything. Built for your sanity — and your lawyer's."
              data-family="School schedules, activities, and everyone's stuff — finally in one place. Syncs everywhere."
              data-team="Parents subscribe and stay updated. Practices, games, and schedules synced automatically."
              data-pta="Member directory, events, volunteer signups, announcements. Everything in one place."
            >
              School schedules, activities, and everyone&apos;s stuff — finally in one place.
              Syncs everywhere. Works for any family.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4 mb-8">
              <div className="w-full sm:w-auto flex flex-col items-center">
                <Link
                  href="/signup"
                  className="w-full sm:w-auto bg-primary hover:bg-primary-hover text-white px-8 py-4 rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  Start Free for 60 Days
                </Link>
                <p className="text-sm text-gray-500 mt-2">No credit card required</p>
              </div>
              <a
                href="#features"
                className="w-full sm:w-auto bg-white hover:bg-gray-50 text-gray-900 px-8 py-4 rounded-lg font-semibold text-lg transition-all border-2 border-gray-200 hover:border-primary"
              >
                See How It Works
              </a>
            </div>
            <div className="flex flex-wrap items-center justify-center space-x-6 text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <span className="material-symbols-outlined text-primary">check_circle</span>
                <span>45,000+ school calendars</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="material-symbols-outlined text-primary">check_circle</span>
                <span>Syncs to any calendar app</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="material-symbols-outlined text-primary">check_circle</span>
                <span>Share with caregivers</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Bar */}
      <section className="py-8 bg-gray-50 border-y border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center space-x-8 text-center">
            <div className="flex flex-col items-center">
              <div className="text-3xl font-bold text-primary">45,000+</div>
              <div className="text-sm text-gray-600">School districts</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-3xl font-bold text-primary">500K+</div>
              <div className="text-sm text-gray-600">Families organized</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-3xl font-bold text-primary">4.9/5</div>
              <div className="text-sm text-gray-600">Average rating</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-3xl font-bold text-primary">60 days</div>
              <div className="text-sm text-gray-600">Free trial</div>
            </div>
          </div>
        </div>
      </section>

      {/* Audience Selector Pills (visible when no audience is set) */}
      <section className="py-12 bg-white" id="audience-selector-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Built for how families really work</h2>
            <p className="text-gray-600">
              Whether you&apos;re coordinating with a spouse, a co-parent, a coach, or grandma.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              data-audience="family"
              className="audience-pill flex items-center space-x-3 px-6 py-4 bg-white border-2 border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-all"
            >
              <span className="text-3xl">👨‍👩‍👧‍👦</span>
              <div className="text-left">
                <div className="font-semibold text-gray-900">Busy Families</div>
                <div className="text-sm text-gray-600">School, sports, carpools</div>
              </div>
            </button>
            <button
              data-audience="coparent"
              className="audience-pill flex items-center space-x-3 px-6 py-4 bg-white border-2 border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-all"
            >
              <span className="text-3xl">⚖️</span>
              <div className="text-left">
                <div className="font-semibold text-gray-900">Co-Parents</div>
                <div className="text-sm text-gray-600">Custody schedules, documentation</div>
              </div>
            </button>
            <button
              data-audience="team"
              className="audience-pill flex items-center space-x-3 px-6 py-4 bg-white border-2 border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-all"
            >
              <span className="text-3xl">⚽</span>
              <div className="text-left">
                <div className="font-semibold text-gray-900">Teams &amp; Clubs</div>
                <div className="text-sm text-gray-600">One calendar for everyone</div>
              </div>
            </button>
            <button
              data-audience="pta"
              className="audience-pill flex items-center space-x-3 px-6 py-4 bg-white border-2 border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-all"
            >
              <span className="text-3xl">🏫</span>
              <div className="text-left">
                <div className="font-semibold text-gray-900">PTAs &amp; Schools</div>
                <div className="text-sm text-gray-600">Member directory, events</div>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Features that save you time
            </h2>
            <p className="text-xl text-gray-600">
              No more juggling apps, spreadsheets, and group texts.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature Card - School Calendar Sync */}
            <div className="p-6 bg-gray-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">school</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">School Calendar Sync</h3>
              <p className="text-gray-600">
                45,000+ school districts. Import your school&apos;s calendar with one click —
                holidays, early dismissals, conferences.
              </p>
            </div>

            {/* Feature Card - AI Calendar Import */}
            <div className="p-6 bg-gray-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">
                  photo_camera
                </span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">AI Calendar Import</h3>
              <p className="text-gray-600">
                Snap a photo of any schedule — sports, camp, activities. AI extracts dates and adds
                them automatically. Magic.
              </p>
            </div>

            {/* Feature Card - Syncs Everywhere */}
            <div className="p-6 bg-gray-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">sync</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Syncs Everywhere</h3>
              <p className="text-gray-600">
                Subscribe in Google Calendar, Apple, or Outlook. Changes sync automatically. One
                source of truth.
              </p>
            </div>

            {/* Feature Card - Child-by-Child View */}
            <div className="p-6 bg-gray-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">
                  face
                </span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Child-by-Child View</h3>
              <p className="text-gray-600">
                Each kid gets their own color and schedule. See Emma&apos;s soccer and Jake&apos;s
                piano without the visual chaos.
              </p>
            </div>

            {/* Feature Card - Share with Caregivers */}
            <div className="p-6 bg-gray-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">
                  family_restroom
                </span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Share with Caregivers</h3>
              <p className="text-gray-600">
                Grandparents, nannies, babysitters — give them view-only access to the schedule.
                Revoke anytime.
              </p>
            </div>

            {/* Feature Card - Smart Reminders */}
            <div className="p-6 bg-gray-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">
                  notifications
                </span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Smart Reminders</h3>
              <p className="text-gray-600">
                Morning digest of the day ahead. Alerts when things change. Quiet hours so you&apos;re
                not pinged at midnight.
              </p>
            </div>

            {/* Feature Card - Custody Schedules (co-parent specific) */}
            <div className="p-6 bg-gray-50 rounded-xl hover:shadow-lg transition-shadow feature-coparent">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">gavel</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Custody Calendar</h3>
              <p className="text-gray-600">
                7-7, 2-2-3, 2-2-5-5, EOW — all patterns built in. Visual color-coded calendar shows
                who has the kids.
              </p>
            </div>

            {/* Feature Card - Tamper-Proof Messaging (co-parent specific) */}
            <div className="p-6 bg-gray-50 rounded-xl hover:shadow-lg transition-shadow feature-coparent">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">lock</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Tamper-Proof Messaging</h3>
              <p className="text-gray-600">
                Messages can&apos;t be edited or deleted. SHA256 hash chains prove nothing was
                changed. Court-ready exports.
              </p>
            </div>

            {/* Feature Card - Expense Tracking (co-parent specific) */}
            <div className="p-6 bg-gray-50 rounded-xl hover:shadow-lg transition-shadow feature-coparent">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">
                  payments
                </span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Expense Tracking</h3>
              <p className="text-gray-600">
                Log shared expenses with receipts. Medical, school, activities. Running balance
                shows who owes what.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-16 bg-gradient-to-br from-primary/5 to-accent/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="text-5xl mb-6">&ldquo;</div>
          <p className="text-2xl text-gray-900 mb-6 leading-relaxed font-medium">
            Finally, one app that handles our crazy schedule. Three kids, two sports each, plus
            school stuff — and I can actually see it all without losing my mind.
          </p>
          <div className="text-gray-600 font-semibold">— Michelle R., mom of 3</div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Simple, affordable plans</h2>
            <p className="text-xl text-gray-600 mb-6">Start free for 60 days. No credit card required. Cancel anytime.</p>
            <div className="inline-flex items-center space-x-3 bg-gray-100 p-1 rounded-lg">
              <button
                className="pricing-toggle-btn px-4 py-2 bg-white rounded-md font-semibold text-gray-900 shadow-sm transition-colors"
                data-mode="per-parent"
              >
                Per Parent
              </button>
              <button
                className="pricing-toggle-btn px-4 py-2 text-gray-600 hover:text-gray-900 font-semibold transition-colors"
                data-mode="full-family"
              >
                Full Family
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Essential Plan */}
            <div className="bg-white border-2 border-gray-200 rounded-xl p-8 hover:border-primary transition-colors">
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Essential</h3>
                <p className="text-gray-600 mb-4">For everyday families</p>
                <div className="flex items-baseline">
                  <span className="text-4xl font-bold text-gray-900" data-price="$5.99" data-price-full-family="$8.99">
                    $5.99
                  </span>
                  <span className="text-gray-600 ml-2">/month</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">Shared family calendar</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">School calendar sync</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">Webcal feeds for any app</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">Email reminders</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">Caregiver guest access</span>
                </li>
              </ul>
              <Link
                href="/signup?plan=essential"
                className="block w-full text-center bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-lg font-semibold transition-colors"
              >
                Start Free Trial
              </Link>
            </div>

            {/* Plus Plan */}
            <div className="bg-white border-2 border-primary rounded-xl p-8 relative shadow-xl transform scale-105">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-white px-4 py-1 rounded-full text-sm font-bold">
                MOST POPULAR
              </div>
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Plus</h3>
                <p className="text-gray-600 mb-4">For active families</p>
                <div className="flex items-baseline">
                  <span className="text-4xl font-bold text-gray-900" data-price="$8.99" data-price-full-family="$13.99">
                    $8.99
                  </span>
                  <span className="text-gray-600 ml-2">/month</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">Everything in Essential</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">AI calendar import (photo)</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">Activity &amp; sports tracking</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">SMS reminders</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">Expense tracking</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">Secure family messaging</span>
                </li>
              </ul>
              <Link
                href="/signup?plan=plus"
                className="block w-full text-center bg-primary hover:bg-primary-hover text-white py-3 rounded-lg font-semibold transition-colors"
              >
                Start Free Trial
              </Link>
            </div>

            {/* Complete Plan */}
            <div className="bg-white border-2 border-gray-200 rounded-xl p-8 hover:border-primary transition-colors">
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Complete</h3>
                <p className="text-gray-600 mb-4">For complex situations</p>
                <div className="flex items-baseline">
                  <span className="text-4xl font-bold text-gray-900" data-price="$11.99" data-price-full-family="$17.99">
                    $11.99
                  </span>
                  <span className="text-gray-600 ml-2">/month</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">Everything in Plus</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">Custody schedule templates</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">Court-ready exports</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">AI tone analysis</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">Change request workflow</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="material-symbols-outlined text-primary text-xl">check</span>
                  <span className="text-gray-700">Tamper-proof audit trail</span>
                </li>
              </ul>
              <Link
                href="/signup?plan=complete"
                className="block w-full text-center bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-lg font-semibold transition-colors"
              >
                Start Free Trial
              </Link>
            </div>
          </div>

          <p id="pricing-note" className="text-center text-gray-600 mt-8">
            Per parent pricing shown. Toggle to Full Family to include both parents. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-br from-primary to-primary-dark text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to get organized?</h2>
          <p className="text-xl mb-8 text-white/90">
            Join thousands of families who finally have one place for everything.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-white text-primary hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            Start Your Free 60-Day Trial
          </Link>
          <p className="text-sm text-white/80 mt-4">No credit card required • Setup takes 2 minutes • Cancel anytime</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-surface-darker text-gray-300 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <span className="material-symbols-outlined text-primary text-3xl">
                  calendar_month
                </span>
                <span className="font-bold text-xl text-white">KidSchedule</span>
              </div>
              <p className="text-sm text-gray-400">
                Built for co-parents, by co-parents.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">PRODUCT</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#features" className="hover:text-primary transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-primary transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <Link href="/signup" className="hover:text-primary transition-colors">
                    Start Free Trial
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">LEGAL</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="/terms" className="hover:text-primary transition-colors">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="/privacy" className="hover:text-primary transition-colors">
                    Privacy Policy
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">SUPPORT</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="/faq" className="hover:text-primary transition-colors">
                    FAQ
                  </a>
                </li>
                <li>
                  <a href="mailto:support@kidschedule.com" className="hover:text-primary transition-colors">
                    Email Us
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 pt-8 flex flex-col md:flex-row justify-between items-center text-sm text-gray-400">
            <p>© 2026 KidSchedule. All rights reserved.</p>
            <p>Made with ❤️ for co-parents everywhere</p>
          </div>
        </div>
      </footer>
    </>
  );
}
