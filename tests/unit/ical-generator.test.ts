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
  });
});
