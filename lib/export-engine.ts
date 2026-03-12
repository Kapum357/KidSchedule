/**
 * Export Engine
 *
 * Handles generation of export files based on export type.
 * Supports: schedule PDFs, invoices, message CSVs, moments archives.
 */

import PDFDocument from "pdfkit";
import type { ExportJobRecord, ExportResult, ExportType, ExpenseCategory } from "@/lib";
import { getDb } from "@/lib/persistence";
import type { DbMoment } from "@/lib/persistence/types";
import { generateCustodyCompliancePdf } from "@/lib/pdf-generator";
import type { HashedMessage, PdfGeneratorConfig } from "@/lib/pdf-generator";
import { CustodyComplianceEngine } from "@/lib/custody-compliance-engine";
import { generateCommunicationReport } from "@/lib/communication-report";
import { formatCurrency } from "@/lib/expense-engine";
import { logEvent } from "@/lib/observability/logger";
import type { Readable } from "node:stream";

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
    case "communication-report":
      return generateCommunicationReportExport;
    default:
      throw new Error(`Unknown export type: ${type}`);
  }
}

/**
 * Generate a PDF of the custody schedule
 */
async function generateSchedulePdf(job: ExportJobRecord): Promise<ExportResult> {
  const params = job.params as SchedulePdfParams;
  const { startDate, endDate } = resolveScheduleDateRange(params);

  const engine = new CustodyComplianceEngine();
  const report = await engine.generateComplianceReport(
    job.familyId,
    startDate,
    endDate
  );

  const config: PdfGeneratorConfig = {
    title: "Family Schedule Overview",
    author: "KidSchedule",
    createdAt: new Date().toISOString(),
    familyId: job.familyId,
    documentType: "schedule",
  };

  const pdfResult = await generateCustodyCompliancePdf(report, [], config);

  logEvent("info", "Schedule PDF generated", {
    familyId: job.familyId,
    range: `${startDate}:${endDate}`,
    sizeBytes: pdfResult.sizeBytes,
  });

  return {
    resultUrl: `https://storage.example.com/exports/${job.id}/schedule.pdf`,
    mimeType: "application/pdf",
    sizeBytes: pdfResult.sizeBytes,
    generatedAt: new Date().toISOString(),
  };
}

type SchedulePdfParams = {
  startDate?: string;
  endDate?: string;
};

function resolveScheduleDateRange(params: SchedulePdfParams) {
  const parsedStart = parseIsoDate(params.startDate);
  const parsedEnd = parseIsoDate(params.endDate);
  const now = new Date();
  let start: Date;

  if (parsedStart) {
    start = normalizeToDate(parsedStart);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const defaultEnd = normalizeToDate(
    new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
  );

  let endCandidate = defaultEnd;
  if (parsedEnd) {
    endCandidate = normalizeToDate(parsedEnd);
  }

  let end = endCandidate;
  if (endCandidate < start) {
    end = defaultEnd;
  }

  return {
    startDate: formatIsoDate(start),
    endDate: formatIsoDate(end),
  };
}

function parseIsoDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function normalizeToDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Generate a PDF of invoices/expenses
 */
async function generateInvoicesPdf(job: ExportJobRecord): Promise<ExportResult> {
  const db = getDb();
  const params = job.params as InvoicePdfParams;
  const dateRange = resolveInvoiceDateRange(params);

  const expenses = dateRange
    ? await db.expenses.findByFamilyIdAndDateRange(
        job.familyId,
        dateRange.startDate,
        dateRange.endDate
      )
    : await db.expenses.findByFamilyId(job.familyId);

  const parents = await db.parents.findByFamilyId(job.familyId);
  const parentMap = new Map(parents.map((parent) => [parent.id, parent.name]));

  const sortedExpenses = [...expenses].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const categoryCounts: Record<ExpenseCategory, number> = {
    medical: 0,
    education: 0,
    clothing: 0,
    activity: 0,
    childcare: 0,
    other: 0,
  };

  const currencyTotals: Record<string, number> = {};

  sortedExpenses.forEach((expense) => {
    categoryCounts[expense.category] += 1;
    currencyTotals[expense.currency] =
      (currencyTotals[expense.currency] ?? 0) + expense.totalAmount;
  });

  const rangeLabel = dateRange
    ? `${dateRange.startDate} → ${dateRange.endDate}`
    : "All time";

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(20).text("Invoices & Expenses Report", {
      align: "center",
    });

    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(10).text(`Family: ${job.familyId}`, {
      align: "center",
    });
    doc.text(`Generated: ${new Date().toLocaleString()}`, {
      align: "center",
    });

    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(11).text("Report Details");
    doc.font("Helvetica").fontSize(10).text(`Period: ${rangeLabel}`);
    doc.text(`Expenses: ${sortedExpenses.length}`);
    if (sortedExpenses.length > 0) {
      doc.text(`Currencies: ${Object.keys(currencyTotals).join(", ")}`);
    }

    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(11).text("Totals by Currency");
    if (Object.keys(currencyTotals).length === 0) {
      doc.font("Helvetica").fontSize(10).text("No expenses recorded for this period.");
    } else {
      Object.entries(currencyTotals)
        .sort((a, b) => b[1] - a[1])
        .forEach(([currency, total]) => {
          doc.font("Helvetica").fontSize(10).text(
            `${currency}: ${formatCurrency(total, currency)}`
          );
        });
    }

    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(11).text("Category Counts");
    const categoryEntries = Object.entries(categoryCounts).filter(([, count]) => count > 0);
    if (categoryEntries.length === 0) {
      doc.font("Helvetica").fontSize(10).text("No categorized expenses to display.");
    } else {
      categoryEntries.forEach(([category, count]) => {
        doc.font("Helvetica").fontSize(10).text(
          `${CATEGORY_LABELS[category as ExpenseCategory]}: ${count} ${
            count === 1 ? "expense" : "expenses"
          }`
        );
      });
    }

    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(11).text("Detailed Expenses");
    doc.moveDown(0.5);

    if (sortedExpenses.length === 0) {
      doc.font("Helvetica").fontSize(10).text("No expenses found for the selected period.", {
        align: "center",
      });
    } else {
      let rowY = renderTableHeader(doc, doc.y + 10);
      sortedExpenses.forEach((expense) => {
        rowY = ensureRowSpace(doc, rowY, TABLE_ROW_HEIGHT);

        const paidByName = parentMap.get(expense.paidBy) ?? "Unknown";

        doc.font("Helvetica").fontSize(9).fillColor("#1f2937");
        doc.text(formatExpenseDate(expense.date), TABLE_COLUMNS[0].x, rowY, {
          width: TABLE_COLUMNS[0].width,
        });
        doc.text(expense.title, TABLE_COLUMNS[1].x, rowY, {
          width: TABLE_COLUMNS[1].width,
        });
        doc.text(CATEGORY_LABELS[expense.category], TABLE_COLUMNS[2].x, rowY, {
          width: TABLE_COLUMNS[2].width,
        });
        doc.text(formatCurrency(expense.totalAmount, expense.currency), TABLE_COLUMNS[3].x, rowY, {
          width: TABLE_COLUMNS[3].width,
          align: "right",
        });
        doc.text(paidByName, TABLE_COLUMNS[4].x, rowY, {
          width: TABLE_COLUMNS[4].width,
        });
        doc.text(formatPaymentStatus(expense.paymentStatus), TABLE_COLUMNS[5].x, rowY, {
          width: TABLE_COLUMNS[5].width,
        });

        rowY += TABLE_ROW_HEIGHT;

        if (expense.description) {
          rowY = ensureRowSpace(doc, rowY, DESCRIPTION_ROW_HEIGHT);
          doc.font("Helvetica-Oblique").fontSize(8).fillColor("#374151");
          doc.text(
            expense.description,
            TABLE_COLUMNS[1].x,
            rowY,
            {
              width:
                TABLE_COLUMNS[1].width +
                TABLE_COLUMNS[2].width +
                TABLE_COLUMNS[3].width,
            }
          );
          rowY += DESCRIPTION_ROW_HEIGHT;
          doc.fillColor("#000000");
        }
      });
    }

    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(8).text(
      "Report generated by KidSchedule. Keep this document for your records.",
      {
        align: "center",
      }
    );

    doc.end();
  });

  logEvent("info", "Invoices PDF generated", {
    familyId: job.familyId,
    expenseCount: sortedExpenses.length,
    sizeBytes: buffer.length,
  });

  return {
    resultUrl: `https://storage.example.com/exports/${job.id}/invoices.pdf`,
    mimeType: "application/pdf",
    sizeBytes: buffer.length,
    generatedAt: new Date().toISOString(),
  };
}

type InvoicePdfParams = {
  startDate?: string;
  endDate?: string;
};

type InvoiceDateRange = {
  startDate: string;
  endDate: string;
};

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  medical: "Medical & Health",
  education: "Education & Tuition",
  clothing: "Clothing & Necessities",
  activity: "Activities",
  childcare: "Childcare",
  other: "Other",
};

type TableColumn = {
  title: string;
  x: number;
  width: number;
  align?: "left" | "center" | "right";
};

const TABLE_COLUMNS: TableColumn[] = [
  { title: "Date", x: 50, width: 70 },
  { title: "Title", x: 125, width: 150 },
  { title: "Category", x: 285, width: 80 },
  { title: "Amount", x: 370, width: 70, align: "right" },
  { title: "Paid By", x: 450, width: 90 },
  { title: "Status", x: 545, width: 60 },
];

const TABLE_ROW_HEIGHT = 16;
const DESCRIPTION_ROW_HEIGHT = 12;
const HEADER_LINE_OFFSET = 14;
const HEADER_ROW_SPACING = 20;
const HEADER_LEFT_EDGE = 48;
const HEADER_RIGHT_PADDING = 2;
const PAGE_BOTTOM_BUFFER = 40;
const MESSAGES_CSV_PREVIEW_LENGTH = 150;
const MOMENTS_ARCHIVE_IMAGE_FETCH_TIMEOUT = 30000;

type PdfKitDocument = InstanceType<typeof PDFDocument>;

type MomentsArchiveParams = {
  startDate?: string;
  endDate?: string;
};

function resolveInvoiceDateRange(params: InvoicePdfParams): InvoiceDateRange | null {
  if (!params.startDate && !params.endDate) {
    return null;
  }

  const rawStart = params.startDate ?? params.endDate;
  const rawEnd = params.endDate ?? params.startDate;

  if (!rawStart || !rawEnd) {
    return null;
  }

  const startTime = new Date(rawStart).getTime();
  const endTime = new Date(rawEnd).getTime();

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return null;
  }

  if (startTime <= endTime) {
    return { startDate: rawStart, endDate: rawEnd };
  }

  return { startDate: rawEnd, endDate: rawStart };
}

function renderTableHeader(doc: PdfKitDocument, y: number): number {
  doc.save();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827");
  TABLE_COLUMNS.forEach((column) => {
    doc.text(column.title, column.x, y, {
      width: column.width,
      align: column.align ?? "left",
    });
  });

  const lineY = y + HEADER_LINE_OFFSET;
  doc.strokeColor("#d1d5db").lineWidth(0.5).moveTo(HEADER_LEFT_EDGE, lineY).lineTo(
    doc.page.width - doc.page.margins.right + HEADER_RIGHT_PADDING,
    lineY,
  ).stroke();
  doc.restore();

  return y + HEADER_ROW_SPACING;
}

function ensureRowSpace(doc: PdfKitDocument, currentY: number, requiredHeight: number): number {
  const bottomLimit = doc.page.height - doc.page.margins.bottom - PAGE_BOTTOM_BUFFER;
  if (currentY + requiredHeight > bottomLimit) {
    doc.addPage();
    return renderTableHeader(doc, doc.y + 10);
  }

  return currentY;
}

function formatExpenseDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPaymentStatus(status: string): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "unpaid":
      return "Unpaid";
    case "disputed":
      return "Disputed";
    default:
      return status;
  }
}

function escapeAndQuoteCsv(fields: string[]): string {
  return fields
    .map((field) => {
      const escaped = field.replace(/"/g, '""');
      return `"${escaped}"`;
    })
    .join(",");
}

function filterMomentsByDateRange<T extends { createdAt: string }>(
  moments: T[],
  params: MomentsArchiveParams,
): T[] {
  let startTime: number | null = null;
  let endTime: number | null = null;

  if (params.startDate) {
    startTime = new Date(params.startDate).getTime();
  }

  if (params.endDate) {
    endTime = new Date(params.endDate).getTime();
  }

  return moments.filter((moment) => {
    const momentTime = new Date(moment.createdAt).getTime();

    if (startTime && momentTime < startTime) {
      return false;
    }

    if (endTime && momentTime > endTime) {
      return false;
    }

    return true;
  });
}

async function buildMomentsArchive(
  moments: DbMoment[],
  exportId: string,
  familyId: string,
): Promise<Buffer> {
  const { default: archiver } = await import("archiver");

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver("zip", { zlib: { level: 6 } });

    archive.on("data", (chunk) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    (async () => {
      try {
        const metadataRows: string[] = [
          escapeAndQuoteCsv(["Moment ID", "Title", "Description", "Created At", "Reaction Count", "Image Filename"]),
        ];

        let imageCounter = 0;

        for (const moment of moments) {
          const createdDate = new Date(moment.createdAt);
          const isoDate = createdDate.toISOString().split("T")[0] ?? "unknown-date";
          const momentTitle = moment.caption ?? "(Untitled)";
          const momentDescription = "";

          let imageFilename = "";

          if (moment.mediaUrl && moment.mediaType === "photo") {
            imageCounter += 1;
            const ext = getImageExtensionFromUrl(moment.mediaUrl);
            imageFilename = `${isoDate}-moment-${imageCounter}.${ext}`;

            try {
              const imageBuffer = await downloadImageWithTimeout(moment.mediaUrl);
              archive.append(imageBuffer, { name: `images/${imageFilename}` });
            } catch (error) {
              logEvent("warn", "Failed to download image for moment", {
                momentId: moment.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          metadataRows.push(
            escapeAndQuoteCsv([
              moment.id,
              momentTitle,
              momentDescription,
              createdDate.toLocaleString("en-US"),
              "0",
              imageFilename,
            ]),
          );
        }

        const metadataCsv = metadataRows.join("\n");
        archive.append(metadataCsv, { name: "moments.csv" });

        const summaryText = buildMomentsArchiveSummary(moments, imageCounter);
        archive.append(summaryText, { name: "README.txt" });

        await archive.finalize();
      } catch (error) {
        archive.destroy();
        reject(error);
      }
    })();
  });

  return buffer;
}

function getImageExtensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);
    return match ? match[1].toLowerCase() : "jpg";
  } catch {
    return "jpg";
  }
}

async function downloadImageWithTimeout(url: string, timeoutMs: number = MOMENTS_ARCHIVE_IMAGE_FETCH_TIMEOUT): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function buildMomentsArchiveSummary(moments: DbMoment[], imageCount: number): string {
  const momentCount = moments.length;
  let dateRange = "N/A";

  if (momentCount > 0) {
    const firstDate = new Date(moments[0].createdAt).toLocaleDateString("en-US");
    const lastDate = new Date(moments[momentCount - 1].createdAt).toLocaleDateString("en-US");
    dateRange = `${firstDate} to ${lastDate}`;
  }

  const lines: string[] = [
    "KidSchedule Moments Archive",
    "============================",
    "",
    `Generated: ${new Date().toLocaleString("en-US")}`,
    "",
    "Archive Contents:",
    "-----------------",
    `Total Moments: ${momentCount}`,
    `Images Included: ${imageCount}`,
    `Date Range: ${dateRange}`,
    "",
    "Files:",
    "------",
    "- README.txt: This file",
    "- moments.csv: Metadata for all moments",
    "- images/: Folder containing all photos",
    "",
    "Notes:",
    "------",
    "- Photos are organized by creation date",
    "- Not all moments may have images attached",
    "- Use moments.csv to link metadata to image filenames",
  ];

  return lines.join("\n");
}

/**
 * Generate a CSV of messages
 */
async function generateMessagesCsv(job: ExportJobRecord): Promise<ExportResult> {
  const db = getDb();

  // Fetch all messages for family
  const threads = await db.messageThreads.findByFamilyId(job.familyId);
  const parents = await db.parents.findByFamilyId(job.familyId);
  const parentMap = new Map(parents.map((p) => [p.id, p.name]));

  const csvRows: string[] = [
    escapeAndQuoteCsv(["Thread", "Date", "Time", "Sender", "Status", "Message Preview", "Attachments", "Read At"]),
  ];

  let totalMessages = 0;

  for (const thread of threads) {
    const threadMessages = await db.messages.findByThreadId(thread.id);
    const threadSubject = thread.subject ?? "(No Subject)";

    for (const message of threadMessages) {
      totalMessages += 1;
      const senderName = parentMap.get(message.senderId) ?? "Unknown";
      const sentDate = new Date(message.sentAt);
      const dateStr = sentDate.toLocaleDateString("en-US");
      const timeStr = sentDate.toLocaleTimeString("en-US");
      const readStatus = message.readAt ? "Read" : "Unread";
      const readAtStr = message.readAt ? new Date(message.readAt).toLocaleString("en-US") : "";
      const messagePreview = message.body.substring(0, MESSAGES_CSV_PREVIEW_LENGTH).replace(/\n/g, " ");
      const attachmentCount = message.attachmentIds.length;

      csvRows.push(
        escapeAndQuoteCsv([
          threadSubject,
          dateStr,
          timeStr,
          senderName,
          readStatus,
          messagePreview,
          attachmentCount.toString(),
          readAtStr,
        ]),
      );
    }
  }

  const csvContent = csvRows.join("\n");
  const csvBuffer = Buffer.from(csvContent, "utf-8");

  logEvent("info", "Messages CSV generated", {
    familyId: job.familyId,
    messageCount: totalMessages,
    threadCount: threads.length,
    sizeBytes: csvBuffer.length,
  });

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
  const params = job.params as MomentsArchiveParams;

  // Fetch all moments for family, optionally filtered by date range
  let moments = await db.moments.findByFamilyId(job.familyId);

  if (params.startDate || params.endDate) {
    moments = filterMomentsByDateRange(moments, params);
  }

  const buffer = await buildMomentsArchive(moments, job.id, job.familyId);

  logEvent("info", "Moments archive generated", {
    familyId: job.familyId,
    momentCount: moments.length,
    sizeBytes: buffer.length,
  });

  return {
    resultUrl: `https://storage.example.com/exports/${job.id}/moments.zip`,
    mimeType: "application/zip",
    sizeBytes: buffer.length,
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

  logEvent("info", "Custody compliance PDF generated", {
    familyId: job.familyId,
    sizeBytes: pdfResult.sizeBytes,
    messagesVerified: messageHashes.length,
  });

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

  logEvent("info", "Message transcript PDF generated", {
    familyId: job.familyId,
    sizeBytes: pdfResult.sizeBytes,
    messageCount: hashedMessages.length,
  });

  return {
    resultUrl: `https://storage.example.com/exports/${job.id}/message-transcript.pdf`,
    mimeType: "application/pdf",
    sizeBytes: pdfResult.sizeBytes,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a communication report PDF for mediation/court use (EXP-003)
 */
async function generateCommunicationReportExport(job: ExportJobRecord): Promise<ExportResult> {
  const db = getDb();
  const params = job.params as { startDate?: string; endDate?: string };

  if (!params.startDate || !params.endDate) {
    throw new Error("Communication report export requires startDate and endDate parameters");
  }

  // Aggregate report from messages + tone + compliance
  const report = await generateCommunicationReport(
    job.familyId,
    params.startDate,
    params.endDate
  );

  // Build messages with hashes for PDF embedding
  const threads = await db.messageThreads.findByFamilyId(job.familyId);
  const allMessages = threads.length
    ? (await Promise.all(threads.map((t) => db.messages.findByThreadId(t.id)))).flat()
    : [];

  const start = new Date(params.startDate).getTime();
  const end = new Date(params.endDate).getTime();

  const periodMessages = allMessages.filter((m) => {
    const t = new Date(m.sentAt).getTime();
    return t >= start && t <= end;
  });

  const hashedMessages: HashedMessage[] = periodMessages
    .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())
    .map((m, idx) => ({
      index: idx,
      messageHash: m.messageHash,
      previousHash: m.previousHash || "",
      senderId: m.senderId,
      senderName: report.participants.find((p) => p.parentId === m.senderId)?.name || "Unknown",
      body: m.body,
      sentAt: m.sentAt,
    }));

  // Build a compliance report shape compatible with the PDF generator
  const pdfReport = {
    familyId: job.familyId,
    reportPeriod: { startDate: params.startDate, endDate: params.endDate },
    parents: report.participants.map((p) => ({
      id: p.parentId,
      name: p.name,
      email: p.email,
    })),
    summary: {
      totalScheduledTime: 0,
      totalActualTime: 0,
      compliancePercentage: report.complianceHighlights.compliancePercentage,
      totalDeviations: report.complianceHighlights.totalDeviations,
      totalOverrides: 0,
    },
    periods: [],
    overrides: [],
    changeRequests: [],
    generatedAt: report.generatedAt,
  };

  const config: PdfGeneratorConfig = {
    title: "Communication Report",
    author: "KidSchedule",
    createdAt: report.generatedAt,
    familyId: job.familyId,
    documentType: "custody-compliance",
  };

  const pdfResult = await generateCustodyCompliancePdf(
    pdfReport as Parameters<typeof generateCustodyCompliancePdf>[0],
    hashedMessages,
    config
  );

  // Store metadata
  const exportMetadata = await db.exportMetadata.create({
    exportId: job.id,
    familyId: job.familyId,
    reportType: "communication-report",
    includedMessageIds: periodMessages.map((m) => m.id),
    custodyPeriodStart: params.startDate,
    custodyPeriodEnd: params.endDate,
    pdfHash: pdfResult.hash,
    pdfSizeBytes: pdfResult.sizeBytes,
  });

  await db.exportMessageHashes.createBatch(
    hashedMessages.map((m, idx) => ({
      exportMetadataId: exportMetadata.id,
      messageId: periodMessages[idx]?.id || "",
      chainIndex: m.index,
      messageHash: m.messageHash,
      previousHash: m.previousHash,
      sentAt: m.sentAt,
      senderId: m.senderId,
      messagePreview: m.body.substring(0, 100),
    }))
  );

  logEvent("info", "Communication report PDF generated", {
    familyId: job.familyId,
    sizeBytes: pdfResult.sizeBytes,
    healthScore: report.toneSummary.overallHealthScore,
    hashChainValid: report.hashChainValid,
  });

  return {
    resultUrl: `https://storage.example.com/exports/${job.id}/communication-report.pdf`,
    mimeType: "application/pdf",
    sizeBytes: pdfResult.sizeBytes,
    generatedAt: new Date().toISOString(),
  };
}
