/**
 * Database Query Performance Tests
 *
 * Tests database query performance and identifies optimization opportunities.
 * Uses mocked repositories to simulate database behavior and measure performance.
 */

import { initDb, _test_resetDbInstance } from "@/lib/persistence";
import type { UnitOfWork } from "@/lib/persistence/repositories";
import { observeDuration } from "@/lib/observability/metrics";

// Performance thresholds (in milliseconds)
const QUERY_TIMEOUT_MS = 5000; // Max time for any single query
const SLOW_QUERY_THRESHOLD_MS = 100; // Queries slower than this are considered slow
const VERY_SLOW_QUERY_THRESHOLD_MS = 500; // Queries slower than this need immediate attention

// Test data sizes for performance testing
const SMALL_DATASET = 10;
const MEDIUM_DATASET = 100;
const LARGE_DATASET = 1000;

// ─── Mock Data Setup ────────────────────────────────────────────────────────

interface TestFamily {
  id: string;
  parent1Id: string;
  parent2Id: string;
}

interface MockCalendarEvent {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  category: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location?: string;
  parentId?: string;
  confirmationStatus: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface MockMessage {
  id: string;
  threadId: string;
  familyId: string;
  senderId: string;
  body: string;
  sentAt: string;
  readAt?: string;
  attachmentIds?: string[];
  toneAnalysis?: any;
  messageHash: string;
  previousHash?: string;
  chainIndex: number;
  createdAt: string;
  updatedAt: string;
}

interface PerformanceResult {
  queryName: string;
  durationMs: number;
  isSlow: boolean;
  isVerySlow: boolean;
  datasetSize: number;
  notes?: string;
}

/**
 * Generate mock families for performance testing
 */
function generateMockFamilies(count: number): TestFamily[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `perf-family-${i}`,
    parent1Id: `perf-parent1-${i}`,
    parent2Id: `perf-parent2-${i}`,
  }));
}

/**
 * Generate mock calendar events for performance testing
 */
function generateMockEvents(familyId: string, count: number): MockCalendarEvent[] {
  const events: MockCalendarEvent[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const eventDate = new Date(now);
    eventDate.setDate(now.getDate() + (i % 30)); // Spread over 30 days

    events.push({
      id: `event-${familyId}-${i}`,
      familyId,
      title: `Test Event ${i}`,
      description: `Performance test event ${i} with some description text`,
      category: ["school", "medical", "activity", "other"][i % 4],
      startAt: eventDate.toISOString(),
      endAt: new Date(eventDate.getTime() + 60 * 60 * 1000).toISOString(), // 1 hour
      allDay: i % 5 === 0, // Every 5th event is all-day
      location: i % 3 === 0 ? `Location ${i}` : undefined,
      parentId: i % 2 === 0 ? `perf-parent1-${familyId.split('-')[2]}` : undefined,
      confirmationStatus: ["confirmed", "pending", "tentative"][i % 3],
      createdBy: `perf-parent1-${familyId.split('-')[2]}`,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  return events;
}

/**
 * Generate mock messages for performance testing
 */
function generateMockMessages(familyId: string, count: number): MockMessage[] {
  const messages: MockMessage[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const messageDate = new Date(now);
    messageDate.setMinutes(now.getMinutes() - (count - i) * 5); // Spread over time

    messages.push({
      id: `message-${familyId}-${i}`,
      threadId: `thread-${familyId}`,
      familyId,
      senderId: i % 2 === 0 ? `perf-parent1-${familyId.split('-')[2]}` : `perf-parent2-${familyId.split('-')[2]}`,
      body: `Test message ${i} with some content for performance testing`,
      sentAt: messageDate.toISOString(),
      readAt: i % 3 === 0 ? undefined : messageDate.toISOString(), // Some unread
      messageHash: `hash-${i}`,
      previousHash: i > 0 ? `hash-${i-1}` : undefined,
      chainIndex: i,
      createdAt: messageDate.toISOString(),
      updatedAt: messageDate.toISOString(),
    });
  }

  return messages;
}

/**
 * Create a mock UnitOfWork with simulated database performance
 */
function createMockUnitOfWork(datasetSize: number): UnitOfWork {
  const families = generateMockFamilies(datasetSize);
  const allEvents = families.flatMap(family =>
    generateMockEvents(family.id, Math.max(5, datasetSize / 10))
  );
  const allMessages = families.flatMap(family =>
    generateMockMessages(family.id, Math.max(3, datasetSize / 20))
  );

  // Simulate database query delays (realistic but fast for testing)
  const baseDelay = 5; // Base delay in ms
  const scalingFactor = Math.log10(datasetSize + 1) * 2; // Scale with data size

  const simulateDelay = (multiplier = 1) => {
    const delay = baseDelay + (scalingFactor * multiplier);
    return new Promise(resolve => setTimeout(resolve, delay));
  };

  return {
    users: {
      findByEmail: jest.fn().mockImplementation(async (email: string) => {
        await simulateDelay(0.5);
        const user = families.find(f => f.parent1Id + '@test.com' === email || f.parent2Id + '@test.com' === email);
        return user ? { id: user.parent1Id, email, name: 'Test User', role: 'parent' } : null;
      }),
      findById: jest.fn().mockImplementation(async (id: string) => {
        await simulateDelay(0.3);
        const user = families.find(f => f.parent1Id === id || f.parent2Id === id);
        return user ? { id, email: id + '@test.com', name: 'Test User', role: 'parent' } : null;
      }),
      create: jest.fn().mockResolvedValue({ id: 'new-user' }),
      update: jest.fn().mockResolvedValue({ id: 'updated-user' }),
    },

    calendarEvents: {
      findById: jest.fn().mockImplementation(async (id: string) => {
        await simulateDelay(0.3);
        return allEvents.find(e => e.id === id) || null;
      }),
      findByFamilyId: jest.fn().mockImplementation(async (familyId: string) => {
        await simulateDelay(1.0);
        return allEvents.filter(e => e.familyId === familyId);
      }),
      findByFamilyIdAndDateRange: jest.fn().mockImplementation(async (familyId: string, startAt: string, endAt: string) => {
        await simulateDelay(1.2);
        const start = new Date(startAt);
        const end = new Date(endAt);
        return allEvents.filter(e => {
          const eventStart = new Date(e.startAt);
          return e.familyId === familyId && eventStart >= start && eventStart <= end;
        });
      }),
      create: jest.fn().mockImplementation(async (event) => {
        await simulateDelay(0.8);
        return { ...event, id: 'new-event', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      }),
      update: jest.fn().mockResolvedValue({ id: 'updated-event' }),
    },

    messages: {
      findById: jest.fn().mockImplementation(async (id: string) => {
        await simulateDelay(0.3);
        return allMessages.find(m => m.id === id) || null;
      }),
      findByThreadId: jest.fn().mockImplementation(async (threadId: string) => {
        await simulateDelay(0.8);
        return allMessages.filter(m => m.threadId === threadId).sort((a, b) => a.chainIndex - b.chainIndex);
      }),
      findByFamilyId: jest.fn().mockImplementation(async (familyId: string) => {
        await simulateDelay(1.0);
        return allMessages.filter(m => m.familyId === familyId).sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
      }),
      findUnreadByFamilyId: jest.fn().mockImplementation(async (familyId: string) => {
        await simulateDelay(0.9);
        return allMessages.filter(m => m.familyId === familyId && !m.readAt).sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
      }),
      create: jest.fn().mockImplementation(async (message) => {
        await simulateDelay(0.7);
        return { ...message, id: 'new-message', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      }),
      update: jest.fn().mockResolvedValue({ id: 'updated-message' }),
    },

    // Mock other repositories with basic implementations
    families: {
      findById: jest.fn().mockResolvedValue({ id: 'family-1', name: 'Test Family' }),
      findByParentId: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'new-family' }),
      update: jest.fn().mockResolvedValue({ id: 'updated-family' }),
    },

    // Add other required repositories with minimal mocks
    sessions: {
      findById: jest.fn().mockResolvedValue(null),
      findByToken: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'new-session' }),
      update: jest.fn().mockResolvedValue({ id: 'updated-session' }),
      delete: jest.fn().mockResolvedValue(undefined),
    },

    passwordResets: {
      findById: jest.fn().mockResolvedValue(null),
      findByToken: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'new-reset' }),
      update: jest.fn().mockResolvedValue({ id: 'updated-reset' }),
      delete: jest.fn().mockResolvedValue(undefined),
    },

    phoneVerifications: {
      findById: jest.fn().mockResolvedValue(null),
      findByPhoneNumber: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'new-verification' }),
      update: jest.fn().mockResolvedValue({ id: 'updated-verification' }),
      delete: jest.fn().mockResolvedValue(undefined),
    },

    auditLogs: {
      findById: jest.fn().mockResolvedValue(null),
      findByUserId: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'new-audit' }),
    },

    rateLimits: {
      findById: jest.fn().mockResolvedValue(null),
      findByIdentifier: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'new-rate-limit' }),
      update: jest.fn().mockResolvedValue({ id: 'updated-rate-limit' }),
    },

    // Add remaining repositories with empty implementations
    parents: { findById: jest.fn().mockResolvedValue(null), findByFamilyId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    children: { findById: jest.fn().mockResolvedValue(null), findByFamilyId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    changeRequests: { findById: jest.fn().mockResolvedValue(null), findByFamilyId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    changeRequestMessages: { findById: jest.fn().mockResolvedValue(null), findByRequestId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    scheduleOverrides: { findById: jest.fn().mockResolvedValue(null), findByFamilyId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    holidays: { findById: jest.fn().mockResolvedValue(null), findAll: jest.fn().mockResolvedValue([]), findByDateRange: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    holidayExceptions: { findById: jest.fn().mockResolvedValue(null), findByHolidayId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    blogPosts: { findById: jest.fn().mockResolvedValue(null), findAll: jest.fn().mockResolvedValue([]), findPublished: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    schoolEvents: { findById: jest.fn().mockResolvedValue(null), findByFamilyId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    volunteerTasks: { findById: jest.fn().mockResolvedValue(null), findBySchoolEventId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    schoolContacts: { findById: jest.fn().mockResolvedValue(null), findBySchoolEventId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    schoolVaultDocuments: { findById: jest.fn().mockResolvedValue(null), findByFamilyId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    lunchMenus: { findById: jest.fn().mockResolvedValue(null), findBySchoolEventId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    expenses: { findById: jest.fn().mockResolvedValue(null), findByFamilyId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    messageThreads: { findById: jest.fn().mockResolvedValue(null), findByFamilyId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    hashChainVerifications: { findById: jest.fn().mockResolvedValue(null), findByMessageId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    smsRelays: { findById: jest.fn().mockResolvedValue(null), findByFamilyId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    moments: { findById: jest.fn().mockResolvedValue(null), findByFamilyId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    scheduledNotifications: { findById: jest.fn().mockResolvedValue(null), findPending: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    exportJobs: { findById: jest.fn().mockResolvedValue(null), findByUserId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    exportMetadata: { findById: jest.fn().mockResolvedValue(null), findByJobId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
    exportVerifications: { findById: jest.fn().mockResolvedValue(null), findByMetadataId: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
  } as any;
}

// ─── Performance Measurement Utilities ───────────────────────────────────────

/**
 * Measure query execution time with metrics collection
 */
async function measureQuery<T>(
  queryName: string,
  queryFn: () => Promise<T>,
  tags?: Record<string, string>
): Promise<{ result: T; durationMs: number }> {
  const startTime = performance.now();

  try {
    const result = await queryFn();
    const endTime = performance.now();
    const durationMs = endTime - startTime;

    // Record in metrics system
    observeDuration("db.query.duration", durationMs, {
      query: queryName,
      ...tags,
    });

    return { result, durationMs };
  } catch (error) {
    const endTime = performance.now();
    const durationMs = endTime - startTime;

    // Record failed query
    observeDuration("db.query.duration", durationMs, {
      query: queryName,
      status: "error",
      ...tags,
    });

    throw error;
  }
}

/**
 * Assert query performance meets thresholds
 */
function assertPerformance(
  queryName: string,
  durationMs: number,
  datasetSize: number
): PerformanceResult {
  const isSlow = durationMs > SLOW_QUERY_THRESHOLD_MS;
  const isVerySlow = durationMs > VERY_SLOW_QUERY_THRESHOLD_MS;

  const result: PerformanceResult = {
    queryName,
    durationMs,
    isSlow,
    isVerySlow,
    datasetSize,
  };

  if (isVerySlow) {
    result.notes = `VERY SLOW: ${durationMs.toFixed(2)}ms (> ${VERY_SLOW_QUERY_THRESHOLD_MS}ms threshold)`;
  } else if (isSlow) {
    result.notes = `Slow: ${durationMs.toFixed(2)}ms (> ${SLOW_QUERY_THRESHOLD_MS}ms threshold)`;
  }

  return result;
}

// ─── Query Performance Tests ────────────────────────────────────────────────

describe("Database Query Performance", () => {
  let mockDb: UnitOfWork;
  let testFamilies: TestFamily[] = [];

  beforeAll(async () => {
    // Use a reasonable dataset size for performance testing
    const datasetSize = MEDIUM_DATASET;
    testFamilies = generateMockFamilies(datasetSize);
    mockDb = createMockUnitOfWork(datasetSize);

    // Initialize with mock database
    await initDb(mockDb);
  }, 30000); // 30 second timeout for setup

  afterAll(async () => {
    _test_resetDbInstance();
  });

  describe("Calendar Event Queries", () => {
    it("findByFamilyId - small dataset", async () => {
      const family = testFamilies[0];

      const { durationMs } = await measureQuery(
        "calendar_events.findByFamilyId",
        () => mockDb.calendarEvents.findByFamilyId(family.id),
        { datasetSize: "small" }
      );

      const result = assertPerformance("findByFamilyId", durationMs, SMALL_DATASET);
      expect(durationMs).toBeLessThan(QUERY_TIMEOUT_MS);

      if (result.isVerySlow) {
        console.warn(`Performance issue: ${result.notes}`);
      }
    });

    it("findByFamilyIdAndDateRange - medium dataset", async () => {
      const family = testFamilies[0];
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1); // 1 month range

      const { durationMs } = await measureQuery(
        "calendar_events.findByFamilyIdAndDateRange",
        () => mockDb.calendarEvents.findByFamilyIdAndDateRange(
          family.id,
          startDate.toISOString(),
          endDate.toISOString()
        ),
        { datasetSize: "medium" }
      );

      const result = assertPerformance("findByFamilyIdAndDateRange", durationMs, MEDIUM_DATASET);
      expect(durationMs).toBeLessThan(QUERY_TIMEOUT_MS);

      if (result.isVerySlow) {
        console.warn(`Performance issue: ${result.notes}`);
      }
    });

    it("findById - indexed lookup", async () => {
      // First get an event ID
      const events = await mockDb.calendarEvents.findByFamilyId(testFamilies[0].id);
      assume(events.length > 0, "Need at least one test event");

      const { durationMs } = await measureQuery(
        "calendar_events.findById",
        () => mockDb.calendarEvents.findById(events[0].id),
        { indexed: "true" }
      );

      const result = assertPerformance("findById", durationMs, 1);
      expect(durationMs).toBeLessThan(SLOW_QUERY_THRESHOLD_MS); // Should be very fast

      if (result.isSlow) {
        console.warn(`Performance issue: Indexed lookup is slow: ${result.notes}`);
      }
    });
  });

  describe("Message Queries", () => {
    it("findByFamilyId - message retrieval", async () => {
      const family = testFamilies[0];

      const { durationMs } = await measureQuery(
        "messages.findByFamilyId",
        () => mockDb.messages.findByFamilyId(family.id),
        { datasetSize: "small" }
      );

      const result = assertPerformance("findByFamilyId", durationMs, SMALL_DATASET);
      expect(durationMs).toBeLessThan(QUERY_TIMEOUT_MS);

      if (result.isVerySlow) {
        console.warn(`Performance issue: ${result.notes}`);
      }
    });

    it("findUnreadByFamilyId - filtered query", async () => {
      const family = testFamilies[0];

      const { durationMs } = await measureQuery(
        "messages.findUnreadByFamilyId",
        () => mockDb.messages.findUnreadByFamilyId(family.id),
        { filtered: "true" }
      );

      const result = assertPerformance("findUnreadByFamilyId", durationMs, SMALL_DATASET);
      expect(durationMs).toBeLessThan(QUERY_TIMEOUT_MS);

      if (result.isVerySlow) {
        console.warn(`Performance issue: ${result.notes}`);
      }
    });
  });

  describe("Complex Aggregations", () => {
    it("Dashboard-style aggregation query", async () => {
      const family = testFamilies[0];

      const { durationMs } = await measureQuery(
        "dashboard.calendar_aggregation",
        async () => {
          // Simulate dashboard calendar aggregation
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

          // Mock aggregation logic
          const events = await mockDb.calendarEvents.findByFamilyIdAndDateRange(
            family.id,
            monthStart.toISOString(),
            monthEnd.toISOString()
          );

          // Simulate GROUP BY logic
          const dailyCounts: Record<string, { total: number; school: number; medical: number }> = {};

          for (const event of events) {
            const dateKey = new Date(event.startAt).toISOString().split('T')[0];
            if (!dailyCounts[dateKey]) {
              dailyCounts[dateKey] = { total: 0, school: 0, medical: 0 };
            }
            dailyCounts[dateKey].total++;
            if (event.category === 'school') dailyCounts[dateKey].school++;
            if (event.category === 'medical') dailyCounts[dateKey].medical++;
          }

          return Object.entries(dailyCounts).map(([date, counts]) => ({
            event_date: date,
            event_count: counts.total,
            school_events: counts.school,
            medical_events: counts.medical,
          }));
        },
        { aggregation: "monthly_calendar" }
      );

      const result = assertPerformance("dashboard.calendar_aggregation", durationMs, MEDIUM_DATASET);
      expect(durationMs).toBeLessThan(QUERY_TIMEOUT_MS);

      if (result.isVerySlow) {
        console.warn(`Performance issue: ${result.notes}`);
      }
    });

    it("Message thread with hash chain query", async () => {
      const family = testFamilies[0];

      const { durationMs } = await measureQuery(
        "messages.with_hash_chain",
        async () => {
          // Simulate complex message query with joins
          const messages = await mockDb.messages.findByFamilyId(family.id);

          // Simulate JOIN with users (mock user data)
          return messages.map(message => ({
            ...message,
            sender_name: `User ${message.senderId}`,
          }));
        },
        { joins: "users", ordered: "chain_index" }
      );

      const result = assertPerformance("messages.with_hash_chain", durationMs, SMALL_DATASET);
      expect(durationMs).toBeLessThan(QUERY_TIMEOUT_MS);

      if (result.isVerySlow) {
        console.warn(`Performance issue: ${result.notes}`);
      }
    });
  });

  describe("Concurrent Load Simulation", () => {
    it("Multiple concurrent family queries", async () => {
      const concurrency = 5;
      const familyIds = testFamilies.slice(0, concurrency).map(f => f.id);

      const startTime = performance.now();

      const promises = familyIds.map(familyId =>
        measureQuery(
          "concurrent.calendar_events.findByFamilyId",
          () => mockDb.calendarEvents.findByFamilyId(familyId),
          { concurrent: "true" }
        )
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();
      const totalDuration = endTime - startTime;
      const avgDuration = totalDuration / concurrency;

      console.log(`Concurrent load: ${concurrency} queries, total=${totalDuration.toFixed(2)}ms, avg=${avgDuration.toFixed(2)}ms`);

      // Each query should complete within timeout
      results.forEach((result, i) => {
        expect(result.durationMs).toBeLessThan(QUERY_TIMEOUT_MS);
      });

      // Average should be reasonable
      expect(avgDuration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS * 2);
    });
  });
});

// ─── Performance Analysis Helpers ───────────────────────────────────────────

/**
 * Jest helper for assumptions in tests
 */
function assume(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assumption failed: ${message}`);
  }
}

/**
 * Export performance results for external analysis
 */
export function getPerformanceSummary(results: PerformanceResult[]) {
  const slowQueries = results.filter(r => r.isSlow);
  const verySlowQueries = results.filter(r => r.isVerySlow);

  return {
    totalQueries: results.length,
    slowQueries: slowQueries.length,
    verySlowQueries: verySlowQueries.length,
    averageDuration: results.reduce((sum, r) => sum + r.durationMs, 0) / results.length,
    recommendations: generateRecommendations(results),
  };
}

/**
 * Generate optimization recommendations based on performance results
 */
function generateRecommendations(results: PerformanceResult[]): string[] {
  const recommendations: string[] = [];
  const verySlowQueries = results.filter(r => r.isVerySlow);
  const slowQueries = results.filter(r => r.isSlow && !r.isVerySlow);

  if (verySlowQueries.length > 0) {
    recommendations.push(`🚨 CRITICAL: ${verySlowQueries.length} queries exceed ${VERY_SLOW_QUERY_THRESHOLD_MS}ms threshold and need immediate optimization`);
    verySlowQueries.forEach(q => {
      recommendations.push(`  - ${q.queryName}: ${q.durationMs.toFixed(2)}ms`);
    });
  }

  if (slowQueries.length > 0) {
    recommendations.push(`⚠️  WARNING: ${slowQueries.length} queries exceed ${SLOW_QUERY_THRESHOLD_MS}ms threshold`);
    slowQueries.forEach(q => {
      recommendations.push(`  - ${q.queryName}: ${q.durationMs.toFixed(2)}ms`);
    });
  }

  if (recommendations.length === 0) {
    recommendations.push("✅ All queries meet performance thresholds");
  }

  // Add specific recommendations
  const hasAggregationQueries = results.some(r => r.queryName.includes("aggregation"));
  if (hasAggregationQueries) {
    recommendations.push("💡 Consider adding database indexes for frequently aggregated columns");
  }

  const hasJoinQueries = results.some(r => r.queryName.includes("hash_chain") || r.queryName.includes("join"));
  if (hasJoinQueries) {
    recommendations.push("💡 Review JOIN queries for potential optimization or denormalization");
  }

  return recommendations;
}