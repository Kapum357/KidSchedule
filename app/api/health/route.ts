/**
 * GET /health (and GET /api/health)
 * 
 * Health check endpoint for readiness/liveness probes.
 * Checks database connectivity and third-party service availability.
 */

import { NextResponse } from "next/server";
import { checkConnection } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

interface HealthCheck {
  name: string;
  status: "healthy" | "unhealthy" | "degraded";
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  checks: HealthCheck[];
  version?: string;
}

/**
 * Check database connectivity.
 */
async function checkDatabase(): Promise<HealthCheck> {
  const startedAt = Date.now();
  try {
    const isConnected = await checkConnection();
    const latencyMs = Date.now() - startedAt;

    if (isConnected) {
      return { name: "database", status: "healthy", latencyMs };
    } else {
      return { name: "database", status: "unhealthy", latencyMs, error: "Connection failed" };
    }
  } catch (error) {
    return {
      name: "database",
      status: "unhealthy",
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check Stripe API availability (basic ping).
 */
async function checkStripe(): Promise<HealthCheck> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { name: "stripe", status: "degraded", error: "Not configured" };
  }

  const startedAt = Date.now();
  try {
    // Simple check - just verify we can reach Stripe
    const response = await fetch("https://api.stripe.com/v1/", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      },
    });
    const latencyMs = Date.now() - startedAt;

    // Stripe returns 401 for unauthorized requests, but that still means API is reachable
    if (response.status !== 500 && response.status !== 502 && response.status !== 503) {
      return { name: "stripe", status: "healthy", latencyMs };
    } else {
      return { name: "stripe", status: "unhealthy", latencyMs, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    return {
      name: "stripe",
      status: "unhealthy",
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check Twilio API availability.
 */
async function checkTwilio(): Promise<HealthCheck> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return { name: "twilio", status: "degraded", error: "Not configured" };
  }

  const startedAt = Date.now();
  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      {
        method: "GET",
        headers: { Authorization: `Basic ${auth}` },
      }
    );
    const latencyMs = Date.now() - startedAt;

    if (response.ok) {
      return { name: "twilio", status: "healthy", latencyMs };
    } else {
      return { name: "twilio", status: "unhealthy", latencyMs, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    return {
      name: "twilio",
      status: "unhealthy",
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check Claude (Anthropic) API availability.
 */
async function checkClaude(): Promise<HealthCheck> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { name: "claude", status: "degraded", error: "Not configured" };
  }

  // For Claude, we just verify the API key format since there's no ping endpoint
  // We don't want to make actual API calls for health checks (costs money)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey.startsWith("sk-ant-")) {
    return { name: "claude", status: "healthy" };
  } else {
    return { name: "claude", status: "degraded", error: "Invalid API key format" };
  }
}

export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();

  try {
    // Run all health checks in parallel
    const [dbCheck, stripeCheck, twilioCheck, claudeCheck] = await Promise.all([
      checkDatabase(),
      checkStripe(),
      checkTwilio(),
      checkClaude(),
    ]);

    const checks = [dbCheck, stripeCheck, twilioCheck, claudeCheck];

    // Determine overall status
    const hasUnhealthy = checks.some((c) => c.status === "unhealthy");
    const hasDegraded = checks.some((c) => c.status === "degraded");

    // Database is critical - if it's down, overall status is unhealthy
    let overallStatus: "healthy" | "unhealthy" | "degraded";
    if (dbCheck.status === "unhealthy") {
      overallStatus = "unhealthy";
    } else if (hasUnhealthy) {
      overallStatus = "degraded";
    } else if (hasDegraded) {
      overallStatus = "degraded";
    } else {
      overallStatus = "healthy";
    }

    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
      version: process.env.APP_VERSION ?? process.env.npm_package_version ?? "unknown",
    };

    // Log unhealthy checks
    const unhealthyChecks = checks.filter((c) => c.status === "unhealthy");
    if (unhealthyChecks.length > 0) {
      logEvent("warn", "Health check found unhealthy services", {
        unhealthyServices: unhealthyChecks.map((c) => c.name),
        totalDurationMs: Date.now() - startedAt,
      });
    }

    const statusCode = overallStatus === "healthy" ? 200 : 503;
    return NextResponse.json(response, { status: statusCode });
  } catch (error) {
    logEvent("error", "Health check failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        checks: [],
        error: "Health check failed",
      },
      { status: 503 }
    );
  }
}
