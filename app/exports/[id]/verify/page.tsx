/**
 * Export Verification Page
 *
 * Displays verification status and sharing options for an export.
 * Shows verified/not verified status, hash match, chain validation,
 * share modal with QR code, and audit log of verification attempts.
 */

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";
import VerificationStatusPanel from "@/components/exports/verification-status-panel";
import AuditLog from "@/components/exports/audit-log";

interface VerifyPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: VerifyPageProps) {
  const { id } = await params;
  return {
    title: `Verify Export ${id} - KidSchedule`,
    description: "Verify the integrity of your export PDF",
  };
}

export default async function ExportVerifyPage({ params }: VerifyPageProps) {
  // 1. Auth check
  const user = await requireAuth();
  if (!user) {
    redirect("/login");
  }

  const { id: exportId } = await params;

  // 2. Fetch export and metadata
  const db = getDb();
  const exportJob = await db.exportJobs?.findById(exportId);

  if (!exportJob) {
    logEvent("warn", "Export not found", {
      exportId,
      userId: user.userId,
    });
    redirect("/exports");
  }

  // Verify user access (must be in same family)
  const parent = await db.parents?.findByUserId(user.userId);
  if (!parent || parent.familyId !== exportJob.familyId) {
    logEvent("warn", "Unauthorized export verification attempt", {
      exportId,
      userId: user.userId,
      familyId: exportJob.familyId,
    });
    redirect("/exports");
  }

  // 3. Fetch verification status
  const metadata = await db.exportMetadata?.findByExportId(exportId);
  let verificationStatus = {
    verified: false,
    pdfHashMatch: false,
    chainValid: false,
    verifiedAt: null as string | null,
  };

  if (metadata) {
    const attempts = await db.exportVerificationAttempts?.findByExportMetadataId(
      metadata.id
    );
    if (attempts && attempts.length > 0) {
      const lastAttempt = attempts[0];
      verificationStatus = {
        verified: lastAttempt.isValid ?? false,
        pdfHashMatch: lastAttempt.pdfHashMatch ?? false,
        chainValid: lastAttempt.integrityStatus === "valid",
        verifiedAt: lastAttempt.verifiedAt,
      };
    }
  }

  // 4. Log page view
  logEvent("info", "Export verification page viewed", {
    exportId,
    userId: user.userId,
    familyId: parent.familyId,
    isVerified: verificationStatus.verified,
  });

  return (
    <main className="min-h-screen bg-background-light dark:bg-background-dark">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Export Verification
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            View verification status and share your export with others.
          </p>
        </div>

        {/* Status Panel */}
        <div className="mb-8">
          <VerificationStatusPanel
            exportId={exportId}
            verified={verificationStatus.verified}
            pdfHashMatch={verificationStatus.pdfHashMatch}
            chainValid={verificationStatus.chainValid}
            verifiedAt={verificationStatus.verifiedAt}
          />
        </div>

        {/* Audit Log */}
        {metadata && (
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              Verification Audit Log
            </h2>
            <AuditLog exportId={exportId} metadataId={metadata.id} />
          </div>
        )}
      </div>
    </main>
  );
}
