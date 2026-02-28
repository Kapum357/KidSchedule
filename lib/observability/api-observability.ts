import { incrementCounter, observeDuration } from "@/lib/observability/metrics";
import { logEvent } from "@/lib/observability/logger";

interface ObserveApiRequestInput {
  route: string;
  method: string;
  status: number;
  durationMs: number;
}

export function observeApiRequest(input: ObserveApiRequestInput): void {
  observeDuration("api.request.duration", input.durationMs, {
    route: input.route,
    method: input.method,
    status: String(input.status),
  });

  if (input.status >= 500) {
    incrementCounter("error.count", 1, {
      source: "api",
      route: input.route,
      method: input.method,
      status: String(input.status),
    });
  }
}

export function observeApiException(route: string, method: string, error: unknown): void {
  incrementCounter("error.count", 1, {
    source: "api_exception",
    route,
    method,
  });

  logEvent("error", "Unhandled API exception", {
    route,
    method,
    error,
  });
}
