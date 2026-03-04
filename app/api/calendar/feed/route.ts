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

    // Generate iCalendar content with VTIMEZONE
    const icalContent = generateICalendar(events, familyId);

    return new NextResponse(icalContent, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="kidschedule-${familyId}.ics"`,
      },
    });
  } catch (error) {
    console.error("Calendar feed error:", error);
    return NextResponse.json({ error: "Failed to generate calendar feed" }, { status: 500 });
  }
}

/**
 * Generate iCalendar content with VTIMEZONE for timezone-aware events.
 */
function generateICalendar(events: any[], familyId: string): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  let ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//KidSchedule//Calendar Feed//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:KidSchedule Family Calendar
X-WR-TIMEZONE:America/New_York
`;

  // Add VTIMEZONE component for America/New_York (Eastern Time)
  ical += `BEGIN:VTIMEZONE
TZID:America/New_York
X-LIC-LOCATION:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
`;

  // Add events
  for (const event of events) {
    const uid = `${event.id}@kidschedule.com`;
    const dtstamp = now;
    const dtstart = new Date(event.startAt).toISOString().replace(/[-:]/g, "").split(".")[0];
    const dtend = new Date(event.endAt).toISOString().replace(/[-:]/g, "").split(".")[0];

    ical += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstamp}
DTSTART;TZID=America/New_York:${dtstart}
DTEND;TZID=America/New_York:${dtend}
SUMMARY:${event.title || "Calendar Event"}
DESCRIPTION:${event.description || ""}
LOCATION:${event.location || ""}
END:VEVENT
`;
  }

  ical += "END:VCALENDAR\n";

  return ical;
}