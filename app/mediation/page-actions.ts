/**
 * KidSchedule – Mediation Page Server Actions
 *
 * Server-side functions that the mediation page component calls.
 * Handles data loading and mutations with proper auth/family scoping.
 */

"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib";
import { MediationAnalyzer } from "@/lib/mediation-analyzer";
import { logEvent } from "@/lib/observability/logger";
import type { Message } from "@/types";

export interface MediationPageData {
  topics: Array<{
    id: string;
    title: string;
    status: "draft" | "in_progress" | "resolved";
    createdAt: string;
    lastEditedAt: string;
    draftSuggestion?: string;
    isNew: boolean;
  }>;
  warnings: Array<{
    id: string;
    category: string;
    severity: "high" | "medium" | "low";
    title: string;
    description: string;
    createdAt: string;
  }>;
  stats: {
    total: number;
    undismissed: number;
    highSeverityCount: number;
  };
}

/**
 * Load all mediation data for the current family's mediation page
 */
export async function loadMediationData(): Promise<MediationPageData> {
  const user = await requireAuth();
  const parent = await db.parents.findByUserId(user.userId);

  if (!parent) {
    throw new Error("Parent profile not found");
  }

  const [topics, warnings, stats] = await Promise.all([
    db.mediationTopics.findByFamilyId(parent.familyId),
    db.mediationWarnings.findUndismissedByFamilyId(parent.familyId),
    db.mediationWarnings.getStats(parent.familyId),
  ]);

  logEvent("info", "mediation.page_loaded", {
    familyId: parent.familyId,
    topicsCount: topics.length,
    warningsCount: warnings.length,
  });

  return {
    topics: topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      status: topic.status,
      createdAt: topic.createdAt,
      lastEditedAt: topic.updatedAt,
      draftSuggestion: topic.draftSuggestion,
      isNew:
        new Date().getTime() - new Date(topic.createdAt).getTime() <
        5 * 60 * 1000, // isNew if < 5 min old
    })),
    warnings: warnings.map((w) => ({
      id: w.id,
      category: w.category,
      severity: w.severity,
      title: w.title,
      description: w.description,
      createdAt: w.flaggedAt,
    })),
    stats,
  };
}

/**
 * Create a new mediation topic
 */
export async function createMediationTopic(
  title: string,
  description?: string
): Promise<{ id: string; title: string }> {
  const user = await requireAuth();
  const parent = await db.parents.findByUserId(user.userId);

  if (!parent) {
    throw new Error("Parent profile not found");
  }

  const topic = await db.mediationTopics.create({
    familyId: parent.familyId,
    parentId: parent.id,
    title,
    description,
    status: "draft",
  });

  logEvent("info", "mediation.topic_created", {
    topicId: topic.id,
    familyId: parent.familyId,
  });

  revalidatePath("/mediation");

  return { id: topic.id, title: topic.title };
}

/**
 * Save a draft suggestion to a topic
 */
export async function saveMediationDraft(
  topicId: string,
  draftSuggestion: string
): Promise<void> {
  const user = await requireAuth();
  const parent = await db.parents.findByUserId(user.userId);

  if (!parent) {
    throw new Error("Parent profile not found");
  }

  const topic = await db.mediationTopics.findById(topicId);
  if (!topic || topic.familyId !== parent.familyId) {
    throw new Error("Topic not found or access denied");
  }

  await db.mediationTopics.saveDraft(topicId, draftSuggestion);

  logEvent("info", "mediation.draft_saved", {
    topicId,
    familyId: parent.familyId,
  });

  revalidatePath("/mediation");
}

/**
 * Dismiss a warning signal
 */
export async function dismissWarning(warningId: string): Promise<void> {
  const user = await requireAuth();
  const parent = await db.parents.findByUserId(user.userId);

  if (!parent) {
    throw new Error("Parent profile not found");
  }

  const warning = await db.mediationWarnings.findById(warningId);
  if (!warning || warning.familyId !== parent.familyId) {
    throw new Error("Warning not found or access denied");
  }

  await db.mediationWarnings.dismiss(warningId, parent.id);

  logEvent("info", "mediation.warning_dismissed", {
    warningId,
    familyId: parent.familyId,
  });

  revalidatePath("/mediation");
}

/**
 * Analyze current messages and populate warnings in the database
 * (Called periodically or on-demand to refresh warning signals)
 */
export async function analyzeAndStoreWarnings(): Promise<number> {
  const user = await requireAuth();
  const parent = await db.parents.findByUserId(user.userId);

  if (!parent) {
    throw new Error("Parent profile not found");
  }

  // Get recent messages
  const dbMessages = await db.messages.findByFamilyId(parent.familyId);
  const recentMessages = dbMessages.filter((msg) => {
    const msgDate = new Date(msg.sentAt);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return msgDate >= thirtyDaysAgo;
  });

  // Analyze for warnings
  const analyzer = new MediationAnalyzer();
  const warningSignals = analyzer.analyzeThread(recentMessages as Message[]);

  // Get existing warnings to avoid duplicates
  const existingWarningIds = new Set<string>();
  const existing = await db.mediationWarnings.findByFamilyId(
    parent.familyId
  );
  existing.forEach((w) => existingWarningIds.add(w.id));

  // Store new warnings
  let created = 0;
  for (const signal of warningSignals) {
    if (!existingWarningIds.has(signal.id)) {
      // Note: analyzer doesn't expose sender parent ID directly
      // Using messageId as temporary workaround - this should be enhanced in future
      const message = dbMessages.find((m) => m.id === signal.messageId);
      if (message) {
        await db.mediationWarnings.create({
          familyId: parent.familyId,
          messageId: signal.messageId,
          senderParentId: message.senderId,
          category: signal.category,
          severity: signal.severity,
          title: signal.title,
          description: signal.description,
          excerpt: signal.excerpt,
          flaggedAt: signal.flaggedAt,
          dismissed: signal.dismissed,
        });
        created++;
      }
    }
  }

  logEvent("info", "mediation.warnings_analyzed", {
    familyId: parent.familyId,
    messagesAnalyzed: recentMessages.length,
    warningsCreated: created,
  });

  revalidatePath("/mediation");
  return created;
}
