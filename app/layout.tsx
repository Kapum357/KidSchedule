import type { Metadata } from "next";
import { Geist, Geist_Mono, Nunito_Sans, Inter } from "next/font/google";
import { Toaster } from "sonner";
import { ToastProvider } from "@/components/toast-notification";
import { FontLoader } from "@/components/font-loader";
import { CriticalCSSOptimizer } from "@/components/critical-css-optimizer";
import "./globals.css";

// Nonce-based CSP requires dynamic rendering so each request can receive
// a fresh nonce and Next.js can attach it to internal inline scripts.
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "optional",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "optional",
});

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KidSchedule – Co-Parenting Calendar & Custody Tracker",
  description:
    "The trusted co-parenting platform for shared custody scheduling, expense splitting, and conflict-free communication.",
};

/*
  The app intentionally inlines Google font links in the app layout to
  ensure the fonts load early for all pages. Disable the Next.js ESLint
  rule that expects custom fonts in `pages/_document`.
*/
/* eslint-disable @next/next/no-page-custom-font */

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect to Google Fonts for Material Symbols */}
        {/* Establishes early connection to critical endpoints, reducing DNS lookup + TLS time */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* DNS prefetch as fallback for browsers without preconnect support */}
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />

        {/* Material Symbols – variable font used by the dashboard UI */}
        {/* display=optional prevents render-blocking; font loads after first paint */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=optional"
          fetchPriority="low"
        />
        
        {/* Theme color for browser chrome */}
        <meta name="theme-color" content="#6BCABD" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0F172A" media="(prefers-color-scheme: dark)" />
        
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${nunitoSans.variable} ${inter.variable} antialiased`}>
        {/* Skip link for keyboard users */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {/* Optimize CSS: converts render-blocking to non-blocking */}
        <CriticalCSSOptimizer />
        <FontLoader />
        <ToastProvider>
          {children}
        </ToastProvider>
        <Toaster position="bottom-right" theme="system" richColors closeButton />
      </body>
    </html>
  );
}

/* eslint-enable @next/next/no-page-custom-font */
