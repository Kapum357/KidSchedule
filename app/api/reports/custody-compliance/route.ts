/**
 * KidSchedule – Custody Compliance Reports API
 *
 * GET /api/reports/custody-compliance?familyId=<id>&startDate=<date>&endDate=<date>
 * POST /api/reports/custody-compliance/export
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/persistence";
import { CustodyComplianceEngine } from "@/lib/custody-compliance-engine";
import { z } from "zod";
import {
  getAuthenticatedUser,
  userBelongsToFamily,
  unauthorized,
  forbidden,
} from "../../calendar/utils";

const complianceEngine = new CustodyComplianceEngine();

// Schema for query parameters
const QuerySchema = z.object({
  familyId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),   // YYYY-MM-DD format
});

// Schema for export request body
const ExportSchema = z.object({
  report: z.object({
    familyId: z.string(),
    reportPeriod: z.object({
      startDate: z.string(),
      endDate: z.string(),
    }),
    parents: z.array(z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      avatarUrl: z.string().optional(),
      phone: z.string().optional(),
    })),
    summary: z.object({
      totalScheduledTime: z.number(),
      totalActualTime: z.number(),
      compliancePercentage: z.number(),
      totalDeviations: z.number(),
      totalOverrides: z.number(),
    }),
    periods: z.array(z.object({
      startTime: z.string(),
      endTime: z.string(),
      scheduledParentId: z.string(),
      actualParentId: z.string().optional(),
      eventId: z.string().optional(),
      compliance: z.boolean(),
      notes: z.string().optional(),
    })),
    overrides: z.array(z.any()), // Simplified for now
    changeRequests: z.array(z.any()), // Simplified for now
    generatedAt: z.string(),
  }),
  format: z.enum(['json', 'pdf']).default('json'),
});

/**
 * GET /api/reports/custody-compliance
 * Generate a custody compliance report for a family over a date range.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate query parameters
    const queryData = {
      familyId: searchParams.get('familyId'),
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
    };

    const validatedQuery = QuerySchema.parse(queryData);

    // Authenticate and authorize membership
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return unauthorized("unauthenticated", "Authentication required");
    }

    const canAccess = await userBelongsToFamily(auth.userId, validatedQuery.familyId);
    if (!canAccess) {
      return forbidden("not_family_member", "User is not a member of this family");
    }

    // Check if family exists
    const db = getDb();
    const family = await db.families.findById(validatedQuery.familyId);
    if (!family) {
      return NextResponse.json(
        { error: "Family not found" },
        { status: 404 },
      );
    }

    // Generate the compliance report
    const report = await complianceEngine.generateComplianceReport(
      validatedQuery.familyId,
      validatedQuery.startDate,
      validatedQuery.endDate,
    );

    return NextResponse.json(report);

  } catch (error) {
    console.info("Error generating custody compliance report:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request parameters",
          details: (error as z.ZodError).issues,
        },

        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/reports/custody-compliance/export
 * Export a custody compliance report for legal proceedings.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validatedData = ExportSchema.parse(body);

    // Export the report in the requested format
    const exportedData = await complianceEngine.exportForLegalProceedings(
      validatedData.report,
      validatedData.format,
    );

    // Set appropriate headers based on format
    const headers = new Headers();
    if (validatedData.format === 'json') {
      headers.set('Content-Type', 'application/json');
      const filename = `custody-compliance-${validatedData.report.familyId}-` +
        `${validatedData.report.reportPeriod.startDate}-to-` +
        `${validatedData.report.reportPeriod.endDate}.json`;
      headers.set('Content-Disposition', `attachment; filename="${filename}"`);
      return new NextResponse(new Uint8Array(exportedData), {
        status: 200,
        headers,
      });
    } else {
      // PDF format
      headers.set('Content-Type', 'application/pdf');
      const filename = `custody-compliance-${validatedData.report.familyId}-` +
        `${validatedData.report.reportPeriod.startDate}-to-` +
        `${validatedData.report.reportPeriod.endDate}.pdf`;
      headers.set('Content-Disposition', `attachment; filename="${filename}"`);
      return new NextResponse(new Uint8Array(exportedData), {
        status: 200,
        headers,
      });
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: (error as z.ZodError).issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}