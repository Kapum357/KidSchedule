/**
 * POST /api/ai/tone-analyze
 * 
 * Analyzes message text for hostile tone using Claude.
 * Returns indicators and a neutral rewrite if hostility is detected.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib";
import { analyzeMessageTone, redactPIIForClaude } from "@/lib/providers/ai/claude-adapter";
import { observeApiRequest } from "@/lib/observability/api-observability";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

// Maximum input length to prevent abuse
const MAX_TEXT_LENGTH = 10000;

interface ToneAnalyzeBody {
  text?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    // Require authentication
    const user = await getCurrentUser();
    if (!user) {
      const response = NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
      observeApiRequest({
        route: "/api/ai/tone-analyze",
        method: "POST",
        status: 401,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    const body: ToneAnalyzeBody = await request.json();
    const { text } = body;

    // Validate text input
    if (!text || typeof text !== "string") {
      const response = NextResponse.json(
        { error: "missing_text", message: "Text is required for tone analysis" },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/ai/tone-analyze",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Input length guard
    if (text.length > MAX_TEXT_LENGTH) {
      const response = NextResponse.json(
        {
          error: "text_too_long",
          message: `Text must be ${MAX_TEXT_LENGTH} characters or less`,
        },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/ai/tone-analyze",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Empty or whitespace-only text
    if (text.trim().length === 0) {
      const response = NextResponse.json(
        { error: "empty_text", message: "Text cannot be empty" },
        { status: 400 }
      );
      observeApiRequest({
        route: "/api/ai/tone-analyze",
        method: "POST",
        status: 400,
        durationMs: Date.now() - startedAt,
      });
      return response;
    }

    // Perform tone analysis
    const result = await analyzeMessageTone(user.userId, text);

    // Log with PII-safe text preview
    const safePreview = redactPIIForClaude(text.slice(0, 50));
    logEvent("info", "Tone analysis completed", {
      requestId,
      userId: user.userId,
      isHostile: result.isHostile,
      indicatorCount: result.indicators.length,
      textPreview: safePreview + (text.length > 50 ? "..." : ""),
    });

    // Return result in the specified format
    const response = NextResponse.json(
      {
        is_hostile: result.isHostile,
        indicators: result.indicators,
        neutral_rewrite: result.neutralRewrite,
      },
      { status: 200 }
    );
    observeApiRequest({
      route: "/api/ai/tone-analyze",
      method: "POST",
      status: 200,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    logEvent("error", "Tone analyze endpoint error", {
      requestId,
      error: error instanceof Error ? error.message : "unknown_error",
    });

    const response = NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 }
    );
    observeApiRequest({
      route: "/api/ai/tone-analyze",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return response;
  }
}
