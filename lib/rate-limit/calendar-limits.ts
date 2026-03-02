/**
 * Calendar-specific rate limiting utilities.
 *
 * Lightweight in-memory implementation used for development and tests.
 * Production deployments may swap in a Redis-backed store by replacing
 * the functions in here or wrapping them behind an adapter.
 */

export type CalendarAction =
  | "createEvent"
  | "updateEvent"
  | "deleteEvent"
  | "submitChangeRequest"
  | "respondToChangeRequest";

export interface LimitConfig {
  requests: number;
  windowMs: number;
}

// default limits; mirrors documentation in CALENDAR_PERFORMANCE_SECURITY.md
export const LIMITS: Record<CalendarAction, LimitConfig> = {
  createEvent: { requests: 50, windowMs: 3600000 },
  updateEvent: { requests: 50, windowMs: 3600000 },
  deleteEvent: { requests: 50, windowMs: 3600000 },
  submitChangeRequest: { requests: 10, windowMs: 86400000 },
  respondToChangeRequest: { requests: 100, windowMs: 3600000 },
};

// in-memory store of counts; key is `${action}:${userId}`
interface RateRecord {
  count: number;
  expiresAt: number;
}
const store = new Map<string, RateRecord>();

/**
 * Check whether the given user/action is within configured limits.
 * Returns the remaining quota and reset timer.
 */
export function checkCalendarRateLimit(
  userId: string,
  action: CalendarAction
): { allowed: boolean; remaining: number; resetAfterMs: number } {
  const limit = LIMITS[action];
  const key = `${action}:${userId}`;
  const now = Date.now();

  const record = store.get(key);
  if (!record || record.expiresAt <= now) {
    // start new window
    store.set(key, { count: 1, expiresAt: now + limit.windowMs });
    return {
      allowed: true,
      remaining: limit.requests - 1,
      resetAfterMs: limit.windowMs,
    };
  }

  record.count += 1;
  store.set(key, record);

  const allowed = record.count <= limit.requests;
  const remaining = Math.max(0, limit.requests - record.count);
  const resetAfterMs = Math.max(0, record.expiresAt - now);
  return { allowed, remaining, resetAfterMs };
}

/**
 * Override a specific limit (useful in tests).
 */
export function setCalendarLimit(action: CalendarAction, config: LimitConfig) {
  LIMITS[action] = config;
}

/**
 * Reset all limits to their original defaults.
 * Only used by tests.
 */
export function resetCalendarLimits() {
  LIMITS.createEvent = { requests: 50, windowMs: 3600000 };
  LIMITS.updateEvent = { requests: 50, windowMs: 3600000 };
  LIMITS.deleteEvent = { requests: 50, windowMs: 3600000 };
  LIMITS.submitChangeRequest = { requests: 10, windowMs: 86400000 };
  LIMITS.respondToChangeRequest = { requests: 100, windowMs: 3600000 };
  store.clear();
}
