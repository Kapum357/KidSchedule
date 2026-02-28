/**
 * KidSchedule – PostgreSQL Client
 *
 * Database connection pool using postgres.js (porsager/postgres).
 * Optimized for serverless environments with connection pooling.
 *
 * Usage:
 *   import { sql } from "./client";
 *   const users = await sql`SELECT * FROM users WHERE id = ${id}`;
 */

import postgres from "postgres";
import { incrementCounter, observeDuration } from "@/lib/observability/metrics";
import { logEvent } from "@/lib/observability/logger";

// ─── Configuration ────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  logEvent("warn", "DATABASE_URL not set. Database operations will fail in production.", {
    source: "db",
  });
}

const parseSslMode = (connectionString?: string): string | undefined => {
  if (!connectionString) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(connectionString);
    return parsedUrl.searchParams.get("sslmode")?.toLowerCase();
  } catch (error) {
    logEvent("warn", "Unable to parse DATABASE_URL for sslmode", {
      source: "db",
      error,
    });
    return undefined;
  }
};

const sslMode = parseSslMode(DATABASE_URL);
const forceSsl =
  (process.env.DB_FORCE_SSL ?? process.env.POSTGRES_FORCE_SSL) === "true";
const shouldUseSsl =
  process.env.NODE_ENV === "production" ||
  forceSsl ||
  (sslMode && sslMode !== "disable");
const sslConfig = shouldUseSsl
  ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
    }
  : false;

// ─── Connection Pool ──────────────────────────────────────────────────────────

/**
 * Create a postgres connection pool.
 * In production, this uses connection pooling suitable for serverless.
 */
export const sql = DATABASE_URL
  ? postgres(DATABASE_URL, {
      // Connection pool settings
      max: Number(process.env.DATABASE_POOL_SIZE ?? 20),
      idle_timeout: 20,
      connect_timeout: Number(process.env.DATABASE_POOL_TIMEOUT ?? 30000) / 1000,

      // Transform snake_case columns to camelCase in results
      transform: {
        column: (column) => {
          // Convert snake_case to camelCase
          return column.replaceAll(/_([a-z])/g, (_, letter) =>
            letter.toUpperCase()
          );
        },
      },

      // SSL policy
      ssl: sslConfig,

      // Debug logging in development
      debug:
        process.env.NODE_ENV === "development" &&
        process.env.LOG_LEVEL === "debug"
          ? (connection, query, params) => {
              logEvent("debug", "SQL query", {
                source: "sql",
                connection,
                query,
                params,
              });
            }
          : undefined,
    })
  : // Mock SQL for build time when DATABASE_URL is not set
    ((() => {
      const mockSql = () => {
        throw new Error("DATABASE_URL not configured");
      };
      mockSql.begin = () => {
        throw new Error("DATABASE_URL not configured");
      };
      mockSql.end = async () => {};
      return mockSql;
    })() as unknown as postgres.Sql);

// ─── Health Check ─────────────────────────────────────────────────────────────

/**
 * Check if database is reachable.
 * Returns true if connection succeeds, false otherwise.
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  const startedAt = Date.now();

  try {
    await sql`SELECT 1 as ok`;
    observeDuration("db.query.duration", Date.now() - startedAt, {
      source: "db_connection_check",
      status: "ok",
    });
    return true;
  } catch (error) {
    observeDuration("db.query.duration", Date.now() - startedAt, {
      source: "db_connection_check",
      status: "error",
    });
    incrementCounter("error.count", 1, {
      source: "db_connection",
    });
    logEvent("error", "Database connection check failed", {
      source: "db",
      error,
    });
    return false;
  }
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

/**
 * Close all database connections.
 * Call this during app shutdown for graceful termination.
 */
export async function closeDatabaseConnection(): Promise<void> {
  if (DATABASE_URL) {
    await sql.end();
  }
}

// ─── Transaction Helper ───────────────────────────────────────────────────────

/**
 * Callable SQL type that works for both main connection and transactions.
 * Both postgres.Sql and postgres.TransactionSql can be called as template literals.
 */
export type SqlClient = postgres.Sql;

// For backwards compatibility
export type Transaction = postgres.TransactionSql;

/**
 * Execute operations within a transaction.
 * Automatically commits on success, rolls back on error.
 */
export async function withTransaction<T>(
  fn: (tx: postgres.TransactionSql) => T | Promise<T>
): Promise<T> {
  const result = await sql.begin(fn);
  return result as T;
}
