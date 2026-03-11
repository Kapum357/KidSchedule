import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: "Terms of Service & Privacy Policy | KidSchedule",
  description:
    "Read KidSchedule's Terms of Service and Privacy Policy. Learn about our data protection practices, AI mediation policies, and your rights.",
  robots: "index, follow",
};

export default function LegalLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
