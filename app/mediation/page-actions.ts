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
import { adjustSuggestion } from "@/lib/providers/ai";
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
 * Send a mediation suggestion as a message to the other parent
 */
export async function sendMediationSuggestion(
  topicId: string,
  draftText: string,
  recipientParentId: string
): Promise<{ success: boolean; messageId?: string }> {
  const user = await requireAuth();
  const parent = await db.parents.findByUserId(user.userId);

  if (!parent) {
    throw new Error("Parent profile not found");
  }

  // Validate draft text
  if (!draftText?.trim()) {
    throw new Error("Draft suggestion cannot be empty");
  }
  if (draftText.length > 2000) {
    throw new Error("Draft suggestion must be under 2,000 characters");
  }

  try {
    // Get the mediation topic
    const topic = await db.mediationTopics.findById(topicId);
    if (!topic) {
      throw new Error("Topic not found");
    }

    // Verify topic belongs to parent's family
    if (topic.familyId !== parent.familyId) {
      throw new Error("Topic not found or access denied");
    }

    // Get the recipient parent
    const recipient = await db.parents.findById(recipientParentId);
    if (!recipient) {
      throw new Error("Recipient parent not found");
    }

    // Verify recipient is in same family
    if (recipient.familyId !== parent.familyId) {
      throw new Error("Recipient not found or access denied");
    }

    // Find or create message thread for this mediation topic
    // NOTE: This uses an O(n×m) pattern where we fetch all threads and then for each thread
    // fetch all messages to check participants. This is necessary because the repository
    // doesn't currently support a "find thread by participants + subject" query.
    // TODO: For better performance, consider extracting this into a dedicated repository
    // method like `db.messageThreads.findByParticipantsAndSubject()` if this becomes a bottleneck.
    let thread = null;
    const existingThreads = await db.messageThreads.findByFamilyId(
      parent.familyId
    );

    // Look for thread that includes both parents and is for this topic
    for (const existingThread of existingThreads) {
      const messages = await db.messages.findByThreadId(existingThread.id);
      const participants = new Set<string>();
      messages.forEach((msg) => participants.add(msg.senderId));

      // Check if thread has both parents and matches topic
      if (
        participants.has(parent.id) &&
        participants.has(recipientParentId) &&
        existingThread.subject?.includes(topic.title)
      ) {
        thread = existingThread;
        break;
      }
    }

    // Create new thread if not found
    if (!thread) {
      thread = await db.messageThreads.create({
        familyId: parent.familyId,
        subject: `Mediation: ${topic.title}`,
      });
    }

    // Create the message
    // Hash chain fields (messageHash, chainIndex) are auto-computed by repository
    const sentAt = new Date().toISOString();
    const message = await db.messages.create({
      threadId: thread.id,
      familyId: parent.familyId,
      senderId: parent.id,
      body: draftText,
      sentAt,
      attachmentIds: [],
      messageHash: "", // Computed by repository
      chainIndex: 0, // Computed by repository
    });

    // Update topic status to "in_progress"
    await db.mediationTopics.update(topicId, { status: "in_progress" });

    // Log the event
    logEvent("info", "mediation.suggestion_sent", {
      topicId,
      messageId: message.id,
      familyId: parent.familyId,
      threadId: thread.id,
    });

    revalidatePath("/mediation");

    return { success: true, messageId: message.id };
  } catch (error) {
    logEvent("error", "mediation.suggestion_send_failed", {
      topicId,
      recipientParentId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
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

/**
 * Adjust a suggestion's tone using Claude
 * Supported adjustments: gentler, shorter, more_formal, warmer
 */
export async function adjustSuggestionTone(
  originalText: string,
  adjustment: "gentler" | "shorter" | "more_formal" | "warmer"
): Promise<{ adjustedText: string }> {
  const user = await requireAuth();
  const parent = await db.parents.findByUserId(user.userId);

  if (!parent) {
    throw new Error("Parent profile not found");
  }

  // Validate input
  if (!originalText || !originalText.trim()) {
    throw new Error("Original text cannot be empty");
  }

  if (!["gentler", "shorter", "more_formal", "warmer"].includes(adjustment)) {
    throw new Error(`Invalid adjustment type: ${adjustment}`);
  }

  try {
    const adjustedText = await adjustSuggestion(user.userId, originalText, adjustment);

    logEvent("info", "mediation.suggestion_adjusted", {
      familyId: parent.familyId,
      adjustment,
      originalLength: originalText.length,
      adjustedLength: adjustedText.length,
    });

    return { adjustedText };
  } catch (error) {
    logEvent("error", "mediation.suggestion_adjustment_failed", {
      familyId: parent.familyId,
      adjustment,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
