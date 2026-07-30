import {
  startOfToday,
  endOfToday,
  startOfYesterday,
  endOfYesterday,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  endOfDay,
  subDays,
  parse,
  isValid,
  format,
} from 'date-fns';

/**
 * Supported date preset types
 */
export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'thisMonth'
  | 'last7'
  | 'last30'
  | 'custom';

/**
 * Date range with metadata
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
  label: string;
  preset: DatePreset;
}

/**
 * Human-readable labels for each preset
 */
export const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  thisMonth: 'This Month',
  last7: 'Last 7 Days',
  last30: 'Last 30 Days',
  custom: 'Custom Range',
};

/**
 * Formats a Date object to 'YYYY-MM-DD' format for queries
 */
export function formatDateForQuery(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Parses a date string in 'YYYY-MM-DD' format
 */
function parseDateString(dateString: string): Date {
  const parsed = parse(dateString, 'yyyy-MM-dd', new Date());
  if (!isValid(parsed)) {
    throw new Error(`Invalid date format: ${dateString}. Expected YYYY-MM-DD`);
  }
  return parsed;
}

/**
 * Gets the date range for a given preset
 * For 'custom' preset, both customStart and customEnd must be provided in 'YYYY-MM-DD' format
 */
export function getDateRange(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string,
): DateRange {
  let startDate: Date;
  let endDate: Date;

  switch (preset) {
    case 'today':
      startDate = startOfToday();
      endDate = endOfToday();
      break;

    case 'yesterday':
      startDate = startOfYesterday();
      endDate = endOfYesterday();
      break;

    case 'thisWeek':
      startDate = startOfWeek(new Date());
      endDate = endOfWeek(new Date());
      break;

    case 'thisMonth':
      startDate = startOfMonth(new Date());
      endDate = endOfMonth(new Date());
      break;

    case 'last7':
      endDate = endOfToday();
      startDate = startOfToday();
      startDate = subDays(startDate, 6); // 7 days inclusive
      break;

    case 'last30':
      endDate = endOfToday();
      startDate = startOfToday();
      startDate = subDays(startDate, 29); // 30 days inclusive
      break;

    case 'custom':
      if (!customStart || !customEnd) {
        throw new Error(
          'Custom preset requires both customStart and customEnd in YYYY-MM-DD format',
        );
      }
      startDate = parseDateString(customStart);
      endDate = endOfDay(parseDateString(customEnd));
      if (startDate > endDate) {
        throw new Error('Custom start date must be before or equal to end date');
      }
      break;

    default:
      const _exhaustive: never = preset;
      throw new Error(`Unknown preset: ${_exhaustive}`);
  }

  return {
    startDate,
    endDate,
    label: PRESET_LABELS[preset],
    preset,
  };
}
