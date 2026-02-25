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
 * The persistence layer uses PostgreSQL in production via postgres.js.
 */

import type { UnitOfWork } from "./repositories";
import { createPostgresUnitOfWork, checkDatabaseConnection } from "./postgres";

// ─── Database Instance ────────────────────────────────────────────────────────

/**
 * Singleton database instance.
 * Lazily initialized on first access.
 */
let _dbInstance: UnitOfWork | null = null;

/**
 * Returns the database unit of work instance.
 * Initializes with PostgreSQL on first call.
 */
export function getDb(): UnitOfWork {
  if (!_dbInstance) {
    _dbInstance = createPostgresUnitOfWork();
  }
  return _dbInstance;
}

/**
 * Explicitly initialize the database with a custom UnitOfWork.
 * Useful for testing or custom configurations.
 */
export async function initDb(uow: UnitOfWork): Promise<void> {
  _dbInstance = uow;
}

/**
 * Check database connection health.
 * Returns true if connected, false otherwise.
 */
export async function checkConnection(): Promise<boolean> {
  return await checkDatabaseConnection();
}

/**
 * Shorthand export for convenience.
 * Usage: import { db } from "@/lib/persistence";
 * 
 * This is a Proxy that lazily initializes the database on first access.
 */
export const db = new Proxy({} as UnitOfWork, {
  get(_target, prop) {
    const instance = getDb();
    return instance[prop as keyof UnitOfWork];
  },
});

// Re-export types
export * from "./types";
export * from "./repositories";
