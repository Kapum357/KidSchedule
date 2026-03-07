/**
 * Unit tests for ChangeRequestMessageRepository methods:
 * create, findByRequestId
 *
 * Uses an in-memory fake implementation — no database required.
 */

import type {
  ChangeRequestMessageRepository,
  ScheduleChangeRequestRepository,
  UnitOfWork,
} from "@/lib/persistence/repositories";
import type { DbChangeRequestMessage } from "@/lib/persistence/types";
import { initDb, _test_resetDbInstance } from "@/lib/persistence";

// ─── In-Memory Fake ───────────────────────────────────────────────────────────

function makeFakeMessageRepo(): ChangeRequestMessageRepository {
  const store: DbChangeRequestMessage[] = [];
  let idCounter = 0;

  return {
    async findByRequestId(requestId) {
      return store
        .filter((m) => m.requestId === requestId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async create(msg) {
      idCounter += 1;
      const record: DbChangeRequestMessage = {
        ...msg,
        id: `msg-${idCounter}`,
        createdAt: (msg as { createdAt?: string }).createdAt ?? new Date().toISOString(),
      };
      store.push(record);
      return record;
    },
  };
}

function makeFakeChangeRequestRepo(): ScheduleChangeRequestRepository {
  const noop = async () => null as never;
  return {
    findById: noop,
    async findByFamilyId() { return []; },
    async findByFamilyIdAndStatus() { return []; },
    async findByRequestedBy() { return []; },
    async findPendingByFamilyId() { return []; },
    create: noop,
    approve: noop,
    decline: noop,
    counter: noop,
    async withdraw() { return false; },
  };
}

function makeMinimalUnitOfWork(
  messageRepo: ChangeRequestMessageRepository
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
    calendarEvents: noop,
    scheduleChangeRequests: makeFakeChangeRequestRepo(),
    changeRequestMessages: messageRepo,
    scheduleOverrides: noop,
    holidays: noop,
    holidayExceptionRules: noop,
    blogPosts: noop,
    schoolEvents: noop,
    volunteerTasks: noop,
    schoolContacts: noop,
    schoolVaultDocuments: noop,
    lunchMenus: noop,
    expenses: noop,
    messageThreads: noop,
    messages: noop,
    hashChainVerifications: noop,
    smsRelayParticipants: noop,
    moments: noop,
    momentReactions: noop,
    scheduledNotifications: noop,
    exportJobs: noop,
    stripeCustomers: noop,
    subscriptions: noop,
    webhookEvents: noop,
    planTiers: noop,
    exportMetadata: noop,
    exportMessageHashes: noop,
    exportVerificationAttempts: noop,
    mediationTopics: noop,
    mediationWarnings: noop,
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ChangeRequestMessageRepository", () => {
  beforeEach(() => {
    _test_resetDbInstance();
  });

  describe("create", () => {
    it("stores a message and returns it with an id and createdAt", async () => {
      const repo = makeFakeMessageRepo();
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.create({
        requestId: "req-1",
        familyId: "family-1",
        senderParentId: "parent-1",
        body: "Can we move this to Friday?",
      });

      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.requestId).toBe("req-1");
      expect(result.senderParentId).toBe("parent-1");
    });

    it("persists the body exactly as provided", async () => {
      const repo = makeFakeMessageRepo();
      await initDb(makeMinimalUnitOfWork(repo));

      const body = "Please let me know — thanks!";
      const result = await repo.create({
        requestId: "req-2",
        familyId: "family-1",
        senderParentId: "parent-2",
        body,
      });

      expect(result.body).toBe(body);
    });

    it("assigns unique ids to each created message", async () => {
      const repo = makeFakeMessageRepo();
      await initDb(makeMinimalUnitOfWork(repo));

      const msg1 = await repo.create({
        requestId: "req-1",
        familyId: "family-1",
        senderParentId: "parent-1",
        body: "First message",
      });
      const msg2 = await repo.create({
        requestId: "req-1",
        familyId: "family-1",
        senderParentId: "parent-2",
        body: "Second message",
      });

      expect(msg1.id).not.toBe(msg2.id);
    });
  });

  describe("findByRequestId", () => {
    it("returns an empty array for an unknown requestId", async () => {
      const repo = makeFakeMessageRepo();
      await initDb(makeMinimalUnitOfWork(repo));

      const result = await repo.findByRequestId("unknown-request");

      expect(result).toEqual([]);
    });

    it("returns only messages belonging to the given requestId", async () => {
      const repo = makeFakeMessageRepo();
      await initDb(makeMinimalUnitOfWork(repo));

      await repo.create({
        requestId: "req-A",
        familyId: "family-1",
        senderParentId: "parent-1",
        body: "Message for A",
      });
      await repo.create({
        requestId: "req-B",
        familyId: "family-1",
        senderParentId: "parent-2",
        body: "Message for B",
      });
      await repo.create({
        requestId: "req-A",
        familyId: "family-1",
        senderParentId: "parent-2",
        body: "Another for A",
      });

      const result = await repo.findByRequestId("req-A");

      expect(result).toHaveLength(2);
      expect(result.every((m) => m.requestId === "req-A")).toBe(true);
    });

    it("returns messages in ascending order by createdAt", async () => {
      const repo = makeFakeMessageRepo();
      await initDb(makeMinimalUnitOfWork(repo));

      // Insert messages with explicit createdAt values via create (order reflects insertion)
      await repo.create({ requestId: "req-order", familyId: "family-1", senderParentId: "parent-1", body: "First", createdAt: "2026-01-01T00:00:00.000Z" } as Omit<DbChangeRequestMessage, "id">);
      await repo.create({ requestId: "req-order", familyId: "family-1", senderParentId: "parent-2", body: "Second", createdAt: "2026-01-01T00:00:01.000Z" } as Omit<DbChangeRequestMessage, "id">);
      await repo.create({ requestId: "req-order", familyId: "family-1", senderParentId: "parent-1", body: "Third", createdAt: "2026-01-01T00:00:02.000Z" } as Omit<DbChangeRequestMessage, "id">);

      const result = await repo.findByRequestId("req-order");

      expect(result).toHaveLength(3);
      // Verify ascending order: each message's createdAt <= the next one's
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].createdAt <= result[i + 1].createdAt).toBe(true);
      }
      expect(result[0].body).toBe("First");
      expect(result[2].body).toBe("Third");
    });
  });
});
