import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/persistence";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function MessagesPage() {
  const user = await requireAuth();
  const currentParent = await db.parents.findByUserId(user.userId);

  if (!currentParent) {
    redirect("/calendar/wizard?onboarding=1");
  }

  let messages = await db.messages.findByFamilyId(currentParent.familyId);
  const familyParents = await db.parents.findByFamilyId(currentParent.familyId);

  messages = messages
    .slice()
    .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));

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
