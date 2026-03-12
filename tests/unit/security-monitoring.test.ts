import { db } from "@/lib/persistence";
import type { DbAuditLog } from "@/lib/persistence/types";
import {
  getSecurityMonitoringSnapshot,
  getFailedLoginAttemptsPerIp,
  getAccountLockoutsDailyCount,
  detectPasswordResetRequestSpike,
  getSessionHijackingAttempts,
  getSignupValidationErrorRate,
} from "@/lib/observability/security-monitoring";

describe("security-monitoring snapshot", () => {
  beforeEach(() => {
    // replace db.auditLogs.findByAction with a jest mock returning controlled data
    jest.spyOn(db.auditLogs, "findByAction").mockImplementation((action: string) => {
      // cast because our test fixtures are loosely typed
      return Promise.resolve((mockLogs[action] || []) as DbAuditLog[]);
    });

    jest.useFakeTimers({ now: 0, doNotFake: ["nextTick", "setImmediate"] });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const now = 0; // fake time
  const baseIso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

  const mockLogs: Record<string, unknown[]> = {
    "user.login_failed": [
      { action: "user.login_failed", ip: "1.1.1.1", timestamp: baseIso(-100) },
      { action: "user.login_failed", ip: "1.1.1.1", timestamp: baseIso(-50) },
      { action: "user.login_failed", ip: "2.2.2.2", timestamp: baseIso(-10) },
    ],
    "rate_limit.triggered": [
      // use positive offsets so the entry falls within the current UTC day
      { action: "rate_limit.triggered", timestamp: baseIso(1), metadata: { limitType: "email" } },
      { action: "rate_limit.triggered", timestamp: baseIso(1), metadata: { limitType: "ip" } },
    ],
    "user.password_reset_request": [
      { timestamp: baseIso(-10) },
      // this one should fall into the baseline window (older than 1h)
      { timestamp: baseIso(-4_000_000) },
    ],
    "security.suspicious_activity": [
      { action: "security.suspicious_activity", timestamp: baseIso(-100), metadata: { reason: "token_misuse" } },
      { action: "security.suspicious_activity", timestamp: baseIso(-10), metadata: { reason: "signup_validation_failed" } },
    ],
    "user.register": [
      { timestamp: baseIso(-10) },
    ],
  };

  it("aggregates all the individual metrics correctly", async () => {
    const snapshot = await getSecurityMonitoringSnapshot();

    expect(snapshot.failedLoginAttemptsPerIp).toEqual([
      { ip: "1.1.1.1", failedAttempts: 2 },
      { ip: "2.2.2.2", failedAttempts: 1 },
    ]);

    expect(snapshot.accountLockoutsDailyCount).toBe(1); // only the email lockout

    // password reset spike logic: baseline window empty so threshold is minAbsoluteThreshold (10)
    expect(snapshot.passwordResetSpike.isSpike).toBe(false);
    expect(snapshot.passwordResetSpike.currentWindowCount).toBe(1);

    expect(snapshot.sessionHijackingAttempts).toBe(1); // only token_misuse entry

    // signup failure rate = failures / (failures + successful)
    expect(snapshot.signupValidationErrorRate).toEqual({
      failures: 1,
      successfulRegistrations: 1,
      errorRate: 0.5,
    });
  });
});
