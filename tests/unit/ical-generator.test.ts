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
  });
});
