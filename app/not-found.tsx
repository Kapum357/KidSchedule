import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "404 – Page Not Found | KidSchedule",
  description: "The page you're looking for doesn't exist.",
};

/**
 * 404 Not Found Page
 * 
 * Custom 404 page that maintains brand consistency and provides
 * helpful navigation options for users who land on missing pages.
 * 
 * This is automatically rendered by Next.js when no route matches.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        <div className="mb-8">
          <span className="material-symbols-outlined text-primary text-[120px] opacity-20">
            event_busy
          </span>
        </div>
        
        <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
        <h2 className="text-3xl font-semibold text-gray-800 mb-6">
          Oops! This page got lost
        </h2>
        <p className="text-xl text-gray-600 mb-8 leading-relaxed">
          We couldn&apos;t find the page you&apos;re looking for. It might have been moved, deleted, 
          or perhaps the link was mistyped.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
          <Link
            href="/"
            className="w-full sm:w-auto bg-primary hover:bg-primary-hover text-white px-8 py-4 rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            <span className="flex items-center justify-center gap-2">
              <span className="material-symbols-outlined">home</span>
              Go Home
            </span>
          </Link>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto bg-white hover:bg-gray-50 text-gray-900 px-8 py-4 rounded-lg font-semibold text-lg transition-all border-2 border-gray-200 hover:border-primary"
          >
            <span className="flex items-center justify-center gap-2">
              <span className="material-symbols-outlined">dashboard</span>
              Go to Dashboard
            </span>
          </Link>
        </div>

        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Looking for something specific?
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            <Link
              href="/blog"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">
                article
              </span>
              <div>
                <div className="font-semibold text-gray-900">Blog</div>
                <div className="text-sm text-gray-600">Co-parenting tips & guides</div>
              </div>
            </Link>
            <Link
              href="/calendar"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">
                calendar_month
              </span>
              <div>
                <div className="font-semibold text-gray-900">Calendar</div>
                <div className="text-sm text-gray-600">Shared schedules</div>
              </div>
            </Link>
            <Link
              href="/school"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">
                school
              </span>
              <div>
                <div className="font-semibold text-gray-900">School Portal</div>
                <div className="text-sm text-gray-600">PTA & events</div>
              </div>
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">
                login
              </span>
              <div>
                <div className="font-semibold text-gray-900">Log In</div>
                <div className="text-sm text-gray-600">Access your account</div>
              </div>
            </Link>
          </div>
        </div>

        <p className="text-sm text-gray-500 mt-8">
          Need help? <Link href="/contact" className="text-primary hover:underline">Contact support</Link>
        </p>
      </div>
    </div>
  );
}
