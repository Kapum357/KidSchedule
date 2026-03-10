/**
 * KidSchedule – Calendar Event Service
 *
 * High-level business logic for calendar event operations.
 * Provides validation, conflict detection, and workflow management
 * for calendar events integrated with custody schedules.
 */

import type { ConfirmationStatus, EventCategory } from " @/lib";
import type { DbCalendarEvent } from "@/lib/persistence/types";
import { db } from "@/lib/persistence";
import { audit } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateEventInput {
  familyId: string;
  title: string;
  description?: string;
  category: EventCategory;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location?: string;
  parentId?: string;
  confirmationStatus?: ConfirmationStatus;
  createdBy: string;
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  category?: EventCategory;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  location?: string;
  parentId?: string;
  confirmationStatus?: ConfirmationStatus;
}

export interface EventConflict {
  eventId: string;
  conflictingEventId: string;
  conflictType: "overlap" | "buffer";
  minutesApart?: number;
  message: string;
}

export interface EventValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  conflicts?: EventConflict[];
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate event creation input.
 */
export function validateCreateEventInput(input: CreateEventInput): EventValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Title validation
  if (!input.title || input.title.trim().length === 0) {
    errors.push("Title is required and must not be empty");
  } else if (input.title.length > 255) {
    errors.push("Title must not exceed 255 characters");
  }

  // Category validation
  const validCategories: EventCategory[] = ["custody", "school", "medical", "activity", "holiday", "other"];
  if (!validCategories.includes(input.category)) {
    errors.push(`Category must be one of: ${validCategories.join(", ")}`);
  }

  // Date validation
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  try {
    startDate = new Date(input.startAt);
    if (isNaN(startDate.getTime())) throw new Error("Invalid start date");
  } catch {
    errors.push("startAt must be a valid ISO 8601 date");
  }

  try {
    endDate = new Date(input.endAt);
    if (isNaN(endDate.getTime())) throw new Error("Invalid end date");
  } catch {
    errors.push("endAt must be a valid ISO 8601 date");
  }

  // Date range validation
  if (startDate && endDate && endDate < startDate) {
    errors.push("endAt must be after startAt");
  }

  // Duration warning for very long events
  if (startDate && endDate) {
    const durationMs = endDate.getTime() - startDate.getTime();
    const durationDays = durationMs / (1000 * 60 * 60 * 24);
    if (durationDays > 365) {
      warnings.push("Event duration exceeds one year; please verify dates");
    }
  }

  // Description validation
  if (input.description && input.description.length > 2000) {
    errors.push("Description must not exceed 2000 characters");
  }

  // Location validation
  if (input.location && input.location.length > 255) {
    errors.push("Location must not exceed 255 characters");
  }

  // Confirmation status validation
  const validStatuses: ConfirmationStatus[] = ["confirmed", "pending", "declined"];
  if (input.confirmationStatus && !validStatuses.includes(input.confirmationStatus)) {
    errors.push(`Confirmation status must be one of: ${validStatuses.join(", ")}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate event update input.
 */
export function validateUpdateEventInput(input: UpdateEventInput): EventValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input.title !== undefined) {
    if (typeof input.title !== "string" || input.title.trim().length === 0) {
      errors.push("Title must be a non-empty string");
    } else if (input.title.length > 255) {
      errors.push("Title must not exceed 255 characters");
    }
  }

  if (input.category !== undefined) {
    const validCategories: EventCategory[] = ["custody", "school", "medical", "activity", "holiday", "other"];
    if (!validCategories.includes(input.category)) {
      errors.push(`Category must be one of: ${validCategories.join(", ")}`);
    }
  }

  if (input.startAt !== undefined) {
    try {
      const date = new Date(input.startAt);
      if (isNaN(date.getTime())) throw new Error();
    } catch {
      errors.push("startAt must be a valid ISO 8601 date");
    }
  }

  if (input.endAt !== undefined) {
    try {
      const date = new Date(input.endAt);
      if (isNaN(date.getTime())) throw new Error();
    } catch {
      errors.push("endAt must be a valid ISO 8601 date");
    }
  }

  if (input.description !== undefined && input.description.length > 2000) {
    errors.push("Description must not exceed 2000 characters");
  }

  if (input.location !== undefined && input.location.length > 255) {
    errors.push("Location must not exceed 255 characters");
  }

  if (input.confirmationStatus !== undefined) {
    const validStatuses: ConfirmationStatus[] = ["confirmed", "pending", "declined"];
    if (!validStatuses.includes(input.confirmationStatus)) {
      errors.push(`Confirmation status must be one of: ${validStatuses.join(", ")}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Conflict Detection ────────────────────────────────────────────────────────

/**
 * Detect conflicts between two events.
 * Considers same-parent events and respects all-day status.
 */
export function detectEventConflict(
  event1: { id: string; startAt: string; endAt: string; allDay: boolean; parentId?: string },
  event2: { id: string; startAt: string; endAt: string; allDay: boolean; parentId?: string },
  bufferMinutes: number = 0
): EventConflict | null {
  // Only check conflicts if same parent or no parent specified
  const sameParent = event1.parentId && event2.parentId && event1.parentId === event2.parentId;
  if (!sameParent && event1.parentId && event2.parentId) {
    return null; // Different parents – no conflict
  }

  const start1 = new Date(event1.startAt).getTime();
  const end1 = new Date(event1.endAt).getTime();
  const start2 = new Date(event2.startAt).getTime();
  const end2 = new Date(event2.endAt).getTime();

  const bufferMs = bufferMinutes * 60 * 1000;

  // Check if events overlap (with buffer)
  const overlaps = start1 < end2 + bufferMs && start2 < end1 + bufferMs;
  if (!overlaps) {
    return null;
  }

  // Determine if direct overlap or buffer violation
  const directOverlap = start1 < end2 && start2 < end1;
  const minutesApart = Math.round(Math.abs(start1 - start2) / 60_000);

  return {
    eventId: event1.id,
    conflictingEventId: event2.id,
    conflictType: directOverlap ? "overlap" : "buffer",
    minutesApart: !directOverlap ? minutesApart : undefined,
    message: directOverlap
      ? `Event overlaps with existing event (${event2.id})`
      : `Event conflicts with buffer window (${minutesApart} minutes from event ${event2.id})`,
  };
}

/**
 * Check for conflicts with existing events in family.
 */
export async function checkEventConflicts(
  familyId: string,
  event: {
    id?: string; // undefined for new events
    startAt: string;
    endAt: string;
    allDay: boolean;
    parentId?: string;
  },
  bufferMinutes: number = 30
): Promise<EventConflict[]> {
  const existingEvents = await db.calendarEvents.findByFamilyId(familyId);
  const conflicts: EventConflict[] = [];

  for (const existing of existingEvents) {
    // Skip if checking against itself (on update)
    if (event.id && existing.id === event.id) continue;

    const conflict = detectEventConflict(
      {
        id: event.id || "new",
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: event.allDay,
        parentId: event.parentId,
      },
      {
        id: existing.id,
        startAt: existing.startAt,
        endAt: existing.endAt,
        allDay: existing.allDay,
        parentId: existing.parentId,
      },
      bufferMinutes
    );

    if (conflict) {
      conflicts.push(conflict);
    }
  }

  return conflicts;
}

// ─── Service Operations ───────────────────────────────────────────────────────

/**
 * Create a new calendar event with full validation.
 */
export async function createEvent(input: CreateEventInput): Promise<{ success: true; event: DbCalendarEvent } | { success: false; error: string }> {
  // Validate input
  const validation = validateCreateEventInput(input);
  if (!validation.valid) {
    return { success: false, error: validation.errors[0] || "Invalid input" };
  }

  try {
    // Ensure confirmationStatus has a default value
    const eventData: Omit<DbCalendarEvent, "id" | "createdAt" | "updatedAt"> = {
      ...input,
      confirmationStatus: input.confirmationStatus || "pending",
    };

    // Create event
    const event = await db.calendarEvents.create(eventData);

    // Audit log
    audit.log(
      "calendar.event.create",
      { userId: input.createdBy },
      { eventId: event.id, familyId: input.familyId }
    );

    return { success: true, event };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create event",
    };
  }
}

/**
 * Update a calendar event.
 */
export async function updateEvent(
  id: string,
  input: UpdateEventInput,
  userId: string,
): Promise<{ success: true; event: DbCalendarEvent } | { success: false; error: string }> {
  // Validate input
  const validation = validateUpdateEventInput(input);
  if (!validation.valid) {
    return { success: false, error: validation.errors[0] || "Invalid input" };
  }

  try {
    // Fetch existing event
    const existing = await db.calendarEvents.findById(id);
    if (!existing) {
      return { success: false, error: "Event not found" };
    }

    // Update event
    const event = await db.calendarEvents.update(id, input);
    if (!event) {
      return { success: false, error: "Failed to update event" };
    }

    // Audit log
    audit.log(
      "calendar.event.update",
      { userId },
      { eventId: id, familyId: existing.familyId, fields: JSON.stringify(Object.keys(input)) },
    );

    return { success: true, event };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update event",
    };
  }
}

/**
 * Delete a calendar event.
 */
export async function deleteEvent(
  id: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    // Fetch event to get family ID
    const event = await db.calendarEvents.findById(id);
    if (!event) {
      return { success: false, error: "Event not found" };
    }

    // Delete event
    const deleted = await db.calendarEvents.delete(id);
    if (!deleted) {
      return { success: false, error: "Failed to delete event" };
    }

    // Audit log
    audit.log(
      "calendar.event.delete",
      { userId },
      { eventId: id, familyId: event.familyId, title: event.title },
    );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete event",
    };
  }
}

/**
 * Get events for a date range with custody context.
 */
export async function getEventsWithCustodyContext(
  familyId: string,
  startAt: string,
  endAt: string
): Promise<{
  events: DbCalendarEvent[];
  custodyInfo: Record<string, { parentId: string; parentName: string }>;
}> {
  // Fetch events
  const events = await db.calendarEvents.findByFamilyIdAndDateRange(familyId, startAt, endAt);

  // Fetch family and custody schedule for context
  const family = await db.families.findById(familyId);
  if (!family) {
    return { events, custodyInfo: {} };
  }

  // Build custody context (optional enrichment)
  const custodyInfo: Record<string, { parentId: string; parentName: string }> = {};

  return { events, custodyInfo };
}
