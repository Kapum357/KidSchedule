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

  // Events will be added in subsequent tasks

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}
