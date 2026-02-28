/**
 * KidSchedule – SMS Delivery Status Tracker
 *
 * Lightweight status tracking for outbound SMS message lifecycle.
 *
 * In production this should be persisted to PostgreSQL, but this in-memory
 * tracker provides immediate observability and webhook linkage without schema
 * coupling.
 */

export type SmsDeliveryStatus =
  | "queued"
  | "accepted"
  | "sending"
  | "sent"
  | "delivered"
  | "undelivered"
  | "failed"
  | "unknown";

export interface SmsDeliveryRecord {
  messageId: string;
  to?: string;
  familyId?: string;
  status: SmsDeliveryStatus;
  providerStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  updatedAt: string;
  createdAt: string;
}

const smsStatusStore = new Map<string, SmsDeliveryRecord>();
const MAX_RECORDS = 10_000;

function trimStore(): void {
  if (smsStatusStore.size <= MAX_RECORDS) {
    return;
  }

  const sorted = [...smsStatusStore.values()].sort((a, b) =>
    a.updatedAt.localeCompare(b.updatedAt)
  );

  const toDelete = sorted.slice(0, smsStatusStore.size - MAX_RECORDS);
  for (const record of toDelete) {
    smsStatusStore.delete(record.messageId);
  }
}

export function createSmsDeliveryRecord(input: {
  messageId: string;
  to?: string;
  familyId?: string;
  status?: SmsDeliveryStatus;
  providerStatus?: string;
}): SmsDeliveryRecord {
  const now = new Date().toISOString();
  const record: SmsDeliveryRecord = {
    messageId: input.messageId,
    to: input.to,
    familyId: input.familyId,
    status: input.status ?? "queued",
    providerStatus: input.providerStatus,
    updatedAt: now,
    createdAt: now,
  };

  smsStatusStore.set(record.messageId, record);
  trimStore();
  return record;
}

export function updateSmsDeliveryStatus(input: {
  messageId: string;
  status?: SmsDeliveryStatus;
  providerStatus?: string;
  errorCode?: string;
  errorMessage?: string;
}): SmsDeliveryRecord {
  const existing = smsStatusStore.get(input.messageId);
  const now = new Date().toISOString();

  const next: SmsDeliveryRecord = {
    messageId: input.messageId,
    to: existing?.to,
    familyId: existing?.familyId,
    status: input.status ?? existing?.status ?? "unknown",
    providerStatus: input.providerStatus ?? existing?.providerStatus,
    errorCode: input.errorCode ?? existing?.errorCode,
    errorMessage: input.errorMessage ?? existing?.errorMessage,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  smsStatusStore.set(next.messageId, next);
  trimStore();
  return next;
}

export function getSmsDeliveryStatus(messageId: string): SmsDeliveryRecord | null {
  return smsStatusStore.get(messageId) ?? null;
}
