import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: "KidSchedule - Family Calendar & Co-Parenting App",
  description:
    "Coordinate schedules, expenses, and communication in one secure place. Built for modern families who need to handle the chaos so they can enjoy the moments.",
  keywords: [
    "family calendar",
    "co-parenting",
    "schedule management",
    "family organization",
  ],
  authors: [{ name: "KidSchedule Inc." }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://kidschedule.com",
    siteName: "KidSchedule",
    title: "KidSchedule - Family Calendar & Co-Parenting App",
    description:
      "Coordinate schedules, expenses, and communication in one secure place.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className={`${inter.variable} antialiased font-sans`}>
        {children}
      </body>
    </html>
  );
}
