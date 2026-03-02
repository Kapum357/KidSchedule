/**
 * GET /api/calendar/events/:id
 * PUT /api/calendar/events/:id
 * DELETE /api/calendar/events/:id
 *
 * GET: Retrieve a specific calendar event
 * PUT: Update a calendar event
 * DELETE: Delete a calendar event
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/persistence";
import {
  getAuthenticatedUser,
  userBelongsToFamily,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  internalError,
  tooManyRequests,
  isValidISODate,
  isValidEventCategory,
  isValidConfirmationStatus,
  parseJson,
  generateRequestId,
} from "../../utils";
import { checkCalendarRateLimit } from "@/lib/rate-limit/calendar-limits";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";

export const runtime = "nodejs";

// ─── GET Handler (Retrieve Event) ──────────────────────────────────────────────

async function handleGet(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = generateRequestId();
  const { id } = await params;

  try {
    // 1. Authenticate
    const user = await getAuthenticatedUser();
    if (!user) {
      return unauthorized("unauthenticated", "Authentication required");
    }

    // 2. Fetch event
    let event;
    try {
      event = await db.calendarEvents.findById(id);
    } catch (dbError) {
      logEvent("error", "Database error retrieving event", {
        requestId,
        userId: user.userId,
        eventId: id,
        error: dbError instanceof Error ? dbError.message : "unknown",
      });
      return internalError();
    }

    if (!event) {
      return notFound("event_not_found", "Calendar event not found");
    }

    // 3. Authorize – user must belong to family
    const belongsToFamily = await userBelongsToFamily(user.userId, event.familyId);
    if (!belongsToFamily) {
      logEvent("warn", "Unauthorized event access attempt", {
        requestId,
        userId: user.userId,
        familyId: event.familyId,
        eventId: id,
      });
      return forbidden("not_family_member", "You do not belong to this family");
    }

    logEvent("info", "Calendar event retrieved", {
      requestId,
      userId: user.userId,
      eventId: id,
      familyId: event.familyId,
    });

    observeApiRequest({
      route: "/api/calendar/events/:id",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(event, { status: 200 });
  } catch (error) {
    logEvent("error", "GET /api/calendar/events/:id error", {
      requestId,
      eventId: id,
      error: error instanceof Error ? error.message : "unknown",
    });

    observeApiRequest({
      route: "/api/calendar/events/:id",
      method: "GET",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError();
  }
}

// ─── PUT Handler (Update Event) ────────────────────────────────────────────────

interface UpdateEventBody {
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

async function handlePut(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = generateRequestId();
  const { id } = await params;

  try {
    // 1. Authenticate
    const user = await getAuthenticatedUser();
    if (!user) {
      return unauthorized("unauthenticated", "Authentication required");
    }

    // rate limiting: update requests
    const updateRate = checkCalendarRateLimit(user.userId, "updateEvent");
    if (!updateRate.allowed) {
      return tooManyRequests();
    }

    // 2. Fetch existing event
    let event;
    try {
      event = await db.calendarEvents.findById(id);
    } catch (dbError) {
      logEvent("error", "Database error retrieving event", {
        requestId,
        userId: user.userId,
        eventId: id,
        error: dbError instanceof Error ? dbError.message : "unknown",
      });
      return internalError();
    }

    if (!event) {
      return notFound("event_not_found", "Calendar event not found");
    }

    // 3. Authorize – user must belong to family
    const belongsToFamily = await userBelongsToFamily(user.userId, event.familyId);
    if (!belongsToFamily) {
      logEvent("warn", "Unauthorized event update attempt", {
        requestId,
        userId: user.userId,
        familyId: event.familyId,
        eventId: id,
      });
      return forbidden("not_family_member", "You do not belong to this family");
    }

    // 4. Parse request body
    const parseResult = await parseJson<UpdateEventBody>(request);
    if (!parseResult.success) {
      return badRequest("invalid_json", parseResult.error);
    }

    const {
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

    // 5. Validate fields if provided
    const updates: Partial<typeof event> = {};

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0) {
        return badRequest("invalid_title", "title must be a non-empty string");
      }
      updates.title = title.trim();
    }

    if (description !== undefined) {
      updates.description = description ? String(description).trim() : undefined;
    }

    if (category !== undefined) {
      if (!isValidEventCategory(category)) {
        return badRequest("invalid_category", "category must be one of: custody, school, medical, activity, holiday, other");
      }
      updates.category = category;
    }

    if (startAt !== undefined) {
      if (!isValidISODate(startAt)) {
        return badRequest("invalid_start_at", "startAt must be a valid ISO 8601 date");
      }
      updates.startAt = startAt;
    }

    if (endAt !== undefined) {
      if (!isValidISODate(endAt)) {
        return badRequest("invalid_end_at", "endAt must be a valid ISO 8601 date");
      }
      updates.endAt = endAt;
    }

    // Validate date range if both are provided or one is updated
    const finalStartAt = updates.startAt || event.startAt;
    const finalEndAt = updates.endAt || event.endAt;
    const startDate = new Date(finalStartAt);
    const endDate = new Date(finalEndAt);
    if (endDate < startDate) {
      return badRequest("invalid_date_range", "endAt must be after startAt");
    }

    if (allDay !== undefined) {
      updates.allDay = allDay === true;
    }

    if (location !== undefined) {
      updates.location = location ? String(location).trim() : undefined;
    }

    if (parentId !== undefined) {
      updates.parentId = parentId ? String(parentId) : undefined;
    }

    if (confirmationStatus !== undefined) {
      if (!isValidConfirmationStatus(confirmationStatus)) {
        return badRequest("invalid_confirmation_status", "confirmationStatus must be one of: confirmed, pending, declined");
      }
      updates.confirmationStatus = confirmationStatus;
    }

    // 6. Update event
    try {
      const updatedEvent = await db.calendarEvents.update(id, updates);

      if (!updatedEvent) {
        return internalError("update_failed", "Failed to update event");
      }

      logEvent("info", "Calendar event updated", {
        requestId,
        userId: user.userId,
        eventId: id,
        familyId: event.familyId,
        fieldsUpdated: Object.keys(updates),
      });

      observeApiRequest({
        route: "/api/calendar/events/:id",
        method: "PUT",
        status: 200,
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json(updatedEvent, { status: 200 });
    } catch (dbError) {
      logEvent("error", "Database error updating event", {
        requestId,
        userId: user.userId,
        eventId: id,
        error: dbError instanceof Error ? dbError.message : "unknown",
      });
      return internalError();
    }
  } catch (error) {
    logEvent("error", "PUT /api/calendar/events/:id error", {
      requestId,
      eventId: id,
      error: error instanceof Error ? error.message : "unknown",
    });

    observeApiRequest({
      route: "/api/calendar/events/:id",
      method: "PUT",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError();
  }
}

// ─── DELETE Handler (Delete Event) ────────────────────────────────────────────

async function handleDelete(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = generateRequestId();
  const { id } = await params;

  try {
    // 1. Authenticate
    const user = await getAuthenticatedUser();
    if (!user) {
      return unauthorized("unauthenticated", "Authentication required");
    }

    // rate limiting: deletions
    const deleteRate = checkCalendarRateLimit(user.userId, "deleteEvent");
    if (!deleteRate.allowed) {
      return tooManyRequests();
    }

    // 2. Fetch event to check ownership
    let event;
    try {
      event = await db.calendarEvents.findById(id);
    } catch (dbError) {
      logEvent("error", "Database error retrieving event", {
        requestId,
        userId: user.userId,
        eventId: id,
        error: dbError instanceof Error ? dbError.message : "unknown",
      });
      return internalError();
    }

    if (!event) {
      return notFound("event_not_found", "Calendar event not found");
    }

    // 3. Authorize – user must belong to family
    const belongsToFamily = await userBelongsToFamily(user.userId, event.familyId);
    if (!belongsToFamily) {
      logEvent("warn", "Unauthorized event deletion attempt", {
        requestId,
        userId: user.userId,
        familyId: event.familyId,
        eventId: id,
      });
      return forbidden("not_family_member", "You do not belong to this family");
    }

    // 4. Delete event
    try {
      const deleted = await db.calendarEvents.delete(id);

      if (!deleted) {
        return internalError("delete_failed", "Failed to delete event");
      }

      logEvent("info", "Calendar event deleted", {
        requestId,
        userId: user.userId,
        eventId: id,
        familyId: event.familyId,
      });

      observeApiRequest({
        route: "/api/calendar/events/:id",
        method: "DELETE",
        status: 204,
        durationMs: Date.now() - startedAt,
      });

      return new NextResponse(null, { status: 204 });
    } catch (dbError) {
      logEvent("error", "Database error deleting event", {
        requestId,
        userId: user.userId,
        eventId: id,
        error: dbError instanceof Error ? dbError.message : "unknown",
      });
      return internalError();
    }
  } catch (error) {
    logEvent("error", "DELETE /api/calendar/events/:id error", {
      requestId,
      eventId: id,
      error: error instanceof Error ? error.message : "unknown",
    });

    observeApiRequest({
      route: "/api/calendar/events/:id",
      method: "DELETE",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError();
  }
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return handleGet(request, context);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return handlePut(request, context);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return handleDelete(request, context);
}
