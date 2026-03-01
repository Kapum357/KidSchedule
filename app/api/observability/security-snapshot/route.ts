import { NextResponse } from "next/server";
import { getSecurityMonitoringSnapshot } from "@/lib/observability/security-monitoring";

export const runtime = "nodejs";

/**
 * A simple JSON endpoint exposing the aggregated security metrics snapshot.
 *
 * This lets internal tooling (admin dashboards, alerting systems) fetch a
 * bundle of telemetry in one request without needing to call the individual
 * helpers separately.
 */
export async function GET(): Promise<NextResponse> {
  const snapshot = await getSecurityMonitoringSnapshot();
  return NextResponse.json(snapshot);
}
