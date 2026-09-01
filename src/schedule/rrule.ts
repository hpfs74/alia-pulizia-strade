import type { CleaningRule, Weekday } from '../alia/types.ts';

const BYDAY: Record<Weekday, string> = {
  0: 'SU',
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
};

const ODD_DAYS = Array.from({ length: 16 }, (_, i) => i * 2 + 1).join(',');
const EVEN_DAYS = Array.from({ length: 15 }, (_, i) => (i + 1) * 2).join(',');

/**
 * RFC 5545: with FREQ=MONTHLY, BYDAY and BYMONTHDAY intersect. Whether Alexa
 * honours that intersection is the open question in the spec and must be
 * verified on a real device before Phase 1b depends on it.
 */
export function toRrule(rule: CleaningRule): string | null {
  const day = BYDAY[rule.weekday];

  switch (rule.selector.kind) {
    case 'oddDayOfMonth':
      return `FREQ=MONTHLY;BYDAY=${day};BYMONTHDAY=${ODD_DAYS}`;
    case 'evenDayOfMonth':
      return `FREQ=MONTHLY;BYDAY=${day};BYMONTHDAY=${EVEN_DAYS}`;
    case 'nthOfMonth':
      return `FREQ=MONTHLY;BYDAY=${rule.selector.ns.map((n) => `${n}${day}`).join(',')}`;
    case 'everyWeek':
      return `FREQ=WEEKLY;BYDAY=${day}`;
    case 'unknown':
      return null;
  }
}
