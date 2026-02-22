"use client";

import { useEffect } from "react";
import Link from "next/link";
import { trackError } from "@/lib/observability/error-tracking";

interface ErrorPageProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

/**
 * Error Boundary Page
 *
 * This component is automatically rendered by Next.js when an
 * unhandled error occurs during rendering. It provides a user-friendly
 * error message and recovery options.
 *
 * The error boundary catches errors in:
 * - Server Components
 * - Client Components
 * - Route handlers
 *
 * Note: This must be a Client Component to use hooks.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log once per render; trackError is idempotent and production-gated
    const pathname = globalThis.window ? globalThis.window.location.pathname : undefined;
    void trackError(error.message, error.digest, { pathname });
  }, [error]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        <div className="mb-8">
          <span className="material-symbols-outlined text-red-500 text-[120px] opacity-20">
            error
          </span>
        </div>
        
        <h1 className="text-6xl font-bold text-gray-900 mb-4">Oops!</h1>
        <h2 className="text-3xl font-semibold text-gray-800 mb-6">
          Something went wrong
        </h2>
        <p className="text-xl text-gray-600 mb-8 leading-relaxed">
          We encountered an unexpected error. Don&apos;t worry — your data is safe.
          Try refreshing the page or going back to the previous screen.
        </p>
        {error.digest && (
          <p className="text-sm text-gray-500 mb-8">
            Support Code: <code className="font-mono text-gray-700">{error.digest.substring(0, 8)}</code>
          </p>
        )}

        {process.env.NODE_ENV === "development" && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8 text-left">
            <h3 className="text-sm font-bold text-red-900 mb-2">
              Development Error Details:
            </h3>
            <pre className="text-xs text-red-800 overflow-x-auto whitespace-pre-wrap break-words">
              {error.message}
            </pre>
            {error.digest && (
              <p className="text-xs text-red-700 mt-2">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
          <button
            onClick={reset}
            className="w-full sm:w-auto bg-primary hover:bg-primary-hover text-white px-8 py-4 rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            <span className="flex items-center justify-center gap-2">
              <span className="material-symbols-outlined">refresh</span>
              <span>Try Again</span>
            </span>
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto bg-white hover:bg-gray-50 text-gray-900 px-8 py-4 rounded-lg font-semibold text-lg transition-all border-2 border-gray-200 hover:border-primary"
          >
            <span className="flex items-center justify-center gap-2">
              <span className="material-symbols-outlined">home</span>
              <span>Go Home</span>
            </span>
          </Link>
        </div>

        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            What you can do:
          </h3>
          <ul className="text-left space-y-3 text-gray-700">
            <li className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary text-xl">check_circle</span>
              <span>Refresh the page and try your action again</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary text-xl">check_circle</span>
              <span>Clear your browser cache and cookies</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary text-xl">check_circle</span>
              <span>Try using a different browser or device</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary text-xl">check_circle</span>
              <span>Contact support if the problem persists</span>
            </li>
          </ul>
        </div>

        <p className="text-sm text-gray-500 mt-8">
          Still having trouble? <a href="/contact" className="text-primary hover:underline">Contact support</a>
        </p>
      </div>
    </div>
  );
}
