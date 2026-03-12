/**
 * Unit tests for ScheduleChangeRequestRepository methods:
 * approve, decline, counter, withdraw
 *
 * Uses an in-memory fake implementation — no database required.
 */

import type {
  ScheduleChangeRequestRepository,
  ChangeRequestMessageRepository,
  UnitOfWork,
} from "@/lib/persistence/repositories";
import type {
  DbScheduleChangeRequest,
  DbChangeRequestMessage,
} from "@/lib/persistence/types";
import { initDb, _test_resetDbInstance } from "@/lib/persistence";

// ─── In-Memory Fake ───────────────────────────────────────────────────────────

function makeFakeChangeRequestRepo(
  initial: DbScheduleChangeRequest[] = []
): ScheduleChangeRequestRepository {
  const store = new Map<string, DbScheduleChangeRequest>(
    initial.map((r) => [r.id, { ...r }])
  );

  return {
    async findById(id) {
      return store.get(id) ?? null;
    },
    async findByFamilyId() {
      return [];
    },
    async findByFamilyIdAndStatus() {
      return [];
    },
    async findByRequestedBy() {
      return [];
    },
    async findPendingByFamilyId() {
      return [];
    },
    async create(req) {
      const record: DbScheduleChangeRequest = {
        ...req,
        id: `generated-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      store.set(record.id, record);
      return record;
    },
    async approve(id, respondedBy, responseNote) {
      const record = store.get(id);
      if (!record) return null;
      const updated: DbScheduleChangeRequest = {
        ...record,
        status: "accepted",
        respondedBy,
        responseNote,
        respondedAt: new Date().toISOString(),
      };
      store.set(id, updated);
      return updated;
    },
    async decline(id, respondedBy, responseNote) {
      const record = store.get(id);
      if (!record) return null;
      const updated: DbScheduleChangeRequest = {
        ...record,
        status: "declined",
        respondedBy,
        responseNote,
        respondedAt: new Date().toISOString(),
      };
      store.set(id, updated);
      return updated;
    },
    async counter(id, respondedBy, responseNote) {
      const record = store.get(id);
      if (!record) return null;
      const updated: DbScheduleChangeRequest = {
        ...record,
        status: "countered",
        respondedBy,
        responseNote,
        respondedAt: new Date().toISOString(),
      };
      store.set(id, updated);
      return updated;
    },
    async withdraw(id) {
      const record = store.get(id);
      if (!record) return false;
      if (record.status !== "pending") return false;
      store.set(id, { ...record, status: "withdrawn" });
      return true;
    },
  };
}

function makeFakeMessageRepo(): ChangeRequestMessageRepository {
  return {
    async findByRequestId() {
      return [];
    },
    async create(msg) {
      return {
        ...msg,
        id: "unused",
        createdAt: new Date().toISOString(),
      };
    },
  };
}

function makeMinimalUnitOfWork(
  changeRequestsRepo: ScheduleChangeRequestRepository
): UnitOfWork {
  const noop = {} as never;
  return {
    users: noop,
    sessions: noop,
    passwordResets: noop,
    phoneVerifications: noop,
    auditLogs: noop,
    rateLimits: noop,
    families: noop,
    parents: noop,
    children: noop,
    custodySchedules: noop,
    calendarEvents: noop,
    scheduleChangeRequests: changeRequestsRepo,
    changeRequestMessages: makeFakeMessageRepo(),
    scheduleOverrides: noop,
    holidays: noop,
    holidayExceptionRules: noop,
    blogPosts: noop,
    blogCategories: noop,
    schoolEvents: noop,
    volunteerTasks: noop,
    schoolContacts: noop,
    schoolVaultDocuments: noop,
    lunchMenus: noop,
    lunchAccounts: noop,
    lunchTransactions: noop,
    expenses: noop,
    reminders: noop,
    conflictWindows: noop,
    messageThreads: noop,
    messages: noop,
    hashChainVerifications: noop,
    smsRelayParticipants: noop,
    moments: noop,
    momentReactions: noop,
    scheduledNotifications: noop,
    exportJobs: noop,
    stripeCustomers: noop,
    paymentMethods: noop,
    subscriptions: noop,
    invoices: noop,
    webhookEvents: noop,
    twilioWebhookEvents: noop,
    planTiers: noop,
    exportMetadata: noop,
    exportMessageHashes: noop,
    exportVerificationAttempts: noop,
    exportShareTokens: noop,
    mediationTopics: noop,
    mediationWarnings: noop,
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
  };
}

// ─── Seed helper ─────────────────────────────────────────────────────────────

function seedRequest(
  overrides: Partial<DbScheduleChangeRequest> = {}
): DbScheduleChangeRequest {
  return {
    id: "req-1",
    familyId: "family-1",
    requestedBy: "parent-1",
    title: "Swap weekend",
    givingUpPeriodStart: "2026-04-01T00:00:00.000Z",
    givingUpPeriodEnd: "2026-04-03T00:00:00.000Z",
    requestedMakeUpStart: "2026-04-08T00:00:00.000Z",
    requestedMakeUpEnd: "2026-04-10T00:00:00.000Z",
    status: "pending",
    changeType: "swap",
    createdAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ScheduleChangeRequestRepository", () => {
  beforeEach(() => {
    _test_resetDbInstance();
  });

  describe("approve", () => {
    it("sets status to 'accepted' and records respondedBy", async () => {
      const request = seedRequest({ id: "req-approve" });
      const repo = makeFakeChangeRequestRepo([request]);
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.approve("req-approve", "parent-2");

      expect(result).not.toBeNull();
      expect(result!.status).toBe("accepted");
      expect(result!.respondedBy).toBe("parent-2");
      expect(result!.id).toBe("req-approve");
    });

    it("returns null when request does not exist", async () => {
      const repo = makeFakeChangeRequestRepo([]);
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.approve("nonexistent", "parent-2");

      expect(result).toBeNull();
    });

    it("stores an optional responseNote", async () => {
      const request = seedRequest({ id: "req-approve-note" });
      const repo = makeFakeChangeRequestRepo([request]);
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.approve("req-approve-note", "parent-2", "Looks good");

      expect(result!.responseNote).toBe("Looks good");
    });
  });

  describe("decline", () => {
    it("sets status to 'declined' and records respondedBy", async () => {
      const request = seedRequest({ id: "req-decline" });
      const repo = makeFakeChangeRequestRepo([request]);
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.decline("req-decline", "parent-2");

      expect(result).not.toBeNull();
      expect(result!.status).toBe("declined");
      expect(result!.respondedBy).toBe("parent-2");
    });

    it("returns null when request does not exist", async () => {
      const repo = makeFakeChangeRequestRepo([]);
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.decline("nonexistent", "parent-2");

      expect(result).toBeNull();
    });

    it("stores an optional responseNote", async () => {
      const request = seedRequest({ id: "req-decline-note" });
      const repo = makeFakeChangeRequestRepo([request]);
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.decline("req-decline-note", "parent-2", "Not convenient");

      expect(result!.responseNote).toBe("Not convenient");
    });
  });

  describe("counter", () => {
    it("sets status to 'countered' and stores the responseNote", async () => {
      const request = seedRequest({ id: "req-counter" });
      const repo = makeFakeChangeRequestRepo([request]);
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.counter("req-counter", "parent-2", "How about next weekend?");

      expect(result).not.toBeNull();
      expect(result!.status).toBe("countered");
      expect(result!.respondedBy).toBe("parent-2");
      expect(result!.responseNote).toBe("How about next weekend?");
    });

    it("returns null when request does not exist", async () => {
      const repo = makeFakeChangeRequestRepo([]);
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.counter("nonexistent", "parent-2", "Note");

      expect(result).toBeNull();
    });
  });

  describe("withdraw", () => {
    it("returns true and sets status to 'withdrawn' when request is pending", async () => {
      const request = seedRequest({ id: "req-withdraw-pending", status: "pending" });
      const repo = makeFakeChangeRequestRepo([request]);
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.withdraw("req-withdraw-pending", "parent-1");

      expect(result).toBe(true);

      const updated = await repo.findById("req-withdraw-pending");
      expect(updated!.status).toBe("withdrawn");
    });

    it("returns false when request is already accepted", async () => {
      const request = seedRequest({ id: "req-withdraw-accepted", status: "accepted" });
      const repo = makeFakeChangeRequestRepo([request]);
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.withdraw("req-withdraw-accepted", "parent-1");

      expect(result).toBe(false);
    });

    it("returns false when request is already declined", async () => {
      const request = seedRequest({ id: "req-withdraw-declined", status: "declined" });
      const repo = makeFakeChangeRequestRepo([request]);
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.withdraw("req-withdraw-declined", "parent-1");

      expect(result).toBe(false);
    });

    it("returns false when request is already countered", async () => {
      const request = seedRequest({ id: "req-withdraw-countered", status: "countered" });
      const repo = makeFakeChangeRequestRepo([request]);
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.withdraw("req-withdraw-countered", "parent-1");

      expect(result).toBe(false);
    });

    it("returns false when request does not exist", async () => {
      const repo = makeFakeChangeRequestRepo([]);
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.withdraw("nonexistent", "parent-1");

      expect(result).toBe(false);
    });
  });
});
