"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib";
import { db } from "@/lib/persistence";
import { analyzeMessageTone } from "@/lib/providers/ai";

export async function sendMessage(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const parent = await db.parents.findByUserId(user.userId);

  if (!parent) {
    redirect("/calendar/wizard?onboarding=1");
  }
  const activeParent = parent as NonNullable<typeof parent>;

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
  await db.messages.create({
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

  const params = new URLSearchParams();
  params.set("success", "1");
  redirect(`/messages?${params.toString()}`);
}
