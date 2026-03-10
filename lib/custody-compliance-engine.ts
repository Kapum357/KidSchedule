/**
 * KidSchedule – CustodyComplianceEngine
 *
 * Generates custody compliance reports by comparing actual calendar events
 * against the scheduled custody arrangements. Tracks actual vs. scheduled time,
 * compliance percentages, and generates audit trails for legal proceedings.
 */

import type {
  Family,
  Parent,
  Child,
  CalendarEvent,
  CustodySchedule,
  ScheduleBlock,
  EventCategory,
  ConfirmationStatus,
  ChangeRequestStatus,
  ScheduleOverride,
  ScheduleChangeRequest,
} from " @/lib";
import { CustodyEngine } from "./custody-engine";
import { getDb } from "@/lib/persistence";

export interface CustodyPeriod {
  startTime: string; // ISO timestamp
  endTime: string;   // ISO timestamp
  scheduledParentId: string;
  actualParentId?: string;
  eventId?: string;
  compliance: boolean;
  notes?: string;
}

export interface CustodyComplianceReport {
  familyId: string;
  reportPeriod: {
    startDate: string; // ISO date
    endDate: string;   // ISO date
  };
  parents: Parent[];
  summary: {
    totalScheduledTime: number; // hours
    totalActualTime: number;    // hours
    compliancePercentage: number;
    totalDeviations: number;
    totalOverrides: number;
  };
  periods: CustodyPeriod[];
  overrides: ScheduleOverride[];
  changeRequests: ScheduleChangeRequest[];
  generatedAt: string;
}

export interface ComplianceMetrics {
  parentId: string;
  scheduledHours: number;
  actualHours: number;
  compliancePercentage: number;
  deviationHours: number;
  overrideCount: number;
}

export class CustodyComplianceEngine {
  /**
   * Generate a custody compliance report for a family over a date range.
   */
  async generateComplianceReport(
    familyId: string,
    startDate: string,
    endDate: string
  ): Promise<CustodyComplianceReport> {
    const db = getDb();

    // Get family data
    const dbFamily = await db.families.findById(familyId);
    if (!dbFamily) {
      throw new Error(`Family ${familyId} not found`);
    }

    // Get parents, children, and schedule to construct full Family object
    const [dbParents, dbChildren] = await Promise.all([
      db.parents.findByFamilyId(familyId),
      db.children.findByFamilyId(familyId),
    ]);

    // Get schedule directly from database
    const { sql } = await import("@/lib/persistence/postgres/client");
    const scheduleRows = await sql`
      SELECT id, name, transition_hour, blocks, is_active
      FROM custody_schedules
      WHERE id = ${dbFamily.scheduleId} AND is_active = true
      LIMIT 1
    `;

    if (scheduleRows.length === 0) {
      throw new Error(`Active schedule not found for family ${familyId}`);
    }

    const dbSchedule = scheduleRows[0];

    // Convert DbParent[] to Parent[]
    const parents: [Parent, Parent] = dbParents.map(dbParent => ({
      id: dbParent.id,
      name: dbParent.name,
      email: dbParent.email,
      avatarUrl: dbParent.avatarUrl,
      phone: dbParent.phone,
    })) as [Parent, Parent];

    // Convert DbChild[] to Child[]
    const children: Child[] = dbChildren.map(dbChild => ({
      id: dbChild.id,
      firstName: dbChild.firstName,
      lastName: dbChild.lastName,
      dateOfBirth: dbChild.dateOfBirth,
      avatarUrl: dbChild.avatarUrl,
    }));

    // Convert DbCustodySchedule to CustodySchedule
    const schedule: CustodySchedule = {
      id: dbSchedule.id,
      name: dbSchedule.name,
      transitionHour: dbSchedule.transitionHour,
      blocks: dbSchedule.blocks as ScheduleBlock[],
    };

    // Construct full Family object
    const family: Family = {
      id: dbFamily.id,
      parents,
      children,
      custodyAnchorDate: dbFamily.custodyAnchorDate,
      schedule,
    };

    // Create custody engine for this family
    const custodyEngine = new CustodyEngine(family);

    // Get calendar events for the period
    const dbCalendarEvents = await db.calendarEvents.findByFamilyIdAndDateRange(
      familyId,
      startDate,
      endDate
    );

    // Convert DbCalendarEvent[] to CalendarEvent[]
    const calendarEvents: CalendarEvent[] = dbCalendarEvents.map(dbEvent => ({
      id: dbEvent.id,
      familyId: dbEvent.familyId,
      title: dbEvent.title,
      description: dbEvent.description,
      category: dbEvent.category as EventCategory,
      startAt: dbEvent.startAt,
      endAt: dbEvent.endAt,
      allDay: dbEvent.allDay,
      location: dbEvent.location,
      parentId: dbEvent.parentId,
      confirmationStatus: dbEvent.confirmationStatus as ConfirmationStatus,
      createdBy: dbEvent.createdBy,
    }));

    // Get schedule overrides for the period
    const overrides = await db.scheduleOverrides.findByTimeRange(
      familyId,
      startDate,
      endDate,
    );

    // Get change requests for the period
    const dbChangeRequests = await db.scheduleChangeRequests.findByFamilyId(familyId);

    // Convert DbScheduleChangeRequest[] to ScheduleChangeRequest[]
    const changeRequests: ScheduleChangeRequest[] = dbChangeRequests.map(dbRequest => ({
      id: dbRequest.id,
      familyId: dbRequest.familyId,
      requestedBy: dbRequest.requestedBy,
      title: dbRequest.title,
      description: dbRequest.description,
      givingUpPeriodStart: dbRequest.givingUpPeriodStart,
      givingUpPeriodEnd: dbRequest.givingUpPeriodEnd,
      requestedMakeUpStart: dbRequest.requestedMakeUpStart,
      requestedMakeUpEnd: dbRequest.requestedMakeUpEnd,
      status: dbRequest.status as ChangeRequestStatus,
      createdAt: dbRequest.createdAt,
      respondedAt: dbRequest.respondedAt,
      responseNote: dbRequest.responseNote,
    }));

    // Generate compliance periods
    const periods = await this.generateCompliancePeriods(
      custodyEngine,
      startDate,
      endDate,
      calendarEvents
    );

    // Calculate summary metrics
    const summary = this.calculateSummaryMetrics(periods);

    return {
      familyId,
      reportPeriod: { startDate, endDate },
      parents: family.parents,
      summary,
      periods,
      overrides,
      changeRequests,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate detailed compliance periods by comparing scheduled vs actual custody.
   */
  private async generateCompliancePeriods(
    custodyEngine: CustodyEngine,
    startDate: string,
    endDate: string,
    calendarEvents: CalendarEvent[],
  ): Promise<CustodyPeriod[]> {
    const periods: CustodyPeriod[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Process each day in the range
    for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
      const dayStart = new Date(current);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(current);
      const END_OF_DAY_HOURS = 23;
      const END_OF_DAY_MINUTES = 59;
      const END_OF_DAY_SECONDS = 59;
      const END_OF_DAY_MS = 999;
      dayEnd.setHours(END_OF_DAY_HOURS, END_OF_DAY_MINUTES, END_OF_DAY_SECONDS, END_OF_DAY_MS);

      const scheduledTransitions = custodyEngine.getTransitionsInRange(dayStart, dayEnd);

      // Apply overrides
      const effectiveTransitions = this.applyOverridesToTransitions(
        scheduledTransitions,
      );

      // Create periods for each transition
      for (let i = 0; i < effectiveTransitions.length; i++) {
        const transition = effectiveTransitions[i];
        const periodStart = new Date(transition.timestamp);
        // Calculate period end
        let periodEnd: Date;
        if (i < effectiveTransitions.length - 1) {
          periodEnd = new Date(effectiveTransitions[i + 1].timestamp);
        } else {
          periodEnd = new Date(dayEnd);
        }

        // Find actual calendar event for this period
        const actualEvent = calendarEvents.find(event => {
          const eventStart = new Date(event.startAt);
          const eventEnd = new Date(event.endAt);
          return eventStart < periodEnd && eventEnd > periodStart;
        });

        // Set notes based on event
        let notes: string;
        if (actualEvent) {
          notes = `Event: ${actualEvent.title}`;
        } else {
          notes = 'No calendar event recorded';
        }

        const period: CustodyPeriod = {
          startTime: periodStart.toISOString(),
          endTime: periodEnd.toISOString(),
          scheduledParentId: transition.toParentId,
          actualParentId: actualEvent?.parentId,
          eventId: actualEvent?.id,
          compliance: actualEvent?.parentId === transition.toParentId,
          notes,
        };

        periods.push(period);
      }
    }

    return periods;
  }

  /**
   * Apply schedule overrides to the scheduled transitions.
   */
  /* eslint-disable @typescript-eslint/no-explicit-any */
  private applyOverridesToTransitions(
    transitions: any[],
  ): any[] {
    // For now, return transitions as-is. Full override logic would be complex.
    // This is a simplified implementation.
    return transitions;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  /**
   * Calculate summary metrics from compliance periods.
   */
  private calculateSummaryMetrics(periods: CustodyPeriod[]): CustodyComplianceReport['summary'] {
    let totalScheduledTime = 0;
    let totalActualTime = 0;
    let totalDeviations = 0;
    const totalOverrides = 0; // Would be calculated from overrides

    for (const period of periods) {
      const duration = (new Date(period.endTime).getTime() - new Date(period.startTime).getTime()) / (1000 * 60 * 60); // hours

      totalScheduledTime += duration;

      if (period.actualParentId) {
        totalActualTime += duration;
        if (!period.compliance) {
          totalDeviations++;
        }
      }
    }

    // Calculate compliance percentage
    let compliancePercentage: number;
    if (totalScheduledTime > 0) {
      compliancePercentage = (totalActualTime / totalScheduledTime) * 100;
    } else {
      compliancePercentage = 0;
    }

    return {
      totalScheduledTime,
      totalActualTime,
      compliancePercentage,
      totalDeviations,
      totalOverrides,
    };
  }

  /**
   * Export report data for legal proceedings (PDF/JSON format).
   */
  async exportForLegalProceedings(
    report: CustodyComplianceReport,
    format: 'json' | 'pdf' = 'json',
  ): Promise<Buffer> {
    if (format === 'json') {
      return Buffer.from(JSON.stringify(report, null, 2));
    }

    // PDF generation would require a PDF library like puppeteer or pdfkit
    // For now, return JSON as placeholder
    return Buffer.from(JSON.stringify(report, null, 2));
  }

  /**
   * Get compliance metrics for each parent.
   */
  calculateParentMetrics(
    report: CustodyComplianceReport,
  ): ComplianceMetrics[] {
    const parentMetrics = new Map<string, ComplianceMetrics>();

    // Initialize metrics for each parent
    for (const parent of report.parents) {
      parentMetrics.set(parent.id, {
        parentId: parent.id,
        scheduledHours: 0,
        actualHours: 0,
        compliancePercentage: 0,
        deviationHours: 0,
        overrideCount: 0,
      });
    }

    // Calculate metrics from periods
    for (const period of report.periods) {
      const duration = (new Date(period.endTime).getTime() - new Date(period.startTime).getTime()) / (1000 * 60 * 60);

      const scheduledMetrics = parentMetrics.get(period.scheduledParentId);
      if (scheduledMetrics) {
        scheduledMetrics.scheduledHours += duration;
      }

      if (period.actualParentId) {
        const actualMetrics = parentMetrics.get(period.actualParentId);
        if (actualMetrics) {
          actualMetrics.actualHours += duration;
        }
      }
    }

    // Calculate percentages and deviations
    for (const metrics of parentMetrics.values()) {
      if (metrics.scheduledHours > 0) {
        metrics.compliancePercentage = (metrics.actualHours / metrics.scheduledHours) * 100;
        metrics.deviationHours = metrics.scheduledHours - metrics.actualHours;
      }
    }

    return Array.from(parentMetrics.values());
  }
}