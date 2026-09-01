import type { CleaningRule, Selector, TimeWindow, Weekday } from './types.ts';

/**
 * Every phrasing Alia uses for Firenze (131 distinct sentences over 1,203
 * streets) is one of eight shapes:
 *
 *   Il 4º Martedi del mese dalle 00.00 alle 06.00
 *   La 1º Domenica del mese ...                      (feminine article)
 *   Il 2º e il 4º Lunedi del mese ...
 *   Il 1º e il 3º e il 5º Venerdi del mese ...
 *   La 2º e la 4º Domenica del mese ...
 *   Ogni Giovedi dispari del mese ...
 *   Ogni Martedi pari del mese ...
 *   Ogni Sabato del mese ...                         (no parity word)
 *
 * Anything else returns `{ kind: 'unknown' }`. A wrong answer here tells
 * someone their car is safe on a night it is not, so the parser never guesses.
 */

/** 0 = Sunday, matching Date#getDay(). Keys are accent-stripped and lowercased. */
const WEEKDAYS: Record<string, Weekday> = {
  domenica: 0,
  lunedi: 1,
  martedi: 2,
  mercoledi: 3,
  giovedi: 4,
  venerdi: 5,
  sabato: 6,
};

const WEEKDAY_RE = new RegExp(`\\b(${Object.keys(WEEKDAYS).join('|')})\\b`, 'g');

/**
 * An ordinal: a digit followed by an ordinal indicator. Alia writes `1&ordm`
 * (undecoded) and `1º` (decoded); `1°`/`1o`/`1ª` are accepted as plausible
 * spellings of the same thing. Undecoded forms are accepted so the parser is
 * robust whether or not the caller ran the text through `decodeAliaHtml`.
 *
 * The indicator is REQUIRED. Every one of the 131 corpus phrasings carries
 * one, and treating a bare digit as an ordinal misreads incidental numbers —
 * "Zona 3 - Ogni Lunedi" would narrow a weekly rule to one Monday a month.
 */
const ORDINAL_RE = /(?<!\d)(\d+)(?:&ordm;?|&ordf;?|º|ª|°|[oa](?![a-z]))(?!\d)/g;

/** A month has at most five occurrences of any weekday. */
const MAX_ORDINAL = 5;

/**
 * Alia writes weekday names without accents (`Martedi`), but the accented form
 * is correct Italian and may appear. Stripping diacritics accepts both, and
 * keeps `\b` working — `\bmartedì\b` would not match "Martedì " because `ì` and
 * the following space are both non-word characters.
 */
function normalise(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

interface WeekdayMatch {
  weekday: Weekday;
  /** Index into the normalised string where the LAST mention of it begins. */
  index: number;
}

/**
 * Returns the single weekday named in the sentence, or null when none is named
 * or when two different ones are — a two-weekday sentence is a grammar we have
 * never seen and must not be guessed at.
 *
 * The same weekday may be named more than once ("Il 1º Martedi e il 3º
 * Martedi"), so `index` tracks the last mention: ordinals are collected from
 * everything before it, and slicing at the first mention would silently drop
 * every ordinal but the first.
 */
function findWeekday(normalised: string): WeekdayMatch | null {
  WEEKDAY_RE.lastIndex = 0;
  let found: WeekdayMatch | null = null;

  for (const match of normalised.matchAll(WEEKDAY_RE)) {
    const weekday = WEEKDAYS[match[1]!]!;
    if (found === null) {
      found = { weekday, index: match.index };
    } else if (found.weekday !== weekday) {
      return null;
    } else {
      found.index = match.index;
    }
  }
  return found;
}

/**
 * Ordinals qualifying the weekday, e.g. `[2, 4]` for "Il 2º e il 4º Lunedì".
 * Only the text before the weekday name is scanned, so the times that follow
 * ("dalle 06.00 alle 09.30") can never be mistaken for ordinals. Returns null
 * if any ordinal is out of range, rather than silently dropping it.
 */
function findOrdinals(prefix: string): number[] | null {
  ORDINAL_RE.lastIndex = 0;
  const ns = new Set<number>();

  for (const match of prefix.matchAll(ORDINAL_RE)) {
    const n = Number(match[1]);
    if (n < 1 || n > MAX_ORDINAL) return null;
    ns.add(n);
  }
  return [...ns].sort((a, b) => a - b);
}

function findSelector(normalised: string, weekdayIndex: number): Selector {
  // "Ogni Martedi dispari del mese" — the DATE is odd, not the occurrence.
  // `\bpari\b` does not match inside "dispari", so the two are independent.
  const odd = /\bdispari\b/.test(normalised);
  const even = /\bpari\b/.test(normalised);

  const ns = findOrdinals(normalised.slice(0, weekdayIndex));
  if (ns === null) return { kind: 'unknown' };

  // Parity and ordinals never co-occur in any phrasing Alia uses, and neither
  // do both parity words. A sentence carrying both is a grammar we have not
  // seen; picking one of the two readings would be a guess.
  if (odd && even) return { kind: 'unknown' };
  if ((odd || even) && ns.length > 0) return { kind: 'unknown' };

  if (odd) return { kind: 'oddDayOfMonth' };
  if (even) return { kind: 'evenDayOfMonth' };
  if (ns.length > 0) return { kind: 'nthOfMonth', ns };

  // "Ogni Sabato del mese" — no ordinal and no parity word means every week.
  if (/\bogni\b/.test(normalised) && /\bdel\s+mese\b/.test(normalised)) {
    return { kind: 'everyWeek' };
  }
  if (/\bogni\s+settimana\b|\bsettimanale\b/.test(normalised)) {
    return { kind: 'everyWeek' };
  }
  return { kind: 'unknown' };
}

export function parseRule(raw: string, window: TimeWindow): CleaningRule {
  const normalised = normalise(raw);
  const match = findWeekday(normalised);
  if (match === null) {
    return { weekday: 0, selector: { kind: 'unknown' }, window, raw };
  }
  return { weekday: match.weekday, selector: findSelector(normalised, match.index), window, raw };
}
