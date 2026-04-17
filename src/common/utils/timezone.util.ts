import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';

/** Egypt is always UTC+2 (no DST) */
export const CAIRO_TIMEZONE = 'Africa/Cairo';

/**
 * Convert a Cairo local Date to UTC for storage/scheduling.
 */
export function cairoToUtc(cairoDate: Date): Date {
  return zonedTimeToUtc(cairoDate, CAIRO_TIMEZONE);
}

/**
 * Convert a UTC Date to Cairo local time for display.
 */
export function utcToCairo(utcDate: Date): Date {
  return utcToZonedTime(utcDate, CAIRO_TIMEZONE);
}

/**
 * Calculate delay (ms) from now until a Cairo-local target time.
 * Returns 0 if the time is in the past.
 */
export function msUntilCairoTime(cairoTargetDate: Date): number {
  const utcTarget = cairoToUtc(cairoTargetDate);
  return Math.max(0, utcTarget.getTime() - Date.now());
}
