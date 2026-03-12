/* eslint-disable @typescript-eslint/no-explicit-any */

import { generateICalFeed } from '@/lib/ical-generator';

describe('ICS Generator', () => {
  describe('generateICalFeed', () => {
    it('should return valid VCALENDAR structure for empty events array', () => {
      const result = generateICalFeed([], {
        id: 'family-1',
        name: 'Smith Family',
      });

      expect(result).toContain('BEGIN:VCALENDAR');
      expect(result).toContain('VERSION:2.0');
      expect(result).toContain('PRODID:-//KidSchedule//EN');
      expect(result).toContain('CALSCALE:GREGORIAN');
      expect(result).toContain('METHOD:PUBLISH');
      expect(result).toContain('END:VCALENDAR');
      expect(result).not.toContain('BEGIN:VEVENT');
      // timezone should only appear when provided
      expect(result).not.toContain('X-WR-TIMEZONE');
    });

    it('should throw error when family metadata is null', () => {
      expect(() => generateICalFeed([], null as any)).toThrow(
        'Invalid family metadata: both id and name are required'
      );
    });

    it('should throw error when family id is missing', () => {
      expect(() =>
        generateICalFeed([], {
          id: '',
          name: 'Smith Family',
        })
      ).toThrow('Invalid family metadata: both id and name are required');
    });

    it('should throw error when family name is missing', () => {
      expect(() =>
        generateICalFeed([], {
          id: 'family-1',
          name: '',
        })
      ).toThrow('Invalid family metadata: both id and name are required');
    });

    it('should throw error when events is not an array', () => {
      expect(() =>
        generateICalFeed(null as any, {
          id: 'family-1',
          name: 'Smith Family',
        })
      ).toThrow('Events must be an array');
    });

    it('should generate VEVENT block for all-day event with correct formatting', () => {
      const allDayEvent = {
        id: '1',
        familyId: 'family-1',
        title: 'School Holiday',
        description: 'No school today',
        location: 'Home',
        startDate: new Date(2026, 2, 15), // March 15, 2026 in local time
        endDate: new Date(2026, 2, 16), // March 16, 2026 in local time
        isAllDay: true,
        category: 'holiday',
      };

      const result = generateICalFeed([allDayEvent], {
        id: 'family-1',
        name: 'Smith Family',
      });

      // Verify VEVENT block exists
      expect(result).toContain('BEGIN:VEVENT');
      expect(result).toContain('END:VEVENT');

      // Verify UID format
      expect(result).toContain('UID:event-1@family-1.kidschedule.app');

      // Verify DTSTART uses DATE format for all-day events
      expect(result).toContain('DTSTART;VALUE=DATE:20260315');

      // Verify SUMMARY with title
      expect(result).toContain('SUMMARY:School Holiday');

      // Verify optional fields are included
      expect(result).toContain('DESCRIPTION:No school today');
      expect(result).toContain('LOCATION:Home');
      expect(result).toContain('CATEGORIES:holiday');

      // Verify DTSTAMP exists (with current UTC time)
      expect(result).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    });

    it('should only include optional fields when provided', () => {
      const minimalEvent = {
        id: '2',
        familyId: 'family-1',
        title: 'Birthday',
        startDate: new Date(2026, 3, 20), // April 20, 2026
        endDate: new Date(2026, 3, 21), // April 21, 2026
        isAllDay: true,
        category: 'birthday',
      };

      const result = generateICalFeed([minimalEvent], {
        id: 'family-1',
        name: 'Smith Family',
      });

      // Verify VEVENT block exists
      expect(result).toContain('BEGIN:VEVENT');
      expect(result).toContain('END:VEVENT');

      // Verify required fields
      expect(result).toContain('UID:event-2@family-1.kidschedule.app');
      expect(result).toContain('SUMMARY:Birthday');
      expect(result).toContain('CATEGORIES:birthday');

      // Verify optional fields are NOT included
      expect(result).not.toContain('DESCRIPTION:');
      expect(result).not.toContain('LOCATION:');
    });

    it('should properly escape special characters in event fields', () => {
      const eventWithSpecialChars = {
        id: '3',
        familyId: 'family-1',
        title: 'Meeting; Important\\Item,Test',
        description: 'Event\nwith\nmultiple\nlines',
        startDate: new Date(2026, 4, 10), // May 10, 2026
        endDate: new Date(2026, 4, 11), // May 11, 2026
        isAllDay: true,
        category: 'work;meeting',
      };

      const result = generateICalFeed([eventWithSpecialChars], {
        id: 'family-1',
        name: 'Smith Family',
      });

      // Verify escaped characters in title
      expect(result).toContain('SUMMARY:Meeting\\; Important\\\\Item\\,Test');

      // Verify escaped newlines in description
      expect(result).toContain('DESCRIPTION:Event\\nwith\\nmultiple\\nlines');

      // Verify escaped characters in category
      expect(result).toContain('CATEGORIES:work\\;meeting');
    });

    it('generates timed event with UTC datetime format', () => {
      const events = [
        {
          id: 'event-3',
          familyId: 'family-123',
          title: 'Soccer Practice',
          startDate: new Date('2024-03-15T14:30:00Z'),
          endDate: new Date('2024-03-15T15:30:00Z'),
          isAllDay: false,
          category: 'Sports',
        },
      ];

      const result = generateICalFeed(events, {
        id: 'family-123',
        name: 'Smith Family',
      });

      // Verify VEVENT block exists
      expect(result).toContain('BEGIN:VEVENT');
      expect(result).toContain('END:VEVENT');

      // Verify DTSTART uses UTC datetime format for timed events
      expect(result).toContain('DTSTART:20240315T143000Z');

      // Verify VALUE=DATE is NOT used for timed events
      expect(result).not.toContain('VALUE=DATE');

      // Verify UID format
      expect(result).toContain('UID:event-event-3@family-123.kidschedule.app');

      // Verify SUMMARY with title
      expect(result).toContain('SUMMARY:Soccer Practice');

      // Verify CATEGORIES
      expect(result).toContain('CATEGORIES:Sports');

      // Verify DTSTAMP exists (with current UTC time)
      expect(result).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    });

    it('includes timezone metadata and TZID when family timezone is provided', () => {
      const events = [
        {
          id: 'event-3',
          familyId: 'family-123',
          title: 'Soccer Practice',
          startDate: new Date('2024-03-15T14:30:00Z'),
          endDate: new Date('2024-03-15T15:30:00Z'),
          isAllDay: false,
          category: 'Sports',
        },
      ];

      const result = generateICalFeed(events, {
        id: 'family-123',
        name: 'Smith Family',
        timezone: 'America/New_York',
      });

      // Should declare timezone at calendar level
      expect(result).toContain('X-WR-TIMEZONE:America/New_York');
      expect(result).toContain('BEGIN:VTIMEZONE');
      expect(result).toContain('TZID:America/New_York');

      // Events should use TZID parameter even though timestamps remain UTC-formatted
      expect(result).toContain('DTSTART;TZID=America/New_York:20240315T143000Z');
      expect(result).toContain('DTEND;TZID=America/New_York:20240315T153000Z');
    });

    it('handles multiple special characters in all fields', () => {
      const events = [
        {
          id: 'event-4',
          familyId: 'family-456',
          title: 'Team Meeting; Preparation',
          description: 'Discuss: Budget, Timeline\nQ&A Session',
          location: 'Room #5; Building A',
          startDate: new Date('2024-03-20T10:00:00Z'),
          endDate: new Date('2024-03-20T11:00:00Z'),
          isAllDay: false,
          category: 'Work,Important',
        },
      ];

      const result = generateICalFeed(events, {
        id: 'family-456',
        name: "Johnson's Team",
      });

      // Verify title sanitization with semicolon
      expect(result).toContain('SUMMARY:Team Meeting\\; Preparation');

      // Verify description sanitization with comma and newline (colon is not escaped per RFC 5545)
      expect(result).toContain('DESCRIPTION:Discuss: Budget\\, Timeline\\nQ&A Session');

      // Verify location sanitization with semicolon
      expect(result).toContain('LOCATION:Room #5\\; Building A');

      // Verify category sanitization with comma
      expect(result).toContain('CATEGORIES:Work\\,Important');
    });

    it('correctly escapes backslashes before other special characters', () => {
      const events = [
        {
          id: 'event-5',
          familyId: 'family-456',
          title: 'Path: C:\\Users\\Documents',
          description: 'Notes: Use \\ separator',
          startDate: new Date('2024-03-21T09:00:00Z'),
          endDate: new Date('2024-03-21T10:00:00Z'),
          isAllDay: false,
          category: 'Info',
        },
      ];

      const result = generateICalFeed(events, {
        id: 'family-456',
        name: 'Test',
      });

      // Backslashes should be escaped: input \ becomes \\ in ICS output
      // Verify that backslash escaping works by checking the escaped sequence
      const summaryLine = result.split('\r\n').find(line => line.startsWith('SUMMARY:'));
      const descriptionLine = result.split('\r\n').find(line => line.startsWith('DESCRIPTION:'));

      expect(summaryLine).toBeDefined();
      expect(descriptionLine).toBeDefined();

      // Each input backslash should become two backslashes in the output
      expect(summaryLine).toEqual('SUMMARY:Path: C:\\\\Users\\\\Documents');
      expect(descriptionLine).toEqual('DESCRIPTION:Notes: Use \\\\ separator');
    });

    it('should include multiple events and omit optional fields when missing', () => {
      const events = [
        {
          id: 'event-1',
          familyId: 'family-1',
          title: 'Event 1',
          // No description or location
          startDate: new Date('2026-03-10'),
          endDate: new Date('2026-03-11'),
          isAllDay: true,
          category: 'activity',
        },
        {
          id: 'event-2',
          familyId: 'family-1',
          title: 'Event 2',
          description: 'With description',
          location: 'At home',
          startDate: new Date('2026-03-15'),
          endDate: new Date('2026-03-16'),
          isAllDay: true,
          category: 'medical',
        },
      ];

      const result = generateICalFeed(events, { id: 'family-1', name: 'Smith' });

      // Both events present
      expect(result.match(/BEGIN:VEVENT/g)).toHaveLength(2);
      expect(result).toContain('UID:event-event-1@family-1.kidschedule.app');
      expect(result).toContain('UID:event-event-2@family-1.kidschedule.app');

      // Optional fields only in Event 2
      const event1Index = result.indexOf('UID:event-event-1@family-1.kidschedule.app');
      const event2Index = result.indexOf('UID:event-event-2@family-1.kidschedule.app');
      const event1Section = result.substring(event1Index, event2Index);
      const event2Section = result.substring(event2Index);

      expect(event1Section).not.toContain('DESCRIPTION:');
      expect(event1Section).not.toContain('LOCATION:');
      expect(event2Section).toContain('DESCRIPTION:With description');
      expect(event2Section).toContain('LOCATION:At home');
    });
  });
});
