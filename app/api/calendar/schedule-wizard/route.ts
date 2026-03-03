/**
 * POST /api/calendar/schedule-wizard
 *
 * Schedule Wizard API endpoint for custody schedule generation.
 * Implements CAL-004 specification.
 *
 * Behavior:
 *   1. Authenticate & authorize session membership in family
 *   2. Validate input (dates, timezone, pattern, options)
 *   3. Generate schedule blocks using pattern engine
 *   4. Return preview (default) or commit with idempotency
 */

import { NextResponse } from "next/server";
import { db, checkConnection } from "@/lib/persistence";
import {
  getAuthenticatedUser,
  userBelongsToFamily,
  badRequest,
  unauthorized,
  forbidden,
  internalError,
  tooManyRequests,
  parseJson,
  generateRequestId,
} from "../utils";
import { checkCalendarRateLimit } from "@/lib/rate-limit/calendar-limits";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";

export const runtime = "nodejs";

// ─── Types & Interfaces ───────────────────────────────────────────────────────

type PatternType = "2-2-3" | "alternating-weeks" | "2-2-5-5" | "custom";

interface CustomTemplateBlock {
  parentId: "A" | "B";
  days: number;
  label?: string;
}

interface ScheduleWizardRequest {
  familyId: string;
  pattern: PatternType;
  startWith: "A" | "B";
  options: {
    startDate: string;
    exchangeTime: string;
    timeZone: string;
    months?: number;
    customBlocks?: CustomTemplateBlock[];
  };
  childrenIds?: string[];
  conflictPolicy?: "abort" | "overwrite";
  commit?: boolean;
  label?: string;
  idempotencyKey?: string;
}

interface CustodyBlockInfo {
  parentId: "A" | "B";
  startDate: string;
  endDate: string;
  days: number;
  label?: string;
}

interface PreviewPayload {
  pattern: string;
  startDate: string;
  timeZone: string;
  blocks: CustodyBlockInfo[];
  summaryStats: {
    totalDays: number;
    parentADays: number;
    parentBDays: number;
    parentAPercent: number;
    parentBPercent: number;
  };
  warnings?: string[];
}

interface CommitPayload {
  scheduleId: string;
  pattern: string;
  createdAt: string;
  blocks: CustodyBlockInfo[];
  calendarEventCount: number;
  warnings?: string[];
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

function isValidIANATimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidISODate(date: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(date)) {
    return false;
  }
  const d = new Date(`${date}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

function isValidTimeString(time: string): boolean {
  const regex = /^\d{2}:\d{2}$/;
  if (!regex.test(time)) {
    return false;
  }
  const [h, m] = time.split(":").map(Number);
  return h >= 0 && h < 24 && m >= 0 && m < 60;
}

function isDateTooOld(dateStr: string): boolean {
  const now = new Date();
  const target = new Date(`${dateStr}T00:00:00Z`);
  const diffMs = now.getTime() - target.getTime();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return diffMs > twentyFourHours;
}

// ─── Schedule Block Generation ────────────────────────────────────────────────

function getSegmentsForPattern(
  pattern: PatternType,
  customBlocks?: CustomTemplateBlock[],
): Array<{ days: number, parent: "A" | "B" }> {
  if (pattern === "2-2-3") {
    return [
      { days: 2, parent: "A" },
      { days: 2, parent: "B" },
      { days: 3, parent: "A" },
      { days: 2, parent: "B" },
      { days: 2, parent: "A" },
      { days: 3, parent: "B" },
    ];
  }
  if (pattern === "alternating-weeks") {
    return [
      { days: 7, parent: "A" },
      { days: 7, parent: "B" },
    ];
  }
  if (pattern === "2-2-5-5") {
    return [
      { days: 2, parent: "A" },
      { days: 2, parent: "B" },
      { days: 5, parent: "A" },
      { days: 5, parent: "B" },
    ];
  }
  if (pattern === "custom" && customBlocks) {
    return customBlocks.map((b) => ({
      days: b.days,
      parent: b.parentId,
    }));
  }
  // Fallback to 2-2-3
  return [
    { days: 2, parent: "A" },
    { days: 2, parent: "B" },
    { days: 3, parent: "A" },
    { days: 2, parent: "B" },
    { days: 2, parent: "A" },
    { days: 3, parent: "B" },
  ];
}

function flipSegmentsIfNeeded(
  segments: Array<{ days: number, parent: "A" | "B" }>,
  startWith: "A" | "B",
): Array<{ days: number, parent: "A" | "B" }> {
  if (startWith === "A") {
    return segments;
  }

  return segments.map((s) => {
    let newParent: "A" | "B";
    if (s.parent === "A") {
      newParent = "B";
    } else {
      newParent = "A";
    }
    return {
      days: s.days,
      parent: newParent,
    };
  });
}

function generateCustodyBlocks(
  pattern: PatternType,
  startWith: "A" | "B",
  startDate: string,
  months: number = 12,
  customBlocks?: CustomTemplateBlock[],
): CustodyBlockInfo[] {
  const blocks: CustodyBlockInfo[] = [];
  const startDateObj = new Date(`${startDate}T00:00:00Z`);
  let currentDate = new Date(startDateObj);

  const endDate = new Date(startDateObj);
  endDate.setUTCMonth(endDate.getUTCMonth() + months);

  let segments = getSegmentsForPattern(pattern, customBlocks);
  segments = flipSegmentsIfNeeded(segments, startWith);

  let segmentIndex = 0;
  while (currentDate < endDate) {
    const segment = segments[segmentIndex % segments.length];
    if (!segment) {
      break;
    }

    const blockStartDate = new Date(currentDate);
    const blockEndDate = new Date(currentDate);
    blockEndDate.setUTCDate(blockEndDate.getUTCDate() + segment.days);

    if (blockEndDate > endDate) {
      blockEndDate.setTime(endDate.getTime());
    }

    const daysDiff = blockEndDate.getTime() - blockStartDate.getTime();
    const msPerDay = 24 * 60 * 60 * 1000;
    const actualDays = Math.ceil(daysDiff / msPerDay);

    let label: string;
    if (segment.parent === "A") {
      label = "Parent A";
    } else {
      label = "Parent B";
    }

    blocks.push({
      parentId: segment.parent,
      startDate: blockStartDate.toISOString().slice(0, 10),
      endDate: blockEndDate.toISOString().slice(0, 10),
      days: actualDays,
      label,
    });

    currentDate = blockEndDate;
    segmentIndex += 1;
  }

  return blocks;
}

function calculateSummaryStats(
  blocks: CustodyBlockInfo[],
): PreviewPayload["summaryStats"] {
  const totalDays = blocks.reduce((sum, b) => sum + b.days, 0);
  const parentADays = blocks
    .filter((b) => b.parentId === "A")
    .reduce((sum, b) => sum + b.days, 0);
  const parentBDays = totalDays - parentADays;

  let parentAPercent = 0;
  let parentBPercent = 0;
  if (totalDays > 0) {
    parentAPercent = Math.round((parentADays / totalDays) * 100);
    parentBPercent = Math.round((parentBDays / totalDays) * 100);
  }

  return {
    totalDays,
    parentADays,
    parentBDays,
    parentAPercent,
    parentBPercent,
  };
}

// ─── Conflict Checking ────────────────────────────────────────────────────────

async function checkConflicts(
  familyId: string,
  blocks: CustodyBlockInfo[],
): Promise<{ hasConflicts: boolean, overlappingDates?: string[] }> {
  if (!blocks.length) {
    return { hasConflicts: false };
  }

  const startDate = blocks[0].startDate;
  const endDate = blocks[blocks.length - 1].endDate;

  const existingEvents = await db.calendarEvents.findByFamilyIdAndDateRange(
    familyId,
    startDate,
    endDate,
  );

  const custodyEvents = existingEvents.filter((e) => e.category === "custody");
  if (!custodyEvents.length) {
    return { hasConflicts: false };
  }

  const overlappingDates = custodyEvents.map((e) => e.startAt.slice(0, 10));
  return {
    hasConflicts: true,
    overlappingDates: [...new Set(overlappingDates)],
  };
}

// ─── Idempotency (Placeholder for CAL-004) ────────────────────────────────────

/**
 * Check if idempotency key exists. Currently a placeholder.
 *
 * NOTE: In future implementation (CAL-004), this will:
 * - Lookup (key, payload, result) in idempotency_keys table with TTL
 * - Return cached result if found with matching payload
 * - Support audit trail via idempotency logs
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
async function checkIdempotencyKey(
  _key: string,
  _payload: string,
): Promise<{ isDuplicate: boolean, originalResult?: string }> {
  return { isDuplicate: false };
}

/**
 * Store idempotency result for future replay. Currently a placeholder.
 *
 * NOTE: In future implementation (CAL-004), this will:
 * - Persist (key, payload, result) in idempotency_keys table
 * - Set expiresAt = now + 24 hours for audit trail retention
 * - Handle idempotency key scoping by family + payload hash
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
async function storeIdempotencyResult(
  _key: string,
  _payload: string,
  _result: string,
): Promise<void> {
  // Placeholder for future implementation
}
/* eslint-enable @typescript-eslint/no-unused-vars */

// ─── Constants for ID Generation ─────────────────────────────────────────────

const ID_RADIX = 36;
const ID_SLICE_LENGTH = 9;

// ─── Main Handler ─────────────────────────────────────────────────────────────

/**
 * Validate request input for consistency and required fields.
 */
function validateRequest(body: ScheduleWizardRequest): string | null {
  if (!body.familyId) {
    return "missing_family_id";
  }
  if (!["2-2-3", "alternating-weeks", "2-2-5-5", "custom"].includes(body.pattern)) {
    return "invalid_pattern";
  }
  if (!["A", "B"].includes(body.startWith)) {
    return "invalid_start_with";
  }
  if (!body.options) {
    return "missing_options";
  }
  if (!isValidISODate(body.options.startDate)) {
    return "invalid_start_date";
  }
  if (!isValidTimeString(body.options.exchangeTime)) {
    return "invalid_exchange_time";
  }
  if (!isValidIANATimezone(body.options.timeZone)) {
    return "invalid_timezone";
  }
  if (isDateTooOld(body.options.startDate)) {
    return "start_date_in_past";
  }
  if (body.pattern === "custom") {
    if (!body.options.customBlocks || !Array.isArray(body.options.customBlocks)) {
      return "missing_custom_blocks";
    }
    for (let i = 0; i < body.options.customBlocks.length; i++) {
      const block = body.options.customBlocks[i];
      const isValid = block &&
        typeof block.days === "number" &&
        block.days > 0 &&
        ["A", "B"].includes(block.parentId);
      if (!isValid) {
        return `invalid_custom_block_${i}`;
      }
    }
  }
  return null;
}

interface AuthenticatedUserInfo {
  userId: string;
  email: string;
  sessionId: string;
}

async function performAuthAndValidation(
  request: Request,
): Promise<{ success: false, response: NextResponse } | { success: true, body: ScheduleWizardRequest, user: AuthenticatedUserInfo }> {
  // 1. Authenticate
  const user = await getAuthenticatedUser();
  if (!user) {
    return { success: false, response: unauthorized("unauthenticated", "Authentication required") };
  }

  // 2. Parse & Validate Input
  const parseResult = await parseJson<ScheduleWizardRequest>(request);
  if (!parseResult.success) {
    return { success: false, response: badRequest("invalid_json", parseResult.error) };
  }

  const body = parseResult.data;
  const validationError = validateRequest(body);
  if (validationError) {
    const errorMsg = `Request validation failed: ${validationError}`;
    return { success: false, response: badRequest(validationError, errorMsg) };
  }

  return { success: true, body, user };
}

// eslint-disable-next-line @sonarjs/cognitive-complexity, max-lines-per-function
async function handlePost(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = generateRequestId();
  const route = "/api/calendar/schedule-wizard";

  try {
    const authResult = await performAuthAndValidation(request);
    if (!authResult.success) {
      return authResult.response;
    }

    const { body, user } = authResult;

    const { familyId, pattern, startWith, options, childrenIds, idempotencyKey: bodyIdempotencyKey } = body;
    const conflictPolicy = body.conflictPolicy ?? "abort";
    const commit = body.commit ?? false;

    // 3. Authorize Family Membership
    const isAuthorized = await userBelongsToFamily(user.userId, familyId);
    if (!isAuthorized) {
      return forbidden("not_family_member", "User is not a member of this family");
    }

    // 4. Rate Limiting
    let rateAction: "submitChangeRequest" | "createEvent";
    if (commit) {
      rateAction = "submitChangeRequest";
    } else {
      rateAction = "createEvent";
    }
    const rateCheck = checkCalendarRateLimit(user.userId, rateAction);
    if (!rateCheck.allowed) {
      return tooManyRequests("rate_limited", "Too many requests");
    }

    // 5. Idempotency Check (commit only)
    let idempotencyKey = bodyIdempotencyKey;
    if (commit && !idempotencyKey) {
      const headerKey = request.headers.get("Idempotency-Key");
      if (!headerKey) {
        return badRequest(
          "missing_idempotency_key",
          "commit=true requires Idempotency-Key header or body field",
        );
      }
      idempotencyKey = headerKey;
    }

    const requestPayload = JSON.stringify(body);
    if (commit && idempotencyKey) {
      const idempotencyCheck = await checkIdempotencyKey(idempotencyKey, requestPayload);
      if (idempotencyCheck.isDuplicate && idempotencyCheck.originalResult) {
        logEvent("info", "Idempotent request replay", {
          requestId,
          idempotencyKey,
          familyId,
        });
        return NextResponse.json(JSON.parse(idempotencyCheck.originalResult), {
          status: 200,
        });
      }
    }

    // 6. Get Children
    let children = await db.children.findByFamilyId(familyId);
    if (childrenIds && Array.isArray(childrenIds) && childrenIds.length > 0) {
      children = children.filter((c) => childrenIds.includes(c.id));
    }
    if (children.length === 0) {
      return badRequest("no_children", "No children found for this family");
    }

    // 7. Generate Custody Blocks
    const blocks = generateCustodyBlocks(
      pattern as PatternType,
      startWith,
      options.startDate,
      options.months,
      options.customBlocks,
    );

    if (blocks.length === 0) {
      return badRequest("no_blocks_generated", "Failed to generate custody blocks");
    }

    const summaryStats = calculateSummaryStats(blocks);

    // 8. Return Preview (default)
    if (!commit) {
      const preview: PreviewPayload = {
        pattern,
        startDate: options.startDate,
        timeZone: options.timeZone,
        blocks,
        summaryStats,
      };

      observeApiRequest({
        route,
        method: "POST",
        status: 200,
        durationMs: Date.now() - startedAt,
      });

      logEvent("info", "Schedule wizard preview generated", {
        requestId,
        familyId,
        pattern,
        blockCount: blocks.length,
      });

      return NextResponse.json(preview, { status: 200 });
    }

    // 9. Check Conflicts (commit=true)
    if (conflictPolicy === "abort") {
      const conflicts = await checkConflicts(familyId, blocks);
      if (conflicts.hasConflicts) {
        const details = { overlappingDates: conflicts.overlappingDates };
        return NextResponse.json(
          {
            error: "schedule_conflict",
            message: "Proposed schedule conflicts with existing custody events",
            details,
          },
          { status: 409 },
        );
      }
    }

    // 10. Check Database Connection
    const connected = await checkConnection();
    if (!connected) {
      logEvent("error", "Database connection failed", { requestId, familyId });
      return internalError("db_connection_failed", "Database connection unavailable");
    }

    // 11. Transactional Commit
    let scheduleId = "";

    try {
      await db.beginTransaction();

      // Generate schedule ID
      scheduleId = `sched_${Date.now()}_${Math.random().toString(ID_RADIX).slice(2, ID_SLICE_LENGTH)}`;

      // Create calendar events from blocks
      for (const block of blocks) {
        const blockStartDate = new Date(
          `${block.startDate}T00:00:00Z`,
        );
        const blockEndDate = new Date(blockStartDate);
        blockEndDate.setUTCDate(blockEndDate.getUTCDate() + block.days);

        await db.calendarEvents.create({
          familyId,
          title: `Custody: ${block.label}`,
          category: "custody",
          startAt: blockStartDate.toISOString(),
          endAt: blockEndDate.toISOString(),
          allDay: true,
          createdBy: user.userId,
          confirmationStatus: "confirmed",
          description: `Generated by schedule wizard (${pattern})`,
        });
      }

      // Audit log
      await db.auditLogs.create({
        userId: user.userId,
        action: "calendar.event.create",
        metadata: {
          scheduleId,
          familyId,
          pattern,
          blockCount: blocks.length,
          idempotencyKey,
        },
      });

      await db.commit();
    } catch (error) {
      await db.rollback();
      let errorMsg = "unknown";
      if (error instanceof Error) {
        errorMsg = error.message;
      }
      logEvent("error", "Schedule wizard commit failed", {
        requestId,
        familyId,
        error: errorMsg,
      });
      return internalError("commit_failed", "Failed to persist schedule");
    }

    // 12. Return Commit Response
    const response: CommitPayload = {
      scheduleId,
      pattern,
      createdAt: new Date().toISOString(),
      blocks,
      calendarEventCount: blocks.length,
    };

    if (idempotencyKey) {
      await storeIdempotencyResult(idempotencyKey, requestPayload, JSON.stringify(response));
    }

    observeApiRequest({
      route,
      method: "POST",
      status: 201,
      durationMs: Date.now() - startedAt,
    });

    logEvent("info", "Schedule wizard committed", {
      requestId,
      familyId,
      scheduleId,
      pattern,
      eventCount: blocks.length,
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    let errorMsg = "unknown_error";
    if (error instanceof Error) {
      errorMsg = error.message;
    }
    logEvent("error", "Schedule wizard endpoint error", {
      requestId,
      error: errorMsg,
    });

    observeApiRequest({
      route: "/api/calendar/schedule-wizard",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError("internal_error", "An unexpected error occurred");
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  return handlePost(request);
}
