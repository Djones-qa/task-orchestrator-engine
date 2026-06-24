/**
 * Cron Expression Parser and Next-Run Calculator
 *
 * Supports 5-field cron expressions:
 *   minute (0-59), hour (0-23), day-of-month (1-31), month (1-12), day-of-week (0-6, 0=Sunday)
 *
 * Supported syntax per field:
 *   - '*' (any value)
 *   - Specific numbers (e.g., '5')
 *   - Ranges (e.g., '1-5')
 *   - Lists (e.g., '1,3,5')
 *   - Step values (e.g., star/5, 1-30/2)
 */

export interface CronFields {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

interface FieldSpec {
  name: string;
  min: number;
  max: number;
}

const FIELD_SPECS: FieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day-of-month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day-of-week', min: 0, max: 6 },
];

/**
 * Parse a single cron field token into a sorted array of valid integer values.
 */
function parseField(token: string, spec: FieldSpec): number[] {
  const values = new Set<number>();

  const parts = token.split(',');
  for (const part of parts) {
    if (part.includes('/')) {
      // Step value: */5 or 1-30/5
      const [rangeStr, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) {
        throw new Error(
          `Invalid step value "${stepStr}" in field "${spec.name}"`
        );
      }

      let start: number;
      let end: number;
      if (rangeStr === '*') {
        start = spec.min;
        end = spec.max;
      } else if (rangeStr.includes('-')) {
        const [s, e] = rangeStr.split('-').map(Number);
        if (isNaN(s) || isNaN(e)) {
          throw new Error(
            `Invalid range "${rangeStr}" in field "${spec.name}"`
          );
        }
        start = s;
        end = e;
      } else {
        start = parseInt(rangeStr, 10);
        if (isNaN(start)) {
          throw new Error(
            `Invalid value "${rangeStr}" in field "${spec.name}"`
          );
        }
        end = spec.max;
      }

      validateRange(start, end, spec);
      for (let i = start; i <= end; i += step) {
        values.add(i);
      }
    } else if (part.includes('-')) {
      // Range: 1-5
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end)) {
        throw new Error(
          `Invalid range "${part}" in field "${spec.name}"`
        );
      }
      validateRange(start, end, spec);
      for (let i = start; i <= end; i++) {
        values.add(i);
      }
    } else if (part === '*') {
      // Any value
      for (let i = spec.min; i <= spec.max; i++) {
        values.add(i);
      }
    } else {
      // Single value
      const val = parseInt(part, 10);
      if (isNaN(val)) {
        throw new Error(
          `Invalid value "${part}" in field "${spec.name}"`
        );
      }
      if (val < spec.min || val > spec.max) {
        throw new Error(
          `Value ${val} out of range [${spec.min}-${spec.max}] in field "${spec.name}"`
        );
      }
      values.add(val);
    }
  }

  if (values.size === 0) {
    throw new Error(`Field "${spec.name}" produced no valid values`);
  }

  return Array.from(values).sort((a, b) => a - b);
}

function validateRange(start: number, end: number, spec: FieldSpec): void {
  if (start < spec.min || start > spec.max) {
    throw new Error(
      `Range start ${start} out of bounds [${spec.min}-${spec.max}] in field "${spec.name}"`
    );
  }
  if (end < spec.min || end > spec.max) {
    throw new Error(
      `Range end ${end} out of bounds [${spec.min}-${spec.max}] in field "${spec.name}"`
    );
  }
  if (start > end) {
    throw new Error(
      `Range start ${start} is greater than end ${end} in field "${spec.name}"`
    );
  }
}

/**
 * Parse a 5-field cron expression into structured CronFields.
 * Throws on invalid input.
 */
export function parseCronExpression(expr: string): CronFields {
  if (!expr || typeof expr !== 'string') {
    throw new Error('Cron expression must be a non-empty string');
  }

  const trimmed = expr.trim();
  const tokens = trimmed.split(/\s+/);

  if (tokens.length !== 5) {
    throw new Error(
      `Cron expression must have exactly 5 fields, got ${tokens.length}: "${trimmed}"`
    );
  }

  const minutes = parseField(tokens[0], FIELD_SPECS[0]);
  const hours = parseField(tokens[1], FIELD_SPECS[1]);
  const daysOfMonth = parseField(tokens[2], FIELD_SPECS[2]);
  const months = parseField(tokens[3], FIELD_SPECS[3]);
  const daysOfWeek = parseField(tokens[4], FIELD_SPECS[4]);

  return { minutes, hours, daysOfMonth, months, daysOfWeek };
}

/**
 * Get the number of days in a given month/year.
 */
function daysInMonth(year: number, month: number): number {
  // month is 1-based here; Date constructor month is 0-based
  return new Date(year, month, 0).getDate();
}

/**
 * Get day of week (0=Sunday) for a given date.
 */
function getDayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay();
}

/**
 * Find the next value >= current in a sorted array of allowed values.
 * Returns the value if found, or undefined if we need to overflow to next cycle.
 */
function findNextOrEqual(allowed: number[], current: number): number | undefined {
  for (const val of allowed) {
    if (val >= current) {
      return val;
    }
  }
  return undefined;
}

/**
 * Compute the next run time for a cron expression, strictly greater than the reference timestamp.
 *
 * @param cronExpr - 5-field cron expression string
 * @param referenceTimestamp - Reference time in milliseconds (epoch)
 * @param timezone - IANA timezone string (e.g., 'America/New_York'). Defaults to 'UTC'.
 * @returns Next run time as a Unix timestamp in milliseconds
 */
export function getNextRunTime(
  cronExpr: string,
  referenceTimestamp: number,
  timezone?: string
): number {
  const fields = parseCronExpression(cronExpr);
  const tz = timezone || 'UTC';

  // Start from reference + 1 minute, rounded down to minute boundary
  const startMs = referenceTimestamp + 60000;
  // Round down to minute boundary
  const startDate = new Date(startMs - (startMs % 60000));

  // Extract components in the target timezone
  let { year, month, day, hour, minute } = getDatePartsInTimezone(startDate, tz);

  // Safety limit to prevent infinite loops (scan up to 4 years ahead)
  const maxYear = year + 4;

  while (year <= maxYear) {
    // Find next valid month
    const nextMonth = findNextOrEqual(fields.months, month);
    if (nextMonth === undefined) {
      // Overflow: go to next year
      year++;
      month = fields.months[0];
      day = 1;
      hour = 0;
      minute = 0;
      continue;
    }
    if (nextMonth > month) {
      month = nextMonth;
      day = 1;
      hour = 0;
      minute = 0;
    }

    // Find next valid day-of-month
    const maxDays = daysInMonth(year, month);
    const validDays = fields.daysOfMonth.filter(d => d <= maxDays);
    if (validDays.length === 0) {
      // No valid days in this month, advance to next month
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
      day = 1;
      hour = 0;
      minute = 0;
      continue;
    }

    const nextDay = findNextOrEqual(validDays, day);
    if (nextDay === undefined) {
      // Overflow day: advance to next month
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
      day = 1;
      hour = 0;
      minute = 0;
      continue;
    }
    if (nextDay > day) {
      day = nextDay;
      hour = 0;
      minute = 0;
    }

    // Check day-of-week constraint
    const currentDow = getDayOfWeek(year, month, day);
    if (!fields.daysOfWeek.includes(currentDow)) {
      // Advance to next day
      day++;
      hour = 0;
      minute = 0;
      if (day > maxDays) {
        month++;
        if (month > 12) {
          month = 1;
          year++;
        }
        day = 1;
      }
      continue;
    }

    // Find next valid hour
    const nextHour = findNextOrEqual(fields.hours, hour);
    if (nextHour === undefined) {
      // Overflow hour: advance to next day
      day++;
      hour = 0;
      minute = 0;
      if (day > daysInMonth(year, month)) {
        month++;
        if (month > 12) {
          month = 1;
          year++;
        }
        day = 1;
      }
      continue;
    }
    if (nextHour > hour) {
      hour = nextHour;
      minute = 0;
    }

    // Find next valid minute
    const nextMinute = findNextOrEqual(fields.minutes, minute);
    if (nextMinute === undefined) {
      // Overflow minute: advance to next hour
      hour++;
      minute = 0;
      continue;
    }
    minute = nextMinute;

    // Build the result timestamp in the target timezone
    const resultMs = buildTimestampInTimezone(year, month, day, hour, minute, tz);

    // Final guarantee: result must be strictly greater than reference
    if (resultMs > referenceTimestamp) {
      return resultMs;
    }

    // If somehow not greater (e.g., timezone edge case), advance by one minute
    minute++;
    if (minute > 59) {
      minute = 0;
      hour++;
    }
  }

  throw new Error(
    `Could not compute next run time for cron expression "${cronExpr}" within 4 years of reference`
  );
}

/**
 * Extract year, month (1-12), day (1-31), hour (0-23), minute (0-59)
 * from a Date in a given timezone.
 */
function getDatePartsInTimezone(
  date: Date,
  timezone: string
): { year: number; month: number; day: number; hour: number; minute: number } {
  if (timezone === 'UTC') {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
    };
  }

  // Use Intl.DateTimeFormat to extract parts in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find(p => p.type === type);
    if (!part) throw new Error(`Cannot find ${type} in formatted date`);
    return parseInt(part.value, 10);
  };

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/**
 * Build a Unix timestamp (ms) from date components in a given timezone.
 */
function buildTimestampInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): number {
  if (timezone === 'UTC') {
    return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  }

  // For non-UTC timezones, we need to find the UTC time that corresponds to
  // the given local time in the target timezone.
  // Strategy: start with a UTC guess, then adjust based on the offset.
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  // Find what the local time is at our UTC guess
  const guessDate = new Date(utcGuess);
  const guessParts = getDatePartsInTimezone(guessDate, timezone);

  // Calculate offset: local_time = utc_time + offset
  // We want: target_local = utcGuess + offset => utc_result = utcGuess - offset
  // offset = guessParts - utcParts (expressed in minutes for simplicity)
  const guessLocalMinutes =
    guessParts.year * 525960 +
    guessParts.month * 43800 +
    guessParts.day * 1440 +
    guessParts.hour * 60 +
    guessParts.minute;

  const targetLocalMinutes =
    year * 525960 + month * 43800 + day * 1440 + hour * 60 + minute;

  const diffMinutes = targetLocalMinutes - guessLocalMinutes;
  const result = utcGuess + diffMinutes * 60000;

  // Verify the result maps to the correct local time
  const verifyParts = getDatePartsInTimezone(new Date(result), timezone);
  if (
    verifyParts.year === year &&
    verifyParts.month === month &&
    verifyParts.day === day &&
    verifyParts.hour === hour &&
    verifyParts.minute === minute
  ) {
    return result;
  }

  // If verification fails (DST transition edge case), try small adjustments
  for (const offsetMs of [3600000, -3600000, 7200000, -7200000]) {
    const adjusted = result + offsetMs;
    const adjParts = getDatePartsInTimezone(new Date(adjusted), timezone);
    if (
      adjParts.year === year &&
      adjParts.month === month &&
      adjParts.day === day &&
      adjParts.hour === hour &&
      adjParts.minute === minute
    ) {
      return adjusted;
    }
  }

  // Fallback: return the best guess
  return result;
}
