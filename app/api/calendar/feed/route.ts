/**
 * KidSchedule – Calendar Feed API (iCalendar)
 *
 * Generates iCalendar (.ics) feeds for family calendar events.
 * Includes VTIMEZONE component for timezone-aware event handling.
 *
 * GET /api/calendar/feed?familyId=<familyId>
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/persistence";
import { generateICalFeed } from "@/lib/ical-generator";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const familyId = searchParams.get("familyId");

  if (!familyId) {
    return NextResponse.json({ error: "familyId is required" }, { status: 400 });
  }

  try {
    const db = getDb();

    // Fetch calendar events for the family
    const events = await db.calendarEvents.findByFamilyId(familyId);

    // Map to library's DbCalendarEvent shape
    const icalEvents = events.map(e => ({
      id: e.id,
      familyId,
      title: e.title,
      description: e.description,
      location: e.location,
      startDate: new Date(e.startAt),
      endDate: new Date(e.endAt),
      isAllDay: e.allDay,
      category: e.category,
    }));

    // Generate iCalendar content with timezone awareness (hardcoded for now)
    const icalContent = generateICalFeed(icalEvents, {
      id: familyId,
      name: `Family ${familyId}`,
      timezone: 'America/New_York',
    });

    return new NextResponse(icalContent, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="kidschedule-${familyId}.ics"`,
      },
    });
  } catch (error) {
    console.info("Calendar feed error:", error);
    return NextResponse.json({ error: "Failed to generate calendar feed" }, { status: 500 });
  }
}