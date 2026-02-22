/**
 * KidSchedule – Persistence Layer
 *
 * Database access layer using the Repository pattern.
 * Provides a clean abstraction over the underlying database.
 *
 * Usage:
 *   import { db } from "@/lib/persistence";
 *   const user = await db.users.findByEmail("user@example.com");
 *
 * In production, swap the mock implementation with Prisma, Drizzle, or direct queries.
 */

import type { UnitOfWork } from "./repositories";

// Lazy import to avoid circular dependency issues
async function loadMockImplementation() {
  const { createMockUnitOfWork } = await import("./mock-implementation");
  return createMockUnitOfWork();
}

// ─── Database Instance ────────────────────────────────────────────────────────

let dbInstance: UnitOfWork | null = null;
let initPromise: Promise<UnitOfWork> | null = null;

/**
 * Returns the database unit of work instance.
 * In production, this would be initialized with a real database connection.
 */
export function getDatabase(): UnitOfWork {
  // Synchronous path for when already initialized
  if (dbInstance) {
    return dbInstance;
  }

  // Fallback synchronous initialization for SSR
  // In production, replace with actual database client initialization
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMockUnitOfWork } = require("./mock-implementation");
  const created = createMockUnitOfWork() as UnitOfWork;
  dbInstance = created;
  return created;
}

/**
 * Async initialization for production use with real database.
 * Call this during app startup.
 */
export async function initializeDatabase(): Promise<UnitOfWork> {
  if (dbInstance) return dbInstance;
  
  initPromise ??= loadMockImplementation().then((uow) => {
    dbInstance = uow;
    return uow;
  });
  
  const result = await initPromise;
  return result;
}

/**
 * Shorthand export for convenience.
 * Usage: import { db } from "@/lib/persistence";
 */
export const db = new Proxy({} as UnitOfWork, {
  get(_target, prop) {
    return getDatabase()[prop as keyof UnitOfWork];
  },
});

// Re-export types
export * from "./types";
export * from "./repositories";
