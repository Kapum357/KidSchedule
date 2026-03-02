/**
 * POST /api/calendar/events
 * GET /api/calendar/events?familyId=...&startAt=...&endAt=...
 *
 * POST: Create a new calendar event
 * GET: Retrieve calendar events for a date range
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/persistence";
import {
  getAuthenticatedUser,
  userBelongsToFamily,
  badRequest,
  unauthorized,
  forbidden,
  internalError,
  tooManyRequests,
  isValidISODate,
  isValidEventCategory,
  isValidConfirmationStatus,
  parseJson,
  generateRequestId,
  getQueryParam,
} from "../utils";
import { checkCalendarRateLimit } from "@/lib/rate-limit/calendar-limits";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";

export const runtime = "nodejs";

// ─── POST Handler (Create Event) ───────────────────────────────────────────────

interface CreateEventBody {
  familyId?: string;
  title?: string;
  description?: string;
  category?: string;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  location?: string;
  parentId?: string;
  confirmationStatus?: string;
}

async function handlePost(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = generateRequestId();

  try {
    // 1. Authenticate
    const user = await getAuthenticatedUser();
    if (!user) {
      return unauthorized("unauthenticated", "Authentication required");
    }

    // enforce rate limiting on event creation
    const createRate = checkCalendarRateLimit(user.userId, "createEvent");
    if (!createRate.allowed) {
      return tooManyRequests();
    }

    // 2. Parse request body
    const parseResult = await parseJson<CreateEventBody>(request);
    if (!parseResult.success) {
      return badRequest("invalid_json", parseResult.error);
    }

    const {
      familyId,
      title,
      description,
      category,
      startAt,
      endAt,
      allDay,
      location,
      parentId,
      confirmationStatus,
    } = parseResult.data;

    // 3. Validate required fields
    if (!familyId) {
      return badRequest("missing_family_id", "familyId is required");
    }

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return badRequest("invalid_title", "title must be a non-empty string");
    }

    if (!category || !isValidEventCategory(category)) {
      return badRequest("invalid_category", "category must be one of: custody, school, medical, activity, holiday, other");
    }

    if (!startAt || !isValidISODate(startAt)) {
      return badRequest("invalid_start_at", "startAt must be a valid ISO 8601 date");
    }

    if (!endAt || !isValidISODate(endAt)) {
      return badRequest("invalid_end_at", "endAt must be a valid ISO 8601 date");
    }

    // 4. Validate date range
    const startDate = new Date(startAt);
    const endDate = new Date(endAt);
    if (endDate < startDate) {
      return badRequest("invalid_date_range", "endAt must be after startAt");
    }

    // 5. Validate confirmation status
    const validConfirmationStatus = confirmationStatus && isValidConfirmationStatus(confirmationStatus)
      ? confirmationStatus
      : "pending";

    // 6. Authorize – user must belong to family
    const belongsToFamily = await userBelongsToFamily(user.userId, familyId);
    if (!belongsToFamily) {
      logEvent("warn", "Unauthorized event creation attempt", {
        requestId,
        userId: user.userId,
        familyId,
      });
      return forbidden("not_family_member", "You do not belong to this family");
    }

    // 7. Determine parent record for createdBy
    const parentRecord = await db.parents.findByUserId(user.userId);
    if (!parentRecord) {
      logEvent("error", "Parent record missing during event creation", {
        requestId,
        userId: user.userId,
        familyId,
      });
      return internalError("parent_lookup_failed", "Unable to resolve parent record");
    }

    // 8. Create event
    try {
      const event = await db.calendarEvents.create({
        familyId,
        title: title.trim(),
        description: description ? String(description).trim() : undefined,
        category,
        startAt,
        endAt,
        allDay: allDay === true,
        location: location ? String(location).trim() : undefined,
        parentId: parentId ? String(parentId) : undefined,
        confirmationStatus: validConfirmationStatus,
        createdBy: parentRecord.id,
      });

      logEvent("info", "Calendar event created", {
        requestId,
        userId: user.userId,
        familyId,
        eventId: event.id,
        category,
      });

      observeApiRequest({
        route: "/api/calendar/events",
        method: "POST",
        status: 201,
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json(event, { status: 201 });
    } catch (dbError) {
      logEvent("error", "Database error creating event", {
        requestId,
        userId: user.userId,
        error: dbError instanceof Error ? dbError.message : "unknown",
      });
      return internalError();
    }
  } catch (error) {
    logEvent("error", "POST /api/calendar/events error", {
      requestId,
      error: error instanceof Error ? error.message : "unknown",
    });

    observeApiRequest({
      route: "/api/calendar/events",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError();
  }
}

// ─── GET Handler (List Events) ─────────────────────────────────────────────────

async function handleGet(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = generateRequestId();

  try {
    // 1. Authenticate
    const user = await getAuthenticatedUser();
    if (!user) {
      return unauthorized("unauthenticated", "Authentication required");
    }

    // 2. Parse query parameters
    const url = new URL(request.url);
    const familyId = getQueryParam(url, "familyId");
    const startAtParam = getQueryParam(url, "startAt");
    const endAtParam = getQueryParam(url, "endAt");

    if (!familyId) {
      return badRequest("missing_family_id", "familyId query parameter is required");
    }

    // 3. Authorize – user must belong to family
    const belongsToFamily = await userBelongsToFamily(user.userId, familyId);
    if (!belongsToFamily) {
      return forbidden("not_family_member", "You do not belong to this family");
    }

    // 4. Validate and fetch events
    let events;
    try {
      if (startAtParam && endAtParam) {
        // Validate date parameters
        if (!isValidISODate(startAtParam) || !isValidISODate(endAtParam)) {
          return badRequest("invalid_dates", "startAt and endAt must be valid ISO 8601 dates");
        }

        const startDate = new Date(startAtParam);
        const endDate = new Date(endAtParam);
        if (endDate < startDate) {
          return badRequest("invalid_date_range", "endAt must be after startAt");
        }

        events = await db.calendarEvents.findByFamilyIdAndDateRange(
          familyId,
          startAtParam,
          endAtParam
        );
      } else {
        // Fetch all events for family
        events = await db.calendarEvents.findByFamilyId(familyId);
      }

      logEvent("info", "Calendar events retrieved", {
        requestId,
        userId: user.userId,
        familyId,
        count: events.length,
      });

      observeApiRequest({
        route: "/api/calendar/events",
        method: "GET",
        status: 200,
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json({ events, count: events.length }, { status: 200 });
    } catch (dbError) {
      logEvent("error", "Database error retrieving events", {
        requestId,
        userId: user.userId,
        error: dbError instanceof Error ? dbError.message : "unknown",
      });
      return internalError();
    }
  } catch (error) {
    logEvent("error", "GET /api/calendar/events error", {
      requestId,
      error: error instanceof Error ? error.message : "unknown",
    });

    observeApiRequest({
      route: "/api/calendar/events",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError();
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  return handlePost(request);
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleGet(request);
}
