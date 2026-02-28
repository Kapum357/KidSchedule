import { getMetricCount } from "@/lib/observability/metrics";

export interface AlertStatus {
  id: "high_error_rate" | "database_connection_failures";
  triggered: boolean;
  threshold: string;
  observed: string;
}

export interface AlertEvaluation {
  timestamp: string;
  windowMs: number;
  alerts: AlertStatus[];
}

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

export function evaluateObservabilityAlerts(windowMs = DEFAULT_WINDOW_MS): AlertEvaluation {
  const requestCount = getMetricCount("api.request.duration", windowMs);
  const errorCount = getMetricCount("error.count", windowMs);
  const errorRate = requestCount === 0 ? 0 : errorCount / requestCount;

  const dbConnectionFailures = getMetricCount("error.count", windowMs, {
    source: "db_connection",
  });

  return {
    timestamp: new Date().toISOString(),
    windowMs,
    alerts: [
      {
        id: "high_error_rate",
        triggered: errorRate > 0.01,
        threshold: "> 1%",
        observed: `${(errorRate * 100).toFixed(2)}%`,
      },
      {
        id: "database_connection_failures",
        triggered: dbConnectionFailures > 0,
        threshold: "> 0 failures",
        observed: `${dbConnectionFailures} failures`,
      },
    ],
  };
}
