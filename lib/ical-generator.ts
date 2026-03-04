// Metadata about a family used when generating calendar feeds.  The
// `timezone` field is optional; when present the generated iCalendar will
// include a minimal VTIMEZONE component and timed events will have a TZID
// parameter.  This covers Task 2 (timezone-aware event handling).
export interface FamilyMetadata {
  id: string;
  name: string;
  timezone?: string;
}

export interface DbCalendarEvent {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  isAllDay: boolean;
  category: string;
}

/**
 * Sanitizes a string for use in iCalendar properties by escaping special characters
 * Order of escaping is important: backslash must be escaped first
 */
function sanitizeICalValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\') // Escape backslash first
    .replace(/;/g, '\\;') // Then semicolon
    .replace(/,/g, '\\,') // Then comma
    .replace(/\n/g, '\\n'); // Then newlines
}

/**
 * Formats a Date object as YYYYMMDD for all-day events (DATE value format)
 */
function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Formats a Date object as YYYYMMDDTHHmmssZ for UTC datetime (DATETIME value format)
 */
function formatDateTimeUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Helper that builds a VEVENT block for a single calendar event.
 * Keeping this logic separate reduces complexity in the main generator.
 */
function buildVEvent(
  event: DbCalendarEvent,
  familyId: string,
  timezone?: string,
): string[] {
  const vevent: string[] = [
    'BEGIN:VEVENT',
    `UID:event-${event.id}@${familyId}.kidschedule.app`,
    `DTSTAMP:${formatDateTimeUTC(new Date())}`,
    `SUMMARY:${sanitizeICalValue(event.title)}`,
  ];

  if (event.isAllDay) {
    vevent.push(`DTSTART;VALUE=DATE:${formatDateOnly(event.startDate)}`);
  } else if (timezone) {
    vevent.push(`DTSTART;TZID=${timezone}:${formatDateTimeUTC(event.startDate)}`);
  } else {
    vevent.push(`DTSTART:${formatDateTimeUTC(event.startDate)}`);
  }

  if (event.description) {
    vevent.push(`DESCRIPTION:${sanitizeICalValue(event.description)}`);
  }

  if (event.location) {
    vevent.push(`LOCATION:${sanitizeICalValue(event.location)}`);
  }

  vevent.push(`CATEGORIES:${sanitizeICalValue(event.category)}`);

  if (!event.isAllDay) {
    if (timezone) {
      vevent.push(`DTEND;TZID=${timezone}:${formatDateTimeUTC(event.endDate)}`);
    } else {
      vevent.push(`DTEND:${formatDateTimeUTC(event.endDate)}`);
    }
  }

  vevent.push('END:VEVENT');
  return vevent;
}

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export function generateICalFeed(
  events: DbCalendarEvent[],
  family: FamilyMetadata,
): string {
  // Input validation
  if (!family?.id || !family?.name) {
    throw new Error('Invalid family metadata: both id and name are required');
  }
  if (!Array.isArray(events)) {
    throw new Error('Events must be an array');
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KidSchedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  // If the family has a timezone we advertise it and emit a minimal
  // VTIMEZONE block so calendar clients know how to interpret TZID values.
  if (family.timezone) {
    lines.push(`X-WR-TIMEZONE:${family.timezone}`);
    lines.push('BEGIN:VTIMEZONE');
    lines.push(`TZID:${family.timezone}`);
    // A fully‑fledged VTIMEZONE with offsets and rules is complex; most
    // clients will fetch their own data for the named zone.  Keeping it
    // minimal avoids having to bundle the Olson database here.
    lines.push('END:VTIMEZONE');
  }

  // Add events
  for (const event of events) {
    lines.push(...buildVEvent(event, family.id, family.timezone));
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}
