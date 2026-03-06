/**
 * Exports Page
 *
 * Main page for export management
 */

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib";
import { ExportManager } from "@/components/exports/ExportManager";

export const metadata = {
  title: "Exports - KidSchedule",
  description: "Generate and download family reports",
};

export default async function ExportsPage() {
  const user = await requireAuth();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-background-light dark:bg-background-dark">
      <ExportManager />
    </main>
  );
}
