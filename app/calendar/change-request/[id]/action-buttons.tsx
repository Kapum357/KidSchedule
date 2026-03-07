"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ActionButtonsProps = {
  requestId: string;
  isRequester: boolean;
  status: string;
};

export function ActionButtons({ requestId, isRequester, status }: ActionButtonsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function callAction(action: string, note?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/calendar/change-requests/${requestId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: note !== undefined ? JSON.stringify({ note }) : undefined,
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (status !== "pending") {
    return null;
  }

  if (isRequester) {
    return (
      <div className="flex items-center gap-2">
        {error && <p className="text-sm text-red-500 mr-2">{error}</p>}
        <button
          onClick={() => callAction("withdraw")}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200 dark:border-slate-700 disabled:opacity-50"
        >
          {loading ? "Withdrawing..." : "Withdraw"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <p className="text-sm text-red-500 mr-2">{error}</p>}
      <button
        onClick={() => callAction("approve")}
        disabled={loading}
        className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
      >
        {loading ? "..." : "Approve"}
      </button>
      <button
        onClick={() => callAction("decline")}
        disabled={loading}
        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
      >
        {loading ? "..." : "Decline"}
      </button>
      <CounterButton
        onCounter={(note) => callAction("counter", note)}
        loading={loading}
      />
    </div>
  );
}

function CounterButton({
  onCounter,
  loading,
}: {
  onCounter: (note: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
      >
        Counter
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-surface-dark rounded-xl p-6 w-full max-w-md shadow-xl mx-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              Propose Counter-Offer
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Describe your counter-proposal (required, minimum 5 characters).
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. I can do the swap but need the return time by 5pm instead of 7pm..."
              className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg p-3 text-sm h-28 resize-none focus:ring-2 focus:ring-primary focus:outline-none"
              maxLength={2000}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setOpen(false); setNote(""); }}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (note.trim().length >= 5) {
                    onCounter(note.trim());
                    setOpen(false);
                    setNote("");
                  }
                }}
                disabled={note.trim().length < 5}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Send Counter
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
