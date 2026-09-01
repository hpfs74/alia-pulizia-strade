import type { CleaningRule } from '../alia/types.ts';
import { matchesRule, parseIsoDate, toIsoDate } from './occurrences.ts';

export interface SampledDate {
  /** YYYY-MM-DD. */
  date: string;
  /** What our parsed rule says about it: true = cleaning, false = clear. */
  predicted: boolean;
}

/**
 * Deliberately short. Alia's city listing reflects the ordinance in force on
 * the day asked about; an ordinance that expires months out would make a
 * far-future date disagree for a legitimate reason, and a cross-check that
 * cries wolf gets ignored.
 */
const DEFAULT_DAYS = 42;

/** Three of each direction, six requests — a rounding error on Alia's servers. */
const PER_DIRECTION = 3;
const MAX_TOTAL = 6;

/**
 * The negative direction is the one that catches under-alerting (Alia cleans on
 * a night we called clear), so never sample fewer than this many predicted-clear
 * dates, even when the rule leaves none on its own weekday.
 */
const MIN_ABSENT = 2;

/**
 * Choose dates to cross-check against Alia's per-date city listing.
 *
 * Sampling only the date Alia already named proves nothing: that date is
 * present in the listing by construction, so the comparison degenerates into
 * re-running our own matcher. A wrong reading of `dispari` — nth-occurrence
 * instead of odd-dated — agrees on that one date roughly half the time and is
 * wrong about every other date in the month.
 *
 * So both directions are sampled: dates the rule predicts ARE cleaned, and
 * dates it predicts are NOT. Predicted-clear dates are drawn from the rule's
 * own weekday where possible, because those are where a misread selector
 * shows up; when the rule matches every occurrence of its weekday (`everyWeek`)
 * there are none, and nearby dates on other weekdays test the same direction.
 *
 * Returns `[]` for an unknown selector — there is no prediction to test.
 */
export function selectCrossCheckDates(
  rule: CleaningRule,
  fromDate: string,
  options: { days?: number } = {},
): SampledDate[] {
  if (rule.selector.kind === 'unknown') return [];

  const days = options.days ?? DEFAULT_DAYS;
  const candidates: string[] = [];
  const cursor = parseIsoDate(fromDate);
  for (let step = 0; step < days; step += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    candidates.push(toIsoDate(cursor));
  }

  const present = candidates.filter((date) => matchesRule(rule, date)).slice(0, PER_DIRECTION);

  const absent = candidates
    .filter((date) => parseIsoDate(date).getUTCDay() === rule.weekday && !matchesRule(rule, date))
    .slice(0, PER_DIRECTION);

  for (const date of candidates) {
    if (absent.length >= MIN_ABSENT) break;
    if (matchesRule(rule, date) || absent.includes(date)) continue;
    absent.push(date);
  }

  // Trim the positive direction first if a caller shortens the window enough
  // to make both lists full; the negative direction is the safety-critical one.
  const chosen = [
    ...present.slice(0, Math.max(0, MAX_TOTAL - absent.length)).map((date) => ({
      date,
      predicted: true,
    })),
    ...absent.map((date) => ({ date, predicted: false })),
  ];

  return chosen.sort((a, b) => a.date.localeCompare(b.date));
}
