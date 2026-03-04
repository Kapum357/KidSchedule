/**
 * KidSchedule – Holiday Exception Rules API Routes
 *
 * GET /api/holiday-exception-rules?familyId=X&status=pending
 *   - Retrieve exception rules for a family, optionally filtered by approval status
 *   - Query parameters: familyId (required), status (optional: pending|approved|rejected)
 *   - Returns: DbHolidayExceptionRule[]
 *
 * POST /api/holiday-exception-rules
 *   - Propose a new holiday exception rule (initiates dual-confirmation workflow)
 *   - Body: { familyId, holidayId, custodianParentId, isEnabled, notes? }
 *   - Returns: DbHolidayExceptionRule
 *
 * PUT /api/holiday-exception-rules
 *   - Confirm or reject a pending exception rule
 *   - Body: { familyId, holidayId, approved }
 *   - Returns: DbHolidayExceptionRule or null if not pending
 *
 * DELETE /api/holiday-exception-rules?familyId=X&holidayId=Y
 *   - Delete an exception rule
 *   - Query parameters: familyId (required), holidayId (required)
 *   - Returns: { success: boolean }
 */

export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { DbHolidayExceptionRule } from "@/lib/persistence/types";
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
  getQueryParam,
  checkRateLimit,
} from "../calendar/utils";
import { getDb } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";
import { observeApiRequest } from "@/lib/observability/api-observability";

interface ProposeRuleBody {
  familyId: string;
  holidayId: string;
  custodianParentId: string;
  isEnabled: boolean;
  notes?: string;
}

interface ConfirmRuleBody {
  familyId: string;
  holidayId: string;
  approved: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = generateRequestId();

  try {
    // 1. Authenticate
    const user = await getAuthenticatedUser();
    if (!user) {
      logEvent("warn", "Exception Rules GET: unauthenticated request", {
        requestId,
      });
      return unauthorized("unauthenticated", "Authentication required");
    }

    // 2. Rate limit
    const rateLimitKey = `exception-rules:${user.userId}:read`;
    const rateLimit = await checkRateLimit(rateLimitKey, 100, 3600); // 100 per hour
    if (!rateLimit.allowed) {
      logEvent("warn", "Exception Rules GET: rate limit exceeded", {
        requestId,
        userId: user.userId,
      });
      return tooManyRequests();
    }

    // 3. Parse query parameters
    const familyId = getQueryParam(request.nextUrl, "familyId");
    const status = getQueryParam(request.nextUrl, "status") as
      | "pending"
      | "approved"
      | "rejected"
      | null;

    // 4. Validate required parameters
    if (!familyId) {
      return badRequest(
        "invalid_query",
        "familyId is required"
      );
    }

    // Validate status if provided
    if (status && !["pending", "approved", "rejected"].includes(status)) {
      return badRequest(
        "invalid_query",
        "status must be one of: pending, approved, rejected"
      );
    }

    // 5. Authorize family access
    const belongsToFamily = await userBelongsToFamily(user.userId, familyId);
    if (!belongsToFamily) {
      logEvent("warn", "Exception Rules GET: unauthorized family access", {
        requestId,
        userId: user.userId,
        familyId,
      });
      return forbidden(
        "not_family_member",
        "You do not belong to this family"
      );
    }

    // 6. Retrieve rules
    const db = getDb();
    let rules: DbHolidayExceptionRule[] = [];

    if (status === "pending") {
      // Get pending rules specifically (for approval workflow)
      rules = await db.holidayExceptionRules.findPendingByFamilyId(familyId);
    } else {
      // Get all rules for family, then filter if needed
      const allRules = await db.holidayExceptionRules.findByFamilyId(familyId);
      rules = status
        ? allRules.filter((r) => r.approvalStatus === status)
        : allRules;
    }

    logEvent("info", "Exception rules retrieved", {
      requestId,
      userId: user.userId,
      familyId,
      status,
      count: rules.length,
    });

    observeApiRequest({
      route: "/api/holiday-exception-rules",
      method: "GET",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(rules, { status: 200 });
  } catch (error) {
    logEvent("error", "Exception Rules GET error", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    observeApiRequest({
      route: "/api/holiday-exception-rules",
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
      logEvent("warn", "Exception Rules POST: unauthenticated request", {
        requestId,
      });
      return unauthorized("unauthenticated", "Authentication required");
    }

    // 2. Rate limit
    const rateLimitKey = `exception-rules:${user.userId}:write`;
    const rateLimit = await checkRateLimit(rateLimitKey, 20, 3600); // 20 per hour
    if (!rateLimit.allowed) {
      logEvent("warn", "Exception Rules POST: rate limit exceeded", {
        requestId,
        userId: user.userId,
      });
      return tooManyRequests();
    }

    // 3. Parse request body
    const parseResult = await parseJson<ProposeRuleBody>(request);
    if (!parseResult.success) {
      return badRequest("invalid_json", parseResult.error);
    }

    const body = parseResult.data;

    // 4. Validate required fields
    if (!body.familyId?.trim()) {
      return badRequest("invalid_request", "familyId is required");
    }
    if (!body.holidayId?.trim()) {
      return badRequest("invalid_request", "holidayId is required");
    }
    if (!body.custodianParentId?.trim()) {
      return badRequest(
        "invalid_request",
        "custodianParentId (beneficiary parent) is required"
      );
    }
    if (typeof body.isEnabled !== "boolean") {
      return badRequest("invalid_request", "isEnabled must be a boolean");
    }

    // 5. Authorize family access
    const belongsToFamily = await userBelongsToFamily(
      user.userId,
      body.familyId
    );
    if (!belongsToFamily) {
      logEvent("warn", "Exception Rules POST: unauthorized family access", {
        requestId,
        userId: user.userId,
        familyId: body.familyId,
      });
      return forbidden(
        "not_family_member",
        "You do not belong to this family"
      );
    }

    // 6. Propose exception rule
    const db = getDb();
    const rule = await db.holidayExceptionRules.propose(
      {
        familyId: body.familyId,
        holidayId: body.holidayId,
        custodianParentId: body.custodianParentId,
        isEnabled: body.isEnabled,
        notes: body.notes?.trim(),
      },
      user.userId
    );

    logEvent("info", "Exception rule proposed", {
      requestId,
      userId: user.userId,
      familyId: body.familyId,
      holidayId: body.holidayId,
      custodianParentId: body.custodianParentId,
    });

    observeApiRequest({
      route: "/api/holiday-exception-rules",
      method: "POST",
      status: 201,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    logEvent("error", "Exception Rules POST error", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    observeApiRequest({
      route: "/api/holiday-exception-rules",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError();
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function handlePut(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = generateRequestId();

  try {
    // 1. Authenticate
    const user = await getAuthenticatedUser();
    if (!user) {
      logEvent("warn", "Exception Rules PUT: unauthenticated request", {
        requestId,
      });
      return unauthorized("unauthenticated", "Authentication required");
    }

    // 2. Rate limit
    const rateLimitKey = `exception-rules:${user.userId}:write`;
    const rateLimit = await checkRateLimit(rateLimitKey, 20, 3600); // 20 per hour
    if (!rateLimit.allowed) {
      logEvent("warn", "Exception Rules PUT: rate limit exceeded", {
        requestId,
        userId: user.userId,
      });
      return tooManyRequests();
    }

    // 3. Parse request body
    const parseResult = await parseJson<ConfirmRuleBody>(request);
    if (!parseResult.success) {
      return badRequest("invalid_json", parseResult.error);
    }

    const body = parseResult.data;

    // 4. Validate required fields
    if (!body.familyId?.trim()) {
      return badRequest("invalid_request", "familyId is required");
    }
    if (!body.holidayId?.trim()) {
      return badRequest("invalid_request", "holidayId is required");
    }
    if (typeof body.approved !== "boolean") {
      return badRequest("invalid_request", "approved must be a boolean");
    }

    // 5. Authorize family access
    const belongsToFamily = await userBelongsToFamily(
      user.userId,
      body.familyId
    );
    if (!belongsToFamily) {
      logEvent("warn", "Exception Rules PUT: unauthorized family access", {
        requestId,
        userId: user.userId,
        familyId: body.familyId,
      });
      return forbidden(
        "not_family_member",
        "You do not belong to this family"
      );
    }

    // 6. Confirm or reject the exception rule
    const db = getDb();
    const rule = await db.holidayExceptionRules.confirm(
      body.familyId,
      body.holidayId,
      user.userId,
      body.approved
    );

    // If rule is null, the rule was not found or not in pending status
    if (!rule) {
      logEvent("warn", "Exception Rules PUT: rule not pending", {
        requestId,
        userId: user.userId,
        familyId: body.familyId,
        holidayId: body.holidayId,
      });
      return badRequest(
        "rule_not_pending",
        "Exception rule not found or not in pending status"
      );
    }

    logEvent("info", "Exception rule confirmed", {
      requestId,
      userId: user.userId,
      familyId: body.familyId,
      holidayId: body.holidayId,
      decision: body.approved ? "approved" : "rejected",
    });

    observeApiRequest({
      route: "/api/holiday-exception-rules",
      method: "PUT",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(rule, { status: 200 });
  } catch (error) {
    logEvent("error", "Exception Rules PUT error", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    observeApiRequest({
      route: "/api/holiday-exception-rules",
      method: "PUT",
      status: 500,
      durationMs: Date.now() - startedAt,
    });

    return internalError();
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function handleDelete(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = generateRequestId();

  try {
    // 1. Authenticate
    const user = await getAuthenticatedUser();
    if (!user) {
      logEvent("warn", "Exception Rules DELETE: unauthenticated request", {
        requestId,
      });
      return unauthorized("unauthenticated", "Authentication required");
    }

    // 2. Rate limit
    const rateLimitKey = `exception-rules:${user.userId}:write`;
    const rateLimit = await checkRateLimit(rateLimitKey, 20, 3600); // 20 per hour
    if (!rateLimit.allowed) {
      logEvent("warn", "Exception Rules DELETE: rate limit exceeded", {
        requestId,
        userId: user.userId,
      });
      return tooManyRequests();
    }

    // 3. Parse query parameters
    const familyId = getQueryParam(request.nextUrl, "familyId");
    const holidayId = getQueryParam(request.nextUrl, "holidayId");

    // 4. Validate required parameters
    if (!familyId) {
      return badRequest("invalid_query", "familyId is required");
    }
    if (!holidayId) {
      return badRequest("invalid_query", "holidayId is required");
    }

    // 5. Authorize family access
    const belongsToFamily = await userBelongsToFamily(user.userId, familyId);
    if (!belongsToFamily) {
      logEvent("warn", "Exception Rules DELETE: unauthorized family access", {
        requestId,
        userId: user.userId,
        familyId,
      });
      return forbidden(
        "not_family_member",
        "You do not belong to this family"
      );
    }

    // 6. Delete the exception rule
    const db = getDb();
    const deleted = await db.holidayExceptionRules.delete(familyId, holidayId);

    if (!deleted) {
      logEvent("warn", "Exception Rules DELETE: rule not found", {
        requestId,
        userId: user.userId,
        familyId,
        holidayId,
      });
      return badRequest(
        "rule_not_found",
        "Exception rule not found"
      );
    }

    logEvent("info", "Exception rule deleted", {
      requestId,
      userId: user.userId,
      familyId,
      holidayId,
    });

    observeApiRequest({
      route: "/api/holiday-exception-rules",
      method: "DELETE",
      status: 204,
      durationMs: Date.now() - startedAt,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logEvent("error", "Exception Rules DELETE error", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    observeApiRequest({
      route: "/api/holiday-exception-rules",
      method: "DELETE",
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

export async function PUT(request: NextRequest): Promise<NextResponse> {
  return handlePut(request);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return handleDelete(request);
}
