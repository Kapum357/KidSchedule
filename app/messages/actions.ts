"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { ensureParentExists } from "@/lib/parent-setup-engine";
import { db } from "@/lib/persistence";
import { analyzeMessageTone } from "@/lib/providers/ai";
import { emitNewMessage } from "@/lib/socket-server";
import { getSmsSender } from "@/lib/providers/sms";

export async function sendMessage(formData: FormData): Promise<void> {
  const user = await requireAuth();
  
  let activeParent;
  try {
    const parentResult = await ensureParentExists(user.userId);
    activeParent = parentResult.parent;
  } catch (error) {
    console.error(`Failed to ensure parent exists for userId ${user.userId}:`, error);
    redirect("/login?error=setup_failed");
  }

  const messageText = ((formData.get("message") as string | null) ?? "").trim();

  if (messageText.length === 0) {
    const params = new URLSearchParams();
    params.set("error", "Please enter a message before sending.");
    redirect(`/messages?${params.toString()}`);
  }

  if (messageText.length > 2000) {
    const params = new URLSearchParams();
    params.set("error", "Please keep your message under 2,000 characters.");
    params.set("draft", messageText);
    redirect(`/messages?${params.toString()}`);
  }

  const toneAnalysis = await analyzeMessageTone(user.userId, messageText);

  if (toneAnalysis.isHostile) {
    const params = new URLSearchParams();
    params.set("blocked", "1");
    params.set("draft", messageText);

    if (toneAnalysis.indicators.length > 0) {
      params.set("indicators", toneAnalysis.indicators.join("||"));
    }
    if (toneAnalysis.neutralRewrite.length > 0) {
      params.set("suggestion", toneAnalysis.neutralRewrite);
    }

    redirect(`/messages?${params.toString()}`);
  }

  const threads = await db.messageThreads.findByFamilyId(activeParent.familyId);
  let threadId = threads[0]?.id;

  if (!threadId) {
    const createdThread = await db.messageThreads.create({
      familyId: activeParent.familyId,
      subject: "Family Messages",
    });
    threadId = createdThread.id ?? `thread_${crypto.randomUUID()}`;
  }

  const sentAt = new Date().toISOString();

  // Hash chain fields (messageHash, previousHash, chainIndex) are computed
  // and stored by the repository; placeholder values are passed here.
  const createdMessage = await db.messages.create({
    threadId,
    familyId: activeParent.familyId,
    senderId: activeParent.id,
    body: messageText,
    sentAt,
    readAt: undefined,
    attachmentIds: [],
    toneAnalysis: {
      isHostile: false,
      indicators: toneAnalysis.indicators,
    },
    messageHash: "",
    chainIndex: 0,
  });

  // Emit real-time socket event for in-app delivery
  emitNewMessage(activeParent.familyId, {
    id: createdMessage.id,
    familyId: createdMessage.familyId,
    senderId: createdMessage.senderId,
    body: createdMessage.body,
    sentAt: createdMessage.sentAt,
    readAt: createdMessage.readAt,
    attachmentIds: createdMessage.attachmentIds,
  });

  // SMS relay: send SMS to enrolled family members
  const relayParticipants = await db.smsRelayParticipants.findByFamilyId(activeParent.familyId);
  if (relayParticipants.length > 0) {
    const sms = getSmsSender();
    const recipients = relayParticipants.filter(p => p.parentId !== activeParent.id && p.isActive);

    for (const recipient of recipients) {
      try {
        await sms.send({
          to: recipient.phone,
          from: recipient.proxyNumber,
          templateId: "relay-message",
          variables: {
            senderName: activeParent.name,
            messageText,
          },
          familyId: activeParent.familyId,
        });
      } catch (error) {
        // Log SMS send failure but don't block message delivery
        console.error(`Failed to send SMS to ${recipient.phone}:`, error);
      }
    }
  }

  const params = new URLSearchParams();
  params.set("success", "1");
  redirect(`/messages?${params.toString()}`);
}
