/**
 * Unit Tests for Schedule Wizard Engine
 *
 * Tests core domain logic for custody schedule templates, pattern configuration,
 * and preview generation. Validates template validation, date calculations,
 * segment rendering, and parent percentage calculations.
 */

import {
  getScheduleTemplates,
  getWizardSteps,
  getPickupTimeOptions,
  getDropoffTimeOptions,
  getDefaultScheduleStartDate,
  getDefaultPatternConfig,
  isTemplateId,
  resolveTemplate,
  getSegmentWidthPercent,
  generatePatternPreview,
  type TemplateId,
  type RotationStarter,
  type PreviewMode,
  type PatternConfigInput,
} from '@/lib/schedule-wizard-engine';

describe('Schedule Wizard Engine', () => {
  describe('Metadata Functions', () => {
    describe('getScheduleTemplates', () => {
      it('should return array of templates', () => {
        const templates = getScheduleTemplates();
        expect(Array.isArray(templates)).toBe(true);
        expect(templates.length).toBeGreaterThan(0);
      });

      it('should include standard templates', () => {
        const templates = getScheduleTemplates();
        const ids = templates.map(t => t.id);
        expect(ids).toContain('2-2-3');
        expect(ids).toContain('alternating-weeks');
        expect(ids).toContain('2-2-5-5');
        expect(ids).toContain('custom');
      });
    });

    describe('getWizardSteps', () => {
      it('should return 3 wizard steps', () => {
        const steps = getWizardSteps();
        expect(steps.length).toBe(3);
      });
    });

    describe('getPickupTimeOptions', () => {
      it('should return array of pickup time options', () => {
        const options = getPickupTimeOptions();
        expect(Array.isArray(options)).toBe(true);
        expect(options.length).toBeGreaterThan(0);
      });
    });

    describe('getDropoffTimeOptions', () => {
      it('should return array of dropoff time options', () => {
        const options = getDropoffTimeOptions();
        expect(Array.isArray(options)).toBe(true);
        expect(options.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Validation Functions', () => {
    describe('isTemplateId', () => {
      it('should return true for valid template IDs', () => {
        expect(isTemplateId('2-2-3')).toBe(true);
        expect(isTemplateId('alternating-weeks')).toBe(true);
        expect(isTemplateId('custom')).toBe(true);
      });

      it('should return false for invalid template IDs', () => {
        expect(isTemplateId('invalid')).toBe(false);
        expect(isTemplateId(null)).toBe(false);
      });
    });

    describe('resolveTemplate', () => {
      it('should return template for valid ID', () => {
        const template = resolveTemplate('2-2-3');
        expect(template.id).toBe('2-2-3');
      });

      it('should return first template for invalid ID', () => {
        const template = resolveTemplate('invalid');
        expect(template.id).toBe('2-2-3');
      });
    });
  });

  describe('Configuration Functions', () => {
    describe('getDefaultScheduleStartDate', () => {
      it('should return ISO date format', () => {
        const result = getDefaultScheduleStartDate();
        expect(/^\d{4}-\d{2}-\d{2}$/.test(result)).toBe(true);
      });
    });

    describe('getDefaultPatternConfig', () => {
      it('should return valid pattern config', () => {
        const config = getDefaultPatternConfig();
        expect(config.templateId).toBe('2-2-3');
        expect(config.rotationStarter).toBe('A');
      });
    });
  });

  describe('Segment Calculation', () => {
    describe('getSegmentWidthPercent', () => {
      it('should calculate segment width percentage', () => {
        const template = resolveTemplate('2-2-3');
        const segment = template.segments[0];
        const percent = getSegmentWidthPercent(template, segment);
        expect(percent).toBeGreaterThan(0);
        expect(percent).toBeLessThanOrEqual(100);
      });

      it('should return 0 for empty template with no segments', () => {
        const customTemplate = resolveTemplate('custom');
        const fakeSegment = { days: 5, parent: 'A' as const };
        const percent = getSegmentWidthPercent(customTemplate, fakeSegment);
        expect(percent).toBe(0);
      });
    });
  });

  describe('Pattern Preview Generation', () => {
    describe('generatePatternPreview', () => {
      it('should generate preview for bi-weekly mode', () => {
        const config = {
          templateId: '2-2-3' as TemplateId,
          scheduleStartDate: '2024-01-08',
          rotationStarter: 'A' as RotationStarter,
          pickupTime: '03:00 PM - After School',
          dropoffTime: 'Same as Pick-up',
          mode: 'bi-weekly' as PreviewMode,
        };
        const preview = generatePatternPreview(config);
        expect(preview.days.length).toBe(14);
        expect(preview.parentADays + preview.parentBDays).toBe(14);
      });

      it('should generate preview for monthly mode', () => {
        const config = {
          templateId: '2-2-3' as TemplateId,
          scheduleStartDate: '2024-01-08',
          rotationStarter: 'A' as RotationStarter,
          pickupTime: '03:00 PM - After School',
          dropoffTime: 'Same as Pick-up',
          mode: 'monthly' as PreviewMode,
        };
        const preview = generatePatternPreview(config);
        expect(preview.days.length).toBe(28);
      });

      it('should swap parents when rotationStarter is B', () => {
        const config = {
          templateId: '2-2-3' as TemplateId,
          scheduleStartDate: '2024-01-08',
          rotationStarter: 'B' as RotationStarter,
          pickupTime: '03:00 PM - After School',
          dropoffTime: 'Same as Pick-up',
          mode: 'bi-weekly' as PreviewMode,
        };
        const preview = generatePatternPreview(config);
        const firstDay = preview.days[0];
        expect(firstDay.parent).toBe('B');
      });

      it('should use fallback date when ISO date format is invalid', () => {
        const config = {
          templateId: '2-2-3' as TemplateId,
          scheduleStartDate: 'not-a-date',
          rotationStarter: 'A' as RotationStarter,
          pickupTime: '03:00 PM - After School',
          dropoffTime: 'Same as Pick-up',
          mode: 'bi-weekly' as PreviewMode,
        };
        const preview = generatePatternPreview(config);
        expect(preview.days.length).toBe(14);
        expect(preview.days[0].isoDate).toBeTruthy();
      });
    });
  });
});
