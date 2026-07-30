import { describe, it, expect } from 'vitest';
import {
  getDateRange,
  PRESET_LABELS,
  formatDateForQuery,
  DatePreset,
} from '../datePresets';
import { subDays } from 'date-fns';

describe('datePresets', () => {
  describe('getDateRange', () => {
    it('should return today range for today preset', () => {
      const range = getDateRange('today');
      const today = new Date();

      expect(range.preset).toBe('today');
      expect(range.startDate.toDateString()).toBe(today.toDateString());
      expect(range.endDate.toDateString()).toBe(today.toDateString());
      expect(range.label).toBe(PRESET_LABELS.today);
    });

    it('should return yesterday range for yesterday preset', () => {
      const range = getDateRange('yesterday');
      const yesterday = subDays(new Date(), 1);

      expect(range.preset).toBe('yesterday');
      expect(range.startDate.toDateString()).toBe(yesterday.toDateString());
      expect(range.endDate.toDateString()).toBe(yesterday.toDateString());
      expect(range.label).toBe(PRESET_LABELS.yesterday);
    });

    it('should throw for custom preset without dates', () => {
      expect(() => getDateRange('custom')).toThrow();
    });

    it('should throw for custom preset with only start date', () => {
      expect(() => getDateRange('custom', '2026-07-20')).toThrow();
    });

    it('should throw for custom preset with only end date', () => {
      expect(() => getDateRange('custom', undefined, '2026-07-30')).toThrow();
    });

    it('should parse custom dates correctly', () => {
      const range = getDateRange('custom', '2026-07-20', '2026-07-30');

      expect(range.preset).toBe('custom');
      expect(formatDateForQuery(range.startDate)).toBe('2026-07-20');
      expect(formatDateForQuery(range.endDate)).toBe('2026-07-30');
      // Verify endDate is at end-of-day (23:59:59.999)
      expect(range.endDate.getHours()).toBe(23);
      expect(range.endDate.getMinutes()).toBe(59);
      expect(range.endDate.getSeconds()).toBe(59);
    });

    it('should throw when custom start date is after end date', () => {
      expect(() => getDateRange('custom', '2026-07-30', '2026-07-20')).toThrow(
        'Custom start date must be before or equal to end date',
      );
    });

    it('should throw for invalid custom dates', () => {
      expect(() => getDateRange('custom', 'invalid', '2026-07-30')).toThrow();
      expect(() => getDateRange('custom', '2026-07-20', 'invalid')).toThrow();
    });

    it('should handle thisWeek range', () => {
      const range = getDateRange('thisWeek');
      const today = new Date();

      expect(range.preset).toBe('thisWeek');
      expect(range.label).toBe(PRESET_LABELS.thisWeek);
      // startDate should be a date and endDate should be after startDate
      expect(range.startDate).toBeInstanceOf(Date);
      expect(range.endDate).toBeInstanceOf(Date);
      expect(range.endDate.getTime()).toBeGreaterThanOrEqual(
        range.startDate.getTime(),
      );
      // startDate should be at or before today
      expect(range.startDate.getTime()).toBeLessThanOrEqual(today.getTime());
      // endDate should be at or after today
      expect(range.endDate.getTime()).toBeGreaterThanOrEqual(today.getTime());
    });

    it('should handle thisMonth range', () => {
      const range = getDateRange('thisMonth');
      const today = new Date();

      expect(range.preset).toBe('thisMonth');
      expect(range.label).toBe(PRESET_LABELS.thisMonth);
      expect(range.startDate).toBeInstanceOf(Date);
      expect(range.endDate).toBeInstanceOf(Date);
      expect(range.endDate.getTime()).toBeGreaterThanOrEqual(
        range.startDate.getTime(),
      );
      // startDate should be the first day of the month
      expect(range.startDate.getDate()).toBe(1);
      // endDate should be in the same month as today
      expect(range.endDate.getMonth()).toBe(today.getMonth());
      expect(range.endDate.getFullYear()).toBe(today.getFullYear());
    });

    it('should handle last7 range', () => {
      const range = getDateRange('last7');

      expect(range.preset).toBe('last7');
      expect(range.label).toBe(PRESET_LABELS.last7);
      expect(range.startDate).toBeInstanceOf(Date);
      expect(range.endDate).toBeInstanceOf(Date);
      // Should be 7 days apart (approximately)
      const diffInDays = Math.floor(
        (range.endDate.getTime() - range.startDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      expect(diffInDays).toBe(6); // 7 days inclusive means 6 days difference
    });

    it('should handle last30 range', () => {
      const range = getDateRange('last30');

      expect(range.preset).toBe('last30');
      expect(range.label).toBe(PRESET_LABELS.last30);
      expect(range.startDate).toBeInstanceOf(Date);
      expect(range.endDate).toBeInstanceOf(Date);
      // Should be 30 days apart (approximately)
      const diffInDays = Math.floor(
        (range.endDate.getTime() - range.startDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      expect(diffInDays).toBe(29); // 30 days inclusive means 29 days difference
    });
  });

  describe('PRESET_LABELS', () => {
    it('should return correct labels for each preset', () => {
      const presets: DatePreset[] = [
        'today',
        'yesterday',
        'thisWeek',
        'thisMonth',
        'last7',
        'last30',
        'custom',
      ];

      presets.forEach((preset) => {
        expect(PRESET_LABELS[preset]).toBeDefined();
        expect(typeof PRESET_LABELS[preset]).toBe('string');
        expect(PRESET_LABELS[preset].length).toBeGreaterThan(0);
      });
    });
  });

  describe('formatDateForQuery', () => {
    it('should format dates as YYYY-MM-DD', () => {
      const date = new Date(2026, 6, 30); // July 30, 2026
      expect(formatDateForQuery(date)).toBe('2026-07-30');
    });

    it('should handle various dates correctly', () => {
      const testCases = [
        { date: new Date(2026, 0, 1), expected: '2026-01-01' },
        { date: new Date(2026, 11, 31), expected: '2026-12-31' },
        { date: new Date(2025, 5, 15), expected: '2025-06-15' },
      ];

      testCases.forEach(({ date, expected }) => {
        expect(formatDateForQuery(date)).toBe(expected);
      });
    });

    it('should pad single digit months and days', () => {
      const date = new Date(2026, 2, 5); // March 5, 2026
      expect(formatDateForQuery(date)).toBe('2026-03-05');
    });
  });
});
