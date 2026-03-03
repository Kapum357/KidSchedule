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
  });
});
