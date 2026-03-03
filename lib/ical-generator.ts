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
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KidSchedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  // Events will be added in subsequent tasks

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}
