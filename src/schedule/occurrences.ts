import type { CleaningRule } from '../alia/types.ts';

/** Parse YYYY-MM-DD as a UTC calendar date. UTC avoids DST shifting the day. */
function toDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Which occurrence of its weekday this date is within its month: 1-based. */
function occurrenceInMonth(date: Date): number {
  return Math.floor((date.getUTCDate() - 1) / 7) + 1;
}

export function matchesRule(rule: CleaningRule, iso: string): boolean {
  const date = toDate(iso);
  if (date.getUTCDay() !== rule.weekday) return false;

  switch (rule.selector.kind) {
    case 'oddDayOfMonth':
      return date.getUTCDate() % 2 === 1;
    case 'evenDayOfMonth':
      return date.getUTCDate() % 2 === 0;
    case 'nthOfMonth':
      return rule.selector.ns.includes(occurrenceInMonth(date));
    case 'everyWeek':
      return true;
    case 'unknown':
      return false;
  }
}

/** The next `count` cleaning dates strictly after `fromDate`. */
export function projectOccurrences(
  rule: CleaningRule,
  fromDate: string,
  count: number,
): string[] {
  if (rule.selector.kind === 'unknown') return [];

  const found: string[] = [];
  const cursor = toDate(fromDate);
  // Two years is far beyond any real ordinance and bounds the loop.
  const limit = 366 * 2;

  for (let step = 0; step < limit && found.length < count; step += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const iso = toIso(cursor);
    if (matchesRule(rule, iso)) found.push(iso);
  }
  return found;
}
