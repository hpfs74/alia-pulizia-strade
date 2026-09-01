import type { CleaningRule } from '../alia/types.ts';

/** Parse YYYY-MM-DD as a UTC calendar date. UTC avoids DST shifting the day. */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Which occurrence of its weekday this date is within its month: 1-based. */
function occurrenceInMonth(date: Date): number {
  return Math.floor((date.getUTCDate() - 1) / 7) + 1;
}

export function matchesRule(rule: CleaningRule, iso: string): boolean {
  const date = parseIsoDate(iso);
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

/**
 * The next `count` cleaning dates strictly after `fromDate`.
 *
 * Returns `[]` for an unknown selector. That empty array means "the rule was
 * not understood", NEVER "no cleaning is scheduled" — the street may well be
 * cleaned tonight. Callers must surface it as a warning and must not render it
 * as an all-clear or write it into a calendar; `buildCalendar` returns null
 * and `toRrule` returns null for exactly this reason.
 */
export function projectOccurrences(
  rule: CleaningRule,
  fromDate: string,
  count: number,
): string[] {
  if (rule.selector.kind === 'unknown') return [];

  const found: string[] = [];
  const cursor = parseIsoDate(fromDate);
  // Two years is far beyond any real ordinance and bounds the loop.
  const limit = 366 * 2;

  for (let step = 0; step < limit && found.length < count; step += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const iso = toIsoDate(cursor);
    if (matchesRule(rule, iso)) found.push(iso);
  }
  return found;
}
