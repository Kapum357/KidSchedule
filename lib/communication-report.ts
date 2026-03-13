import { getDb } from "@/lib/persistence";
import { MediationAnalyzer } from "@/lib/mediation";
import { CustodyComplianceEngine } from "@/lib/custody";
import { verifyChain } from "@/lib/hash-chain-engine";
import type { WarningSignal, WarningSeverity } from "@/lib/mediation";
import type { CustodyComplianceReport } from "@/lib/custody";
import type { DbMessage } from "@/lib/persistence/types";

// ─── Report shape ─────────────────────────────────────────────────────────────

export interface CommunicationReportParticipant {
  parentId: string;
  name: string;
  email: string;
  messageCount: number;
  avgResponseTimeHours: number;
}

export interface MessageSummary {
  totalCount: number;
  byParent: Record<string, number>;       // parentId → count
  firstMessageAt: string;
  lastMessageAt: string;
  averageBodyLength: number;
}

export interface ToneSummary {
  overallHealthScore: number;             // 0–100
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
  topWarningCategories: string[];         // e.g. ["AggressiveCapitalization"]
  warningSignals: WarningSignal[];
}

export interface TimelineEvent {
  occurredAt: string;
  type: "message" | "override" | "change_request" | "mediation_signal";
  description: string;
  severity?: WarningSeverity;
  parentId?: string;
}

export interface CommunicationReport {
  familyId: string;
  period: { startDate: string; endDate: string };
  participants: CommunicationReportParticipant[];
  messageSummary: MessageSummary;
  toneSummary: ToneSummary;
  mediationSuggestions: string[];
  complianceHighlights: {
    compliancePercentage: number;
    totalDeviations: number;
    isCompliant: boolean;
  };
  timelineEvents: TimelineEvent[];
  hashChainRoot: string;                  // SHA-256 of last message hash in period
  hashChainValid: boolean;
  generatedAt: string;
}

// ─── Main aggregation function ─────────────────────────────────────────────────

/**
 * Generate a consolidated communication report for mediation/court proceedings.
 *
 * @param familyId  UUID of the family
 * @param startDate ISO date string (inclusive)
 * @param endDate   ISO date string (inclusive)
 */
export async function generateCommunicationReport(
  familyId: string,
  startDate: string,
  endDate: string
): Promise<CommunicationReport> {
  const db = getDb();

  // ── 1. Fetch family and parents ────────────────────────────────────────────
  const [parents, threads] = await Promise.all([
    db.parents.findByFamilyId(familyId),
    db.messageThreads.findByFamilyId(familyId),
  ]);

  if (!parents.length) {
    throw new Error(`No parents found for family ${familyId}`);
  }

  const parentMap = new Map(parents.map((p) => [p.id, p]));

  // ── 2. Collect messages for period ────────────────────────────────────────
  const allMessages: DbMessage[] = threads.length
    ? (await Promise.all(threads.map((t) => db.messages.findByThreadId(t.id)))).flat()
    : [];

  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();

  const periodMessages = allMessages.filter((m) => {
    const t = new Date(m.sentAt).getTime();
    return t >= start && t <= end;
  });

  const sorted = [...periodMessages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
  );

  // ── 3. Message summary ─────────────────────────────────────────────────────
  const byParent: Record<string, number> = {};
  let totalBodyLength = 0;

  for (const msg of sorted) {
    byParent[msg.senderId] = (byParent[msg.senderId] ?? 0) + 1;
    totalBodyLength += msg.body.length;
  }

  const messageSummary: MessageSummary = {
    totalCount: sorted.length,
    byParent,
    firstMessageAt: sorted[0]?.sentAt ?? startDate,
    lastMessageAt: sorted[sorted.length - 1]?.sentAt ?? endDate,
    averageBodyLength:
      sorted.length > 0 ? Math.round(totalBodyLength / sorted.length) : 0,
  };

  // ── 4. Tone analysis ───────────────────────────────────────────────────────
  const analyzer = new MediationAnalyzer();
  // Convert DbMessage to the Message type expected by analyzer
  const messagesForAnalyzer = sorted.map((m) => ({
    id: m.id,
    threadId: m.threadId,
    senderId: m.senderId,
    body: m.body,
    sentAt: m.sentAt,
    attachmentIds: m.attachmentIds,
    toneAnalysis: m.toneAnalysis,
    messageHash: m.messageHash,
    previousHash: m.previousHash,
    chainIndex: m.chainIndex,
    familyId: m.familyId,
    readAt: m.readAt,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }));

  const warningSignals =
    sorted.length > 0
      ? analyzer.analyzeThread(messagesForAnalyzer as Parameters<typeof analyzer.analyzeThread>[0])
      : [];

  const countBySeverity = (sev: WarningSeverity) =>
    warningSignals.filter((w) => w.severity === sev).length;

  const categoryFreq: Record<string, number> = {};
  for (const w of warningSignals) {
    categoryFreq[w.category] = (categoryFreq[w.category] ?? 0) + 1;
  }
  const topWarningCategories = Object.entries(categoryFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  const highCount = countBySeverity("high");
  const medCount = countBySeverity("medium");
  const lowCount = countBySeverity("low");
  // Health score: 100 minus deductions per warning level
  const healthScore = Math.max(
    0,
    100 - highCount * 20 - medCount * 8 - lowCount * 2
  );

  const toneSummary: ToneSummary = {
    overallHealthScore: healthScore,
    highSeverityCount: highCount,
    mediumSeverityCount: medCount,
    lowSeverityCount: lowCount,
    topWarningCategories,
    warningSignals,
  };

  // ── 5. Mediation suggestions ───────────────────────────────────────────────
  const mediationSuggestions = buildMediationSuggestions(toneSummary);

  // ── 6. Custody compliance highlights ──────────────────────────────────────
  let complianceHighlights = {
    compliancePercentage: 100,
    totalDeviations: 0,
    isCompliant: true,
  };

  try {
    const engine = new CustodyComplianceEngine();
    const complianceReport = await engine.generateComplianceReport(
      familyId,
      startDate,
      endDate
    );
    complianceHighlights = {
      compliancePercentage: complianceReport.summary.compliancePercentage,
      totalDeviations: complianceReport.summary.totalDeviations,
      isCompliant: complianceReport.summary.compliancePercentage >= 100,
    };
  } catch {
    // Compliance data unavailable — proceed without it
  }

  // ── 7. Timeline events ─────────────────────────────────────────────────────
  const timelineEvents: TimelineEvent[] = [];

  // Add messages as timeline events (sample: first and last, plus high-severity signals)
  if (sorted.length > 0) {
    timelineEvents.push({
      occurredAt: sorted[0].sentAt,
      type: "message",
      description: `First message of period from ${parentMap.get(sorted[0].senderId)?.name ?? "parent"}`,
      parentId: sorted[0].senderId,
    });
    if (sorted.length > 1) {
      timelineEvents.push({
        occurredAt: sorted[sorted.length - 1].sentAt,
        type: "message",
        description: `Last message of period from ${parentMap.get(sorted[sorted.length - 1].senderId)?.name ?? "parent"}`,
        parentId: sorted[sorted.length - 1].senderId,
      });
    }
  }

  // Add high-severity mediation signals as timeline events
  for (const signal of warningSignals.filter((w) => w.severity === "high")) {
    timelineEvents.push({
      occurredAt: signal.messageTimestamp,
      type: "mediation_signal",
      description: signal.description,
      severity: signal.severity,
      // parentId not available in WarningSignal
    });
  }

  timelineEvents.sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );

  // ── 8. Hash chain integrity ────────────────────────────────────────────────
  let hashChainRoot = "";
  let hashChainValid = false;

  if (sorted.length > 0) {
    try {
      // Use hash-chain-engine to verify the thread chain
      const chainMessages = sorted.map((m) => ({
        id: m.id,
        threadId: m.threadId,
        senderId: m.senderId,
        body: m.body,
        sentAt: m.sentAt,
        messageHash: m.messageHash,
        previousHash: m.previousHash ?? null,
        chainIndex: m.chainIndex,
      }));

      const chainResult = await verifyChain(chainMessages as Parameters<typeof verifyChain>[0]);
      hashChainValid = chainResult.isValid;
      // Root is the last message's hash (tip of chain)
      hashChainRoot = sorted[sorted.length - 1].messageHash;
    } catch {
      hashChainRoot = sorted[sorted.length - 1]?.messageHash ?? "";
    }
  }

  // ── 9. Participants ────────────────────────────────────────────────────────
  const participants: CommunicationReportParticipant[] = parents.map((p) => {
    const count = byParent[p.id] ?? 0;
    return {
      parentId: p.id,
      name: p.name,
      email: p.email,
      messageCount: count,
      avgResponseTimeHours: computeAvgResponseTime(sorted, p.id),
    };
  });

  return {
    familyId,
    period: { startDate, endDate },
    participants,
    messageSummary,
    toneSummary,
    mediationSuggestions,
    complianceHighlights,
    timelineEvents,
    hashChainRoot,
    hashChainValid,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMediationSuggestions(tone: ToneSummary): string[] {
  const suggestions: string[] = [];

  if (tone.highSeverityCount > 0) {
    suggestions.push(
      "High-severity communication patterns detected. Consider scheduling a mediation session before proceeding."
    );
  }
  if (tone.overallHealthScore < 50) {
    suggestions.push(
      "Communication health is below 50%. Using a neutral third-party messaging platform or parallel parenting protocol may reduce conflict."
    );
  }
  if (tone.topWarningCategories.includes("AggressiveCaps")) {
    suggestions.push(
      "Frequent use of all-caps messages detected. Suggesting a brief communication break or asynchronous scheduling."
    );
  }
  if (tone.mediumSeverityCount > 3) {
    suggestions.push(
      "Multiple medium-severity patterns identified. Structured communication guidelines (e.g. 2-hour response window) may help."
    );
  }
  if (suggestions.length === 0) {
    suggestions.push(
      "Communication patterns within normal parameters. Continue current co-parenting approach."
    );
  }

  return suggestions;
}

function computeAvgResponseTime(
  messages: DbMessage[],
  parentId: string
): number {
  // Find messages sent by the OTHER parent followed by a response from parentId
  const responseTimes: number[] = [];
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];
    if (curr.senderId === parentId && prev.senderId !== parentId) {
      const ms =
        new Date(curr.sentAt).getTime() - new Date(prev.sentAt).getTime();
      responseTimes.push(ms / 3_600_000); // convert to hours
    }
  }
  if (!responseTimes.length) return 0;
  return (
    Math.round(
      (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10
    ) / 10
  );
}
