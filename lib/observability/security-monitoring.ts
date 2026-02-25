/**
 * KidSchedule – Security Monitoring
 *
 * Server-side monitoring utilities for security telemetry and alerting.
 *
 * Coverage:
 *  1) Failed login attempts per IP
 *  2) Account lockouts (daily count)
 *  3) Password reset requests (spike detection)
 *  4) Session hijacking attempts (token misuse)
 */

import { db } from "../persistence";
import type { DbAuditLog } from "../persistence/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FailedLoginByIpMetric {
  ip: string;
  failedAttempts: number;
}

export interface PasswordResetSpikeResult {
  isSpike: boolean;
  currentWindowCount: number;
  baselineWindowCount: number;
  threshold: number;
}

export interface SecurityMonitoringSnapshot {
  failedLoginAttemptsPerIp: FailedLoginByIpMetric[];
  accountLockoutsDailyCount: number;
  passwordResetSpike: PasswordResetSpikeResult;
  sessionHijackingAttempts: number;
  signupValidationErrorRate: SignupValidationErrorRate;
}

export interface SignupValidationErrorRate {
  failures: number;
  successfulRegistrations: number;
  errorRate: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toMs(dateIso: string): number {
  return new Date(dateIso).getTime();
}

function inWindow(log: DbAuditLog, fromMs: number, toMsValue: number): boolean {
  const t = toMs(log.timestamp);
  return t >= fromMs && t <= toMsValue;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isEmailLockout(log: DbAuditLog): boolean {
  const metadata = log.metadata ?? {};
  const limitType = asString(metadata.limitType);
  return log.action === "rate_limit.triggered" && limitType === "email";
}

function isTokenMisuseEvent(log: DbAuditLog): boolean {
  if (log.action !== "security.suspicious_activity") return false;
  const metadata = log.metadata ?? {};
  const reason = asString(metadata.reason)?.toLowerCase();
  return reason?.includes("token_misuse") ?? false;
}

function isSignupValidationFailure(log: DbAuditLog): boolean {
  if (log.action !== "security.suspicious_activity") return false;
  const metadata = log.metadata ?? {};
  const reason = asString(metadata.reason)?.toLowerCase();
  return reason === "signup_validation_failed";
}

function sortMetricsDesc(metrics: FailedLoginByIpMetric[]): FailedLoginByIpMetric[] {
  return [...metrics].sort((a, b) => b.failedAttempts - a.failedAttempts);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Count failed login attempts grouped by source IP within a time window.
 */
export async function getFailedLoginAttemptsPerIp(
  windowMs = 24 * 60 * 60 * 1000,
  limit = 10
): Promise<FailedLoginByIpMetric[]> {
  const now = Date.now();
  const from = now - windowMs;

  const logs = await db.auditLogs.findByAction("user.login_failed", 5000);
  const counts = new Map<string, number>();

  for (const log of logs) {
    if (!log.ip || !inWindow(log, from, now)) continue;
    counts.set(log.ip, (counts.get(log.ip) ?? 0) + 1);
  }

  const metrics = Array.from(counts.entries()).map(([ip, failedAttempts]) => ({
    ip,
    failedAttempts,
  }));

  return sortMetricsDesc(metrics).slice(0, limit);
}

/**
 * Count account lockouts (email-based lockouts) for the current UTC day.
 */
export async function getAccountLockoutsDailyCount(reference = new Date()): Promise<number> {
  const dayStart = Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    reference.getUTCDate(),
    0,
    0,
    0,
    0
  );
  const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;

  const logs = await db.auditLogs.findByAction("rate_limit.triggered", 5000);
  let count = 0;

  for (const log of logs) {
    if (!inWindow(log, dayStart, dayEnd)) continue;
    if (isEmailLockout(log)) count += 1;
  }

  return count;
}

/**
 * Detect spikes in password reset requests.
 *
 * Strategy:
 *  - current window: [now - windowMs, now]
 *  - baseline window: [now - 2*windowMs, now - windowMs]
 *  - spike if current > max(minAbsoluteThreshold, baseline * multiplier)
 */
export async function detectPasswordResetRequestSpike(options?: {
  windowMs?: number;
  multiplier?: number;
  minAbsoluteThreshold?: number;
}): Promise<PasswordResetSpikeResult> {
  const windowMs = options?.windowMs ?? 60 * 60 * 1000; // 1h
  const multiplier = options?.multiplier ?? 2.5;
  const minAbsoluteThreshold = options?.minAbsoluteThreshold ?? 10;

  const now = Date.now();
  const currentFrom = now - windowMs;
  const baselineFrom = now - 2 * windowMs;
  const baselineTo = currentFrom - 1;

  const logs = await db.auditLogs.findByAction("user.password_reset_request", 5000);

  let currentWindowCount = 0;
  let baselineWindowCount = 0;

  for (const log of logs) {
    const ts = toMs(log.timestamp);
    if (ts >= currentFrom && ts <= now) {
      currentWindowCount += 1;
      continue;
    }
    if (ts >= baselineFrom && ts <= baselineTo) {
      baselineWindowCount += 1;
    }
  }

  const threshold = Math.max(minAbsoluteThreshold, Math.ceil(baselineWindowCount * multiplier));

  return {
    isSpike: currentWindowCount > threshold,
    currentWindowCount,
    baselineWindowCount,
    threshold,
  };
}

/**
 * Count token misuse suspicious events (session hijacking signal).
 */
export async function getSessionHijackingAttempts(
  windowMs = 24 * 60 * 60 * 1000
): Promise<number> {
  const now = Date.now();
  const from = now - windowMs;

  const logs = await db.auditLogs.findByAction("security.suspicious_activity", 5000);
  let count = 0;

  for (const log of logs) {
    if (!inWindow(log, from, now)) continue;
    if (isTokenMisuseEvent(log)) count += 1;
  }

  return count;
}

/**
 * Calculates signup validation error rate for a rolling window.
 */
export async function getSignupValidationErrorRate(
  windowMs = 60 * 60 * 1000
): Promise<SignupValidationErrorRate> {
  const now = Date.now();
  const from = now - windowMs;

  const [suspiciousLogs, registerLogs] = await Promise.all([
    db.auditLogs.findByAction("security.suspicious_activity", 5000),
    db.auditLogs.findByAction("user.register", 5000),
  ]);

  const failures = suspiciousLogs.filter(
    (log) => inWindow(log, from, now) && isSignupValidationFailure(log)
  ).length;

  const successfulRegistrations = registerLogs.filter((log) => inWindow(log, from, now)).length;
  const denominator = failures + successfulRegistrations;
  const errorRate = denominator === 0 ? 0 : failures / denominator;

  return {
    failures,
    successfulRegistrations,
    errorRate,
  };
}

/**
 * Aggregate all core security monitoring metrics in one call.
 */
export async function getSecurityMonitoringSnapshot(): Promise<SecurityMonitoringSnapshot> {
  const [
    failedLoginAttemptsPerIp,
    accountLockoutsDailyCount,
    passwordResetSpike,
    sessionHijackingAttempts,
    signupValidationErrorRate,
  ] = await Promise.all([
    getFailedLoginAttemptsPerIp(),
    getAccountLockoutsDailyCount(),
    detectPasswordResetRequestSpike(),
    getSessionHijackingAttempts(),
    getSignupValidationErrorRate(),
  ]);

  return {
    failedLoginAttemptsPerIp,
    accountLockoutsDailyCount,
    passwordResetSpike,
    sessionHijackingAttempts,
    signupValidationErrorRate,
  };
}
