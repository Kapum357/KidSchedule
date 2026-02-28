import { performance } from "node:perf_hooks";
import { sql } from "@/lib/persistence/postgres";
import { incrementCounter, observeDuration } from "@/lib/observability/metrics";

type ActiveUsersRow = { count: number };
type RevenueRow = { amount: number };
type TokenRow = { total: number };

export interface DashboardAnalytics {
  activeUsers: number;
  subscriptionRevenueCents: number;
  aiTokenUsage30d: number;
}

async function withDbQueryMetric<T>(operation: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();

  try {
    return await operation();
  } catch (error) {
    incrementCounter("error.count", 1, { source: "db_query" });
    throw error;
  } finally {
    observeDuration("db.query.duration", performance.now() - startedAt, {
      source: "dashboard_analytics",
    });
  }
}

export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  const [activeUsersRows, revenueRows, tokenRows] = await withDbQueryMetric(() =>
    Promise.all([
      sql<ActiveUsersRow[]>`
        SELECT COUNT(DISTINCT user_id)::int AS count
        FROM sessions
        WHERE is_revoked = FALSE
          AND expires_at > NOW()
      `,
      sql<RevenueRow[]>`
        SELECT COALESCE(SUM(amount_paid), 0)::bigint AS amount
        FROM invoices
        WHERE status = 'paid'
          AND COALESCE(paid_at, created_at) >= date_trunc('month', NOW())
      `,
      sql<TokenRow[]>`
        SELECT COALESCE(SUM(
          (CASE WHEN COALESCE(metadata->>'ai_tokens', '') ~ '^[0-9]+$' THEN (metadata->>'ai_tokens')::bigint ELSE 0 END) +
          (CASE WHEN COALESCE(metadata->>'token_usage', '') ~ '^[0-9]+$' THEN (metadata->>'token_usage')::bigint ELSE 0 END) +
          (CASE WHEN COALESCE(metadata->>'input_tokens', '') ~ '^[0-9]+$' THEN (metadata->>'input_tokens')::bigint ELSE 0 END) +
          (CASE WHEN COALESCE(metadata->>'output_tokens', '') ~ '^[0-9]+$' THEN (metadata->>'output_tokens')::bigint ELSE 0 END)
        ), 0)::bigint AS total
        FROM audit_logs
        WHERE timestamp >= NOW() - INTERVAL '30 days'
      `,
    ])
  );

  return {
    activeUsers: activeUsersRows[0]?.count ?? 0,
    subscriptionRevenueCents: revenueRows[0]?.amount ?? 0,
    aiTokenUsage30d: tokenRows[0]?.total ?? 0,
  };
}
