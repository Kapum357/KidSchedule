/**
 * KidSchedule – Legal Documentation Page (Combined Terms & Privacy)
 *
 * Server Component rendering comprehensive legal documentation:
 * - Terms of Service
 * - Privacy Policy
 * - Sticky table of contents navigation
 * - Print/PDF optimization
 * - Accessibility features (WCAG 2.1 AA compliant)
 *
 * Architecture:
 * - Content managed by LegalEngine (lib/legal-engine.ts)
 * - Versioned with effective dates
 * - Plain-English summaries for accessibility
 * - HTML content with Tailwind styling
 */

import { LegalEngine } from "@/lib/legal-engine";
import type { LegalSection } from "@/types";
import Link from "next/link";

// This page can be statically generated since legal content changes infrequently
export const dynamic = "force-static";
export const revalidate = 86400; // Revalidate once per day

// ─── Metadata ──────────────────────────────────────────────────────────────────

export const metadata = {
  title: "Terms of Service & Privacy Policy | KidSchedule",
  description:
    "Read KidSchedule's Terms of Service and Privacy Policy. Learn about our data protection practices, AI mediation policies, and your rights.",
  robots: "index, follow",
};

// ─── Section Renderer ──────────────────────────────────────────────────────────

function LegalSectionComponent({ section }: Readonly<{ section: LegalSection }>) {
  return (
    <section className="mb-16 scroll-mt-24" id={section.id}>
      <div className="flex items-start gap-4 mb-6">
        <div className="bg-primary/20 text-primary p-2 rounded-lg hidden sm:block shrink-0">
          <span className="material-symbols-outlined text-2xl">{section.icon}</span>
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            {section.title}
          </h2>

          {/* Plain English Summary */}
          <div className="bg-teal-50 dark:bg-teal-900/10 border-l-4 border-primary p-4 mb-6 rounded-r-lg">
            <h4 className="text-sm font-bold text-primary mb-1 uppercase tracking-wide flex items-center gap-2">
              <span className="material-symbols-outlined text-base">info</span>
              Plain English Summary
            </h4>
            <p className="text-slate-700 dark:text-slate-300 text-sm">{section.summary}</p>
          </div>

          {/* Full Content (HTML) */}
          <div
            className="prose dark:prose-invert max-w-none text-slate-600 dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: section.content }}
          />
        </div>
      </div>
    </section>
  );
}

// ─── Page Component ────────────────────────────────────────────────────────────

export default function LegalPage() {
  const { terms, privacy, effectiveDate } = LegalEngine.getCombinedLegalDocuments();

  // Combine sections for table of contents (with document type markers)
  const allSections: Array<LegalSection & { docType: "terms" | "privacy" }> = [
    ...terms.sections.map((s) => ({ ...s, docType: "terms" as const })),
    ...privacy.sections.map((s) => ({ ...s, docType: "privacy" as const })),
  ];

  return (
    <div className="bg-background-light dark:bg-background-dark font-display antialiased text-text-main h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-surface-light dark:bg-surface-dark border-b border-slate-200 dark:border-slate-800 h-16 shrink-0 flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 flex items-center justify-center rounded-lg size-9 text-primary">
            <span className="material-symbols-outlined text-2xl">family_restroom</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            KidSchedule
          </span>
          <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs px-2 py-0.5 rounded ml-2 font-medium">
            LEGAL
          </span>
        </div>

        <div className="flex items-center gap-4">
          <button
            className="hidden sm:flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary transition-colors print:hidden"
            onClick={() => window.print()}
            aria-label="Print or save as PDF"
          >
            <span className="material-symbols-outlined text-xl">print</span>
            Print / PDF
          </button>

          <Link
            className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors print:hidden"
            href="/"
          >
            Back to App
          </Link>

          <Link
            className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors print:hidden"
            href="/login"
          >
            Log In
          </Link>
        </div>
      </header>

      <div className="flex flex-1 h-full overflow-hidden">
        {/* Sidebar – Table of Contents */}
        <aside className="w-72 bg-surface-light dark:bg-surface-dark border-r border-slate-200 dark:border-slate-800 hidden md:flex flex-col h-full overflow-y-auto custom-scrollbar shrink-0 print:hidden">
          <div className="p-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
              Table of Contents
            </h3>

            <nav className="space-y-1">
              {allSections.map((section) => (
                <a
                  key={`${section.docType}-${section.id}`}
                  className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  href={`#${section.id}`}
                >
                  <span className="material-symbols-outlined text-lg">{section.icon}</span>
                  {section.title}
                </a>
              ))}
            </nav>

            {/* Support Section */}
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                Support
              </h3>
              <a
                className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-primary transition-colors mb-3"
                href="mailto:legal@kidschedule.com"
              >
                <span className="material-symbols-outlined text-lg">mail</span>
                legal@kidschedule.com
              </a>
              <a
                className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-primary transition-colors"
                href="/help"
              >
                <span className="material-symbols-outlined text-lg">help</span>
                Help Center
              </a>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main
          className="flex-1 overflow-y-auto scroll-smooth relative bg-background-light dark:bg-background-dark"
          id="main-content"
        >
          <div className="max-w-4xl mx-auto px-6 py-12 md:px-12 md:py-16">
            {/* Page Header */}
            <div className="mb-12 border-b border-slate-200 dark:border-slate-700 pb-8">
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                <span>Terms of Service</span>
                <span className="text-slate-300">•</span>
                <span>Privacy Policy</span>
                <span className="text-slate-300">•</span>
                <span className="text-primary font-medium">
                  Effective {new Date(effectiveDate).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>

              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-6">
                Terms of Service &amp; Privacy Policy
              </h1>

              <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                Welcome to KidSchedule. These terms govern your use of our co-parenting platform,
                ensuring a safe, secure, and respectful environment for all families.
              </p>

              <div className="mt-6 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-lg inline-flex border border-blue-100 dark:border-blue-800/30">
                <span className="material-symbols-outlined text-primary text-lg">update</span>
                Last updated: {new Date(effectiveDate).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
            </div>

            {/* Terms of Service Sections */}
            <div className="mb-20">
              <div className="flex items-center gap-3 mb-8 pb-4 border-b border-slate-200 dark:border-slate-700">
                <div className="bg-primary/10 flex items-center justify-center rounded-lg size-10 text-primary">
                  <span className="material-symbols-outlined text-2xl">gavel</span>
                </div>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
                  Terms of Service
                </h2>
              </div>
              {terms.sections.map((section) => (
                <LegalSectionComponent key={section.id} section={section} />
              ))}
            </div>

            {/* Privacy Policy Sections */}
            <div className="mb-20">
              <div className="flex items-center gap-3 mb-8 pb-4 border-b border-slate-200 dark:border-slate-700">
                <div className="bg-primary/10 flex items-center justify-center rounded-lg size-10 text-primary">
                  <span className="material-symbols-outlined text-2xl">shield</span>
                </div>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
                  Privacy Policy
                </h2>
              </div>
              {privacy.sections.map((section) => (
                <LegalSectionComponent key={section.id} section={section} />
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 dark:border-slate-800 pt-8 mt-12 pb-24 print:pb-8">
              <p className="text-slate-500 text-sm text-center">
                © {new Date().getFullYear()} KidSchedule Inc. All rights reserved.
                <br />
                123 Harmony Way, Suite 400, San Francisco, CA 94105
              </p>
            </div>
          </div>
        </main>

        {/* Back to Top Button */}
        <a
          aria-label="Back to top"
          className="fixed bottom-8 right-8 bg-primary hover:bg-primary-hover text-white p-3 rounded-full shadow-lg transition-transform hover:-translate-y-1 z-50 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary print:hidden"
          href="#main-content"
        >
          <span className="material-symbols-outlined">arrow_upward</span>
        </a>
      </div>
    </div>
  );
}
