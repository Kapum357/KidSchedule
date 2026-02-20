import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
    <html lang="en">
      <head>
        {/* Material Symbols – variable font used by the dashboard UI */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=optional"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;500;600;700&display=optional"
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}

/* eslint-enable @next/next/no-page-custom-font */
