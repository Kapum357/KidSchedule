"use server";

/**
 * Export Engine
 *
 * Handles generation of export files based on export type.
 * Supports: schedule PDFs, invoices, message CSVs, moments archives.
 */

import type { ExportJobRecord, ExportResult, ExportType } from "@/types";
import { getDb } from "@/lib/persistence";
import { generateCustodyCompliancePdf } from "@/lib/pdf-generator";
import type { HashedMessage, PdfGeneratorConfig } from "@/lib/pdf-generator";
import { CustodyComplianceEngine } from "@/lib/custody-compliance-engine";

/**
 * Generate an export file based on job type
 *
 * @param job - The export job record
 * @returns Export result with file URL and metadata
 * @throws Error if generation fails
 */
export async function generateExport(job: ExportJobRecord): Promise<ExportResult> {
  const generator = selectGenerator(job.type);
  return generator(job);
}

/**
 * Select the appropriate export generator based on type
 */
function selectGenerator(type: ExportType) {
  switch (type) {
    case "schedule-pdf":
      return generateSchedulePdf;
    case "invoices-pdf":
      return generateInvoicesPdf;
    case "messages-csv":
      return generateMessagesCsv;
    case "moments-archive":
      return generateMomentsArchive;
    case "custody-compliance-pdf":
      return generateCustodyCompliancePdfExport;
    case "message-transcript-pdf":
      return generateMessageTranscriptPdfExport;
    default:
      throw new Error(`Unknown export type: ${type}`);
  }
}

/**
 * Generate a PDF of the custody schedule
 */
async function generateSchedulePdf(job: ExportJobRecord): Promise<ExportResult> {
  const db = getDb();

  // Fetch family and schedule data
  const family = await db.families.findById(job.familyId);
  if (!family) {
    throw new Error(`Family not found: ${job.familyId}`);
  }

  // TODO: Implement PDF generation using existing PDF generator
  // For MVP, return a placeholder
  console.log("[ExportEngine] Schedule PDF export requested for family:", job.familyId);

  return {
    resultUrl: `https://storage.example.com/exports/${job.id}/schedule.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 1024 * 50, // 50KB placeholder
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a PDF of invoices/expenses
 */
async function generateInvoicesPdf(job: ExportJobRecord): Promise<ExportResult> {
  const db = getDb();

  // Fetch expenses for family within date range (if specified)
  const params = job.params as { startDate?: string; endDate?: string };
  const expenses = await db.expenses.findByFamilyId(job.familyId);

  // Filter by date range if provided
  const filtered = params.startDate
    ? expenses.filter(
        (e) => new Date(e.createdAt) >= new Date(params.startDate!)
      )
    : expenses;

  // TODO: Implement PDF generation for expenses/invoices
  console.log("[ExportEngine] Invoices PDF export requested:", filtered.length, "expenses");

  return {
    resultUrl: `https://storage.example.com/exports/${job.id}/invoices.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 1024 * 100, // 100KB placeholder
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a CSV of messages
 */
async function generateMessagesCsv(job: ExportJobRecord): Promise<ExportResult> {
  const db = getDb();

  // Fetch all messages for family
  const threads = await db.messageThreads.findByFamilyId(job.familyId);
  const messages = threads.length > 0
    ? (await Promise.all(
        threads.map((t) => db.messages.findByThreadId(t.id))
      )).flat()
    : [];

  // TODO: Implement CSV generation from messages
  console.log("[ExportEngine] Messages CSV export requested:", messages.length, "messages");

  // Generate simple CSV header
  const csvContent = [
    "Date,Sender,Message",
    ...messages.map(
      (m) =>
        `"${m.sentAt}","Parent","${m.body.replace(/"/g, '""')}"`
    ),
  ].join("\n");

  const csvBuffer = Buffer.from(csvContent, "utf-8");

  return {
    resultUrl: `https://storage.example.com/exports/${job.id}/messages.csv`,
    mimeType: "text/csv",
    sizeBytes: csvBuffer.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate an archive (ZIP) of moments/photos
 */
async function generateMomentsArchive(job: ExportJobRecord): Promise<ExportResult> {
  const db = getDb();

  // Fetch all moments for family
  const moments = await db.moments.findByFamilyId(job.familyId);

  // TODO: Implement archive generation (download photos, create ZIP)
  console.log("[ExportEngine] Moments archive export requested:", moments.length, "moments");

  return {
    resultUrl: `https://storage.example.com/exports/${job.id}/moments.zip`,
    mimeType: "application/zip",
    sizeBytes: 1024 * 500, // 500KB placeholder
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a court-ready custody compliance PDF with hash chain verification
 */
async function generateCustodyCompliancePdfExport(job: ExportJobRecord): Promise<ExportResult> {
  const db = getDb();
  const params = job.params as { startDate?: string; endDate?: string };

  if (!params.startDate || !params.endDate) {
    throw new Error("Custody compliance PDF export requires startDate and endDate parameters");
  }

  // Generate compliance report
  const engine = new CustodyComplianceEngine();
  const report = await engine.generateComplianceReport(
    job.familyId,
    params.startDate,
    params.endDate
  );

  // Fetch message hash chain data for the period
  const threads = await db.messageThreads.findByFamilyId(job.familyId);
  const allMessages = threads.length > 0
    ? (await Promise.all(threads.map((t) => db.messages.findByThreadId(t.id)))).flat()
    : [];

  // Filter messages within the custody period and convert to HashedMessage format
  const hashedMessages: HashedMessage[] = allMessages
    .filter((m) => {
      const msgTime = new Date(m.sentAt).getTime();
      const startTime = new Date(params.startDate!).getTime();
      const endTime = new Date(params.endDate!).getTime();
      return msgTime >= startTime && msgTime <= endTime;
    })
    .map((m, idx) => ({
      index: idx,
      messageHash: m.messageHash,
      previousHash: m.previousHash || "",
      senderId: m.senderId,
      senderName: report.parents.find((p) => p.id === m.senderId)?.name || "Unknown",
      body: m.body,
      sentAt: m.sentAt,
    }));

  // Generate PDF with embedded hash chain
  const config: PdfGeneratorConfig = {
    title: "Custody Compliance Report",
    author: "KidSchedule",
    createdAt: new Date().toISOString(),
    familyId: job.familyId,
    documentType: "custody-compliance",
  };

  const pdfResult = await generateCustodyCompliancePdf(report, hashedMessages, config);

  // Store export metadata and message hashes
  const exportMetadata = await db.exportMetadata.create({
    exportId: job.id,
    familyId: job.familyId,
    reportType: "custody-compliance",
    includedMessageIds: hashedMessages.map((m, idx) =>
      allMessages[idx]?.id || ""
    ).filter(Boolean),
    custodyPeriodStart: params.startDate,
    custodyPeriodEnd: params.endDate,
    pdfHash: pdfResult.hash,
    pdfSizeBytes: pdfResult.sizeBytes,
  });

  // Store individual message hashes for verification
  const messageHashes = await db.exportMessageHashes.createBatch(
    hashedMessages.map((m, idx) => ({
      exportMetadataId: exportMetadata.id,
      messageId: allMessages[idx]?.id || "",
      chainIndex: m.index,
      messageHash: m.messageHash,
      previousHash: m.previousHash,
      sentAt: m.sentAt,
      senderId: m.senderId,
      messagePreview: m.body.substring(0, 100),
    }))
  );

  console.log(
    "[ExportEngine] Custody compliance PDF generated:",
    pdfResult.sizeBytes,
    "bytes,",
    messageHashes.length,
    "messages verified"
  );

  return {
    resultUrl: `https://storage.example.com/exports/${job.id}/custody-compliance.pdf`,
    mimeType: "application/pdf",
    sizeBytes: pdfResult.sizeBytes,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a message transcript PDF with hash chain verification
 */
async function generateMessageTranscriptPdfExport(job: ExportJobRecord): Promise<ExportResult> {
  const db = getDb();
  const params = job.params as { startDate?: string; endDate?: string };

  if (!params.startDate || !params.endDate) {
    throw new Error("Message transcript PDF export requires startDate and endDate parameters");
  }

  // Fetch messages for the period
  const threads = await db.messageThreads.findByFamilyId(job.familyId);
  const allMessages = threads.length > 0
    ? (await Promise.all(threads.map((t) => db.messages.findByThreadId(t.id)))).flat()
    : [];

  // Filter by date range
  const messages = allMessages.filter((m) => {
    const msgTime = new Date(m.sentAt).getTime();
    const startTime = new Date(params.startDate!).getTime();
    const endTime = new Date(params.endDate!).getTime();
    return msgTime >= startTime && msgTime <= endTime;
  });

  // Get parent names for the family
  const parents = await db.parents.findByFamilyId(job.familyId);
  const parentMap = new Map(parents.map((p) => [p.id, p.name]));

  // Convert messages to HashedMessage format
  const hashedMessages: HashedMessage[] = messages.map((m, idx) => ({
    index: idx,
    messageHash: m.messageHash,
    previousHash: m.previousHash || "",
    senderId: m.senderId,
    senderName: parentMap.get(m.senderId) || "Unknown",
    body: m.body,
    sentAt: m.sentAt,
  }));

  // Generate a mock compliance report for the PDF template
  const mockReport = {
    familyId: job.familyId,
    reportPeriod: {
      startDate: params.startDate,
      endDate: params.endDate,
    },
    parents: parents.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      avatarUrl: p.avatarUrl,
    })),
    summary: {
      totalScheduledTime: 0,
      totalActualTime: 0,
      compliancePercentage: 100,
      totalDeviations: 0,
      totalOverrides: 0,
    },
    periods: [],
    overrides: [],
    changeRequests: [],
    generatedAt: new Date().toISOString(),
  };

  // Generate PDF
  const config: PdfGeneratorConfig = {
    title: "Message Transcript",
    author: "KidSchedule",
    createdAt: new Date().toISOString(),
    familyId: job.familyId,
    documentType: "message-transcript",
  };

  const pdfResult = await generateCustodyCompliancePdf(mockReport, hashedMessages, config);

  // Store export metadata
  const exportMetadata = await db.exportMetadata.create({
    exportId: job.id,
    familyId: job.familyId,
    reportType: "message-transcript",
    includedMessageIds: messages.map((m) => m.id),
    custodyPeriodStart: params.startDate,
    custodyPeriodEnd: params.endDate,
    pdfHash: pdfResult.hash,
    pdfSizeBytes: pdfResult.sizeBytes,
  });

  // Store message hashes
  await db.exportMessageHashes.createBatch(
    hashedMessages.map((m, idx) => ({
      exportMetadataId: exportMetadata.id,
      messageId: messages[idx].id,
      chainIndex: m.index,
      messageHash: m.messageHash,
      previousHash: m.previousHash,
      sentAt: m.sentAt,
      senderId: m.senderId,
      messagePreview: m.body.substring(0, 100),
    }))
  );

  console.log(
    "[ExportEngine] Message transcript PDF generated:",
    pdfResult.sizeBytes,
    "bytes,",
    hashedMessages.length,
    "messages"
  );

  return {
    resultUrl: `https://storage.example.com/exports/${job.id}/message-transcript.pdf`,
    mimeType: "application/pdf",
    sizeBytes: pdfResult.sizeBytes,
    generatedAt: new Date().toISOString(),
  };
}
