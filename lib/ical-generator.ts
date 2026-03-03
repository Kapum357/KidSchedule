export interface FamilyMetadata {
  id: string;
  name: string;
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

export function generateICalFeed(
  events: DbCalendarEvent[],
  family: FamilyMetadata
): string {
  // Input validation
  if (!family || !family.id || !family.name) {
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
    // TODO: Add VTIMEZONE component in Task 2 for timezone-aware event handling
  ];

  // Add events
  for (const event of events) {
    const vevent: string[] = [
      'BEGIN:VEVENT',
      `UID:event-${event.id}@${family.id}.kidschedule.app`,
      `DTSTAMP:${formatDateTimeUTC(new Date())}`,
      event.isAllDay
        ? `DTSTART;VALUE=DATE:${formatDateOnly(event.startDate)}`
        : `DTSTART:${formatDateTimeUTC(event.startDate)}`,
      `SUMMARY:${sanitizeICalValue(event.title)}`,
    ];

    if (event.description) {
      vevent.push(`DESCRIPTION:${sanitizeICalValue(event.description)}`);
    }

    if (event.location) {
      vevent.push(`LOCATION:${sanitizeICalValue(event.location)}`);
    }

    vevent.push(`CATEGORIES:${sanitizeICalValue(event.category)}`);
    vevent.push('END:VEVENT');

    lines.push(...vevent);
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}
