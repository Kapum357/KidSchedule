import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/persistence";
import { analyzeMessageTone, getMediationAssistantTips } from "@/lib/providers/ai";
import type { Message } from "@/types";

type MessageSearchParams = {
  success?: string;
  error?: string;
  blocked?: string;
  indicators?: string;
  suggestion?: string;
  draft?: string;
};

type MessagePageState = {
  successMessage?: string;
  errorMessage?: string;
  blockedMessage?: string;
  blockedIndicators: string[];
  blockedSuggestion?: string;
  draft: string;
};

function resolveMessageState(searchParams?: MessageSearchParams): MessagePageState {
  const blockedIndicators =
    typeof searchParams?.indicators === "string" && searchParams.indicators.length > 0
      ? searchParams.indicators
          .split("||")
          .map((indicator) => indicator.trim())
          .filter((indicator) => indicator.length > 0)
      : [];

  return {
    successMessage:
      searchParams?.success === "1"
        ? "Message sent successfully."
        : undefined,
    errorMessage: searchParams?.error,
    blockedMessage:
      searchParams?.blocked === "1"
        ? "This message was blocked before sending because it may escalate conflict."
        : undefined,
    blockedIndicators,
    blockedSuggestion: searchParams?.suggestion,
    draft: searchParams?.draft ?? "",
  };
}

function mapDbMessageToDomainMessage(dbMessage: Awaited<ReturnType<typeof db.messages.findByFamilyId>>[number]): Message {
  return {
    id: dbMessage.id,
    familyId: dbMessage.familyId,
    senderId: dbMessage.senderId,
    body: dbMessage.body,
    sentAt: dbMessage.sentAt,
    readAt: dbMessage.readAt,
    attachmentIds: dbMessage.attachmentIds,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(digest).toString("hex");
}

async function sendMessage(formData: FormData): Promise<void> {
  "use server";

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

  const existingThreadMessages = await db.messages.findByThreadId(threadId);
  const sortedThreadMessages = existingThreadMessages
    .slice()
    .sort((a, b) => a.chainIndex - b.chainIndex);
  const previousMessage = sortedThreadMessages.at(-1);
  const nextChainIndex = previousMessage ? previousMessage.chainIndex + 1 : 0;
  const previousHash = previousMessage?.messageHash;
  const sentAt = new Date().toISOString();

  const messageHashInput = JSON.stringify({
    threadId,
    familyId: activeParent.familyId,
    senderId: activeParent.id,
    body: messageText,
    sentAt,
    chainIndex: nextChainIndex,
    previousHash: previousHash ?? "",
  });

  const messageHash = await sha256Hex(messageHashInput);

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
    messageHash,
    previousHash,
    chainIndex: nextChainIndex,
  });

  const params = new URLSearchParams();
  params.set("success", "1");
  redirect(`/messages?${params.toString()}`);
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function MessagesPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<MessageSearchParams> }>) {
  const resolvedSearchParams = await searchParams;
  const state = resolveMessageState(resolvedSearchParams);

  const user = await requireAuth();
  const currentParent = await db.parents.findByUserId(user.userId);

  if (!currentParent) {
    redirect("/calendar/wizard?onboarding=1");
  }
  const activeParent = currentParent as NonNullable<typeof currentParent>;

  let messages = await db.messages.findByFamilyId(activeParent.familyId);
  const familyParents = await db.parents.findByFamilyId(activeParent.familyId);

  messages = messages
    .slice()
    .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));

  const recentMessageContext = messages
    .slice(0, 12)
    .map(mapDbMessageToDomainMessage);

  const mediation =
    recentMessageContext.length >= 2
      ? await getMediationAssistantTips(user.userId, recentMessageContext)
      : undefined;

  const parentNameById = new Map<string, string>(
    familyParents.map((parent) => [parent.id, parent.name])
  );

  return (
    <main className="min-h-screen bg-background-light dark:bg-background-dark p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Messages</h1>
          <a
            href="/dashboard"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Back to Dashboard
          </a>
        </div>

        <form
          action={sendMessage}
          className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
        >
          <label htmlFor="message" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
            New message
          </label>
          <textarea
            id="message"
            name="message"
            defaultValue={state.draft}
            rows={4}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Write a clear, child-focused update…"
            maxLength={2000}
            required
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hostile messages are blocked before send, with a neutral rewrite suggestion.
            </p>
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Send message
            </button>
          </div>
        </form>

        {(state.successMessage || state.errorMessage || state.blockedMessage) && (
          <div className="mb-4 space-y-2">
            {state.successMessage && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
                {state.successMessage}
              </p>
            )}
            {state.errorMessage && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                {state.errorMessage}
              </p>
            )}
            {state.blockedMessage && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="font-semibold">{state.blockedMessage}</p>
                {state.blockedIndicators.length > 0 && (
                  <ul className="mt-2 list-disc pl-5">
                    {state.blockedIndicators.map((indicator) => (
                      <li key={indicator}>{indicator}</li>
                    ))}
                  </ul>
                )}
                {state.blockedSuggestion && (
                  <p className="mt-2 rounded-md border border-amber-200 bg-white/60 px-2 py-1 dark:border-amber-700/60 dark:bg-amber-900/20">
                    Suggested neutral rewrite: {state.blockedSuggestion}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {mediation && mediation.deescalationTips.length > 0 && (
          <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Mediation assistant tips ({mediation.conflictLevel} conflict)
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">AI-assisted</span>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
              {mediation.deescalationTips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </section>
        )}

        {messages.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            No messages yet. Your family conversation history will appear here.
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((message) => (
              <li
                key={message.id}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{parentNameById.get(message.senderId) ?? "Parent"}</span>
                  <span>{formatWhen(message.sentAt)}</span>
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-200">{message.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
