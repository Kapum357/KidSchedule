/**
 * KidSchedule – New Schedule Change Request Form
 *
 * - Interactive date/time selection with calendar preview
 * - Three change types: swap (with makeup period), cancel (no makeup), extra time
 * - AI-assisted conflict detection based on tone and request type
 * - Server-side validation and database persistence
 * - Responsive modal-style layout with side-by-side form and preview
 */

import { db } from "@/lib/persistence";
import { ensureParentExists } from "@/lib/parent-setup-engine";
import type { DbScheduleChangeRequest } from "@/lib/persistence/types";
import { requireAuth } from "@/lib";
import { redirect } from "next/navigation";
import { verifyOrigin } from "@/lib/security/csrf";
import { ChangeRequestForm } from "./change-request-form";
import {
  type ChangeType,
  type ChangeReason,
  type ChangeRequestInput,
  isChangeType,
  isChangeReason,
  isIsoDate,
  isTimeValue,
  validateChangeRequestInput,
} from "./change-request-validation";

type ChangeRequestSearchParams = {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  changeType?: string;
  reason?: string;
  notes?: string;
  success?: string;
  error?: string;
};

type ChangeRequestPageState = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  changeType: ChangeType;
  reason: ChangeReason;
  notes: string;
  successMessage?: string;
  errorMessage?: string;
};

function defaultIsoDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolvePageState(searchParams: ChangeRequestSearchParams | undefined): ChangeRequestPageState {
  const fallbackStart = defaultIsoDate(1);
  const fallbackEnd = defaultIsoDate(3);

  return {
    startDate: isIsoDate(searchParams?.startDate) ? searchParams.startDate : fallbackStart,
    endDate: isIsoDate(searchParams?.endDate) ? searchParams.endDate : fallbackEnd,
    startTime: isTimeValue(searchParams?.startTime) ? searchParams.startTime : "17:00",
    endTime: isTimeValue(searchParams?.endTime) ? searchParams.endTime : "17:00",
    changeType: isChangeType(searchParams?.changeType) ? searchParams.changeType : "swap",
    reason: isChangeReason(searchParams?.reason) ? searchParams.reason : "work",
    notes: (searchParams?.notes ?? "").trim(),
    successMessage:
      searchParams?.success === "1"
        ? "Request sent successfully (demo mode). This would notify your co-parent immediately."
        : undefined,
    errorMessage: searchParams?.error,
  };
}

function buildQueryStringFromInput(input: {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  changeType: ChangeType;
  reason: ChangeReason;
  notes: string;
}): string {
  const params = new URLSearchParams({
    startDate: input.startDate,
    endDate: input.endDate,
    startTime: input.startTime,
    endTime: input.endTime,
    changeType: input.changeType,
    reason: input.reason,
  });

  if (input.notes.length > 0) {
    params.set("notes", input.notes);
  }

  return params.toString();
}

function parseChangeRequestFormData(formData: FormData): ChangeRequestInput {
  const startDate = ((formData.get("startDate") as string | null) ?? "").trim();
  const endDate = ((formData.get("endDate") as string | null) ?? "").trim();
  const startTime = ((formData.get("startTime") as string | null) ?? "").trim();
  const endTime = ((formData.get("endTime") as string | null) ?? "").trim();
  const changeTypeRaw = ((formData.get("changeType") as string | null) ?? "").trim();
  const reasonRaw = ((formData.get("reason") as string | null) ?? "").trim();
  const notes = ((formData.get("notes") as string | null) ?? "").trim();

  return {
    startDate,
    endDate,
    startTime,
    endTime,
    changeType: isChangeType(changeTypeRaw) ? changeTypeRaw : "swap",
    reason: isChangeReason(reasonRaw) ? reasonRaw : "work",
    notes,
  };
}

async function submitChangeRequest(formData: FormData): Promise<void> {
  "use server";

  // ── CSRF / Origin check ─────────────────────────────────────────────────────
  // additional protection beyond Next.js built-in verification.  invalid
  // origins result in a transparent redirect to the form with an error message.
  const originCheck = await verifyOrigin();
  if (!originCheck.valid) {
    const params = new URLSearchParams();
    params.set("error", "invalid_origin");
    redirect(`/calendar/change-request?${params.toString()}`);
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  const user = await requireAuth();
  const parentResult = await ensureParentExists(user.userId);
  const activeParent = parentResult.parent;

  // ── Parse & Validate ───────────────────────────────────────────────────────
  const input = parseChangeRequestFormData(formData);
  const baseParams = buildQueryStringFromInput(input);
  const validationError = validateChangeRequestInput(input);

  if (validationError) {
    const params = new URLSearchParams(baseParams);
    params.set("error", validationError);
    redirect(`/calendar/change-request?${params.toString()}`);
  }

  // ── Generate Request Metadata ──────────────────────────────────────────────
  const title = generateRequestTitle(
    input.changeType,
    input.startDate,
    input.endDate
  );

  // ── Persist to Database ────────────────────────────────────────────────────
  const createPayload: Omit<DbScheduleChangeRequest, "id" | "createdAt"> = {
    familyId: activeParent.familyId,
    requestedBy: activeParent.id,
    title,
    description: input.notes || undefined,
    givingUpPeriodStart: input.startDate,
    givingUpPeriodEnd: input.endDate,
    // Database requires make-up fields; use the same dates when not swapping
    requestedMakeUpStart: input.changeType === "swap" ? input.startDate : input.startDate,
    requestedMakeUpEnd: input.changeType === "swap" ? input.endDate : input.endDate,
    status: "pending",
    changeType: input.changeType,
    // optional fields
    respondedAt: undefined,
    responseNote: undefined,
  };

  const newRequest = await db.scheduleChangeRequests.create(createPayload);

  // ── Redirect to Detail View ────────────────────────────────────────────────
  redirect(`/calendar/change-request/${newRequest.id}`);
}

/**
 * Generate a human-readable title for the request based on change type and dates.
 *
 * Examples:
 *   - "Time Swap: Dec 20 – 22" (swap type)
 *   - "Cancel Custody: Dec 20 – 22" (cancel type)
 *   - "Extra Time: Dec 20 – 22" (extra type)
 */
function generateRequestTitle(
  changeType: ChangeType,
  startDate: string,
  endDate: string
): string {
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");

  const startFormatted = start.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  const endFormatted = end.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  const dateRange =
    startDate === endDate
      ? startFormatted
      : `${startFormatted} – ${endFormatted}`;

  const typeLabel = {
    swap: "Time Swap",
    cancel: "Cancel Custody",
    extra: "Extra Time",
  }[changeType];

  return `${typeLabel}: ${dateRange}`;
}


export const dynamic = "force-dynamic";

export default async function NewScheduleChangeRequestPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<ChangeRequestSearchParams> }>) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const user = await requireAuth();
  const parentResult = await ensureParentExists(user.userId);

  const resolvedSearchParams = await searchParams;
  const state = resolvePageState(resolvedSearchParams);

  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-slate-500/50 p-4 font-display text-text-main antialiased"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-surface-light shadow-2xl dark:bg-surface-dark">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-8 py-5 dark:border-slate-800 dark:bg-surface-dark">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white">
              <span className="material-symbols-outlined text-primary">edit_calendar</span>
              <span>New Schedule Change Request</span>
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Submit a proposal for a custody exception.</p>
          </div>
          <a
            href="/calendar"
            className="text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </a>
        </header>

        {(state.errorMessage || state.successMessage) && (
          <div className="border-b border-slate-100 px-8 py-3 dark:border-slate-800">
            {state.errorMessage && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                {state.errorMessage}
              </p>
            )}
            {state.successMessage && (
              <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
                {state.successMessage}
              </p>
            )}
          </div>
        )}

        <ChangeRequestForm
          defaultState={{
            startDate: state.startDate,
            endDate: state.endDate,
            startTime: state.startTime,
            endTime: state.endTime,
            changeType: state.changeType,
            reason: state.reason,
            notes: state.notes,
          }}
          submitAction={submitChangeRequest}
        />
      </div>
    </main>
  );
}
