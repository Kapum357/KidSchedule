/**
 * KidSchedule – Holidays API Routes
 *
 * GET /api/holidays?familyId=X&jurisdiction=Y&startDate=Z&endDate=W
 *   - Retrieve system holidays by jurisdiction or custom holidays by family
 *   - Query parameters: familyId (optional), jurisdiction (optional), startDate (optional), endDate (optional)
 *   - Returns: DbHolidayDefinition[]
 *
 * POST /api/holidays
 *   - Create custom family-scoped holidays
 *   - Body: { name, date (YYYY-MM-DD), type, jurisdiction, description?, familyId }
 *   - Returns: DbHolidayDefinition
 */

export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { DbHolidayDefinition } from "@/lib/persistence/types";
import {
  getAuthenticatedUser,
  userBelongsToFamily,
} from "@/lib/auth";
import { getDb } from "@/lib/persistence";
import {
  badRequest,
  unauthorized,
  forbidden,
  internalError,
  tooManyRequests,
} from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/api/rate-limiting";
import { logEvent } from "@/lib/logging";
import { observeApiRequest } from "@/lib/observability";
import { generateRequestId } from "@/lib/api/request-id";
import { parseJson } from "@/lib/api/parse-json";
import { getQueryParam } from "@/lib/api/query-params";

interface CreateHolidayBody {
  name: string;
  date: string; // YYYY-MM-DD format
  type: "federal" | "state" | "religious" | "cultural" | "custom";
  jurisdiction: string;
  description?: string;
  familyId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = generateRequestId();

  try {
    // 1. Authenticate
    const user = await getAuthenticatedUser();
    if (!user) {
      logEvent("warn", "Holidays GET: unauthenticated request", {
        requestId,
      });
      return unauthorized("unauthenticated", "Authentication required");
    }

    // 2. Rate limit
    const rateLimitKey = `holidays:${user.userId}:read`;
    const rateLimit = checkRateLimit(rateLimitKey, 100, 3600); // 100 per hour
    if (!rateLimit.allowed) {
      logEvent("warn", "Holidays GET: rate limit exceeded", {
        requestId,
        userId: user.userId,
      });
      return tooManyRequests();
    }

    // 3. Parse query parameters
    const familyId = getQueryParam(request.nextUrl, "familyId");
    const jurisdiction = getQueryParam(request.nextUrl, "jurisdiction");
    const startDate = getQueryParam(request.nextUrl, "startDate");
    const endDate = getQueryParam(request.nextUrl, "endDate");

    // 4. Validate parameters (at least one filter should be provided)
    if (!familyId && !jurisdiction && !startDate) {
      return badRequest(
        "invalid_query",
        "Provide familyId (for custom holidays), jurisdiction (for system holidays), or startDate"
      );
    }

    const db = getDb();
    let holidays: DbHolidayDefinition[] = [];

    // 5. Get holidays based on filters
    if (familyId) {
      // Authorize family access
      const belongsToFamily = await userBelongsToFamily(user.userId, familyId);
      if (!belongsToFamily) {
        logEvent("warn", "Holidays GET: unauthorized family access", {
          requestId,
          userId: user.userId,
          familyId,
        });
        return forbidden(
          "not_family_member",
          "You do not belong to this family"
        );
      }

      // Get custom holidays for this family
      holidays = await db.holidays.findByFamily(familyId);
    } else if (jurisdiction && startDate && endDate) {
      // Get system holidays by jurisdiction and date range
      holidays = await db.holidays.findByDateRange(jurisdiction, startDate, endDate);
    } else if (jurisdiction) {
      // Get all holidays for jurisdiction (no date filter)
      holidays = await db.holidays.findByJurisdiction(jurisdiction);
    }

    logEvent("info", "Holidays retrieved", {
      requestId,
      userId: user.userId,
      familyId,
      jurisdiction,
      count: holidays.length,
    });

    observeApiRequest({
      route: "/api/holidays",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(holidays, { status: 200 });
  } catch (error) {
    logEvent("error", "Holidays GET error", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    observeApiRequest({
      route: "/api/holidays",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError();
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = generateRequestId();

  try {
    // 1. Authenticate
    const user = await getAuthenticatedUser();
    if (!user) {
      logEvent("warn", "Holidays POST: unauthenticated request", {
        requestId,
      });
      return unauthorized("unauthenticated", "Authentication required");
    }

    // 2. Rate limit
    const rateLimitKey = `holidays:${user.userId}:write`;
    const rateLimit = checkRateLimit(rateLimitKey, 20, 3600); // 20 per hour
    if (!rateLimit.allowed) {
      logEvent("warn", "Holidays POST: rate limit exceeded", {
        requestId,
        userId: user.userId,
      });
      return tooManyRequests();
    }

    // 3. Parse request body
    const parseResult = await parseJson<CreateHolidayBody>(request);
    if (!parseResult.success) {
      return badRequest("invalid_json", parseResult.error);
    }

    const body = parseResult.data;

    // 4. Validate required fields
    if (!body.name?.trim()) {
      return badRequest("invalid_request", "Holiday name is required");
    }
    if (!body.date?.trim()) {
      return badRequest("invalid_request", "Holiday date is required");
    }
    if (!body.type) {
      return badRequest("invalid_request", "Holiday type is required");
    }
    if (!body.jurisdiction?.trim()) {
      return badRequest("invalid_request", "Holiday jurisdiction is required");
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return badRequest(
        "invalid_request",
        "Holiday date must be in YYYY-MM-DD format"
      );
    }

    // Validate type
    const validTypes = [
      "federal",
      "state",
      "religious",
      "cultural",
      "custom",
    ];
    if (!validTypes.includes(body.type)) {
      return badRequest(
        "invalid_request",
        `Holiday type must be one of: ${validTypes.join(", ")}`
      );
    }

    // 5. Authorize family access (if creating custom holiday)
    if (body.familyId) {
      const belongsToFamily = await userBelongsToFamily(
        user.userId,
        body.familyId
      );
      if (!belongsToFamily) {
        logEvent("warn", "Holidays POST: unauthorized family access", {
          requestId,
          userId: user.userId,
          familyId: body.familyId,
        });
        return forbidden(
          "not_family_member",
          "You do not belong to this family"
        );
      }
    }

    // 6. Create holiday
    const db = getDb();
    const holiday = await db.holidays.create({
      name: body.name.trim(),
      date: body.date,
      type: body.type,
      jurisdiction: body.jurisdiction.trim(),
      description: body.description?.trim(),
      familyId: body.familyId,
    });

    logEvent("info", "Holiday created", {
      requestId,
      userId: user.userId,
      holidayId: holiday.id,
      familyId: body.familyId,
      type: body.type,
    });

    observeApiRequest({
      route: "/api/holidays",
      method: "POST",
      status: 201,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(holiday, { status: 201 });
  } catch (error) {
    logEvent("error", "Holidays POST error", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    observeApiRequest({
      route: "/api/holidays",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError();
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleGet(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handlePost(request);
}
