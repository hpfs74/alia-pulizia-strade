import { decodeAliaHtml } from './html.ts';
import { parseRule } from './rule.ts';
import type { CleaningRule, LookupResult, TimeWindow } from './types.ts';

const DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
/**
 * `calcola_data` writes "Orario 00.00 - 06.00" and `calcola_data_all` writes
 * "Orario: 00.00 - 06.00". Both endpoints are accepted here (and in
 * city-list.ts) so that a colon appearing or disappearing on either one cannot
 * turn every street in the city into a silent "nothing scheduled".
 */
const WINDOW_RE = /Orario:?\s*(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})/i;
const RULE_RE = /\bdalle\b.*\balle\b/i;

export function parseTimeWindow(text: string): TimeWindow | null {
  const match = WINDOW_RE.exec(text);
  if (!match) return null;
  return {
    startMinutes: Number(match[1]) * 60 + Number(match[2]),
    endMinutes: Number(match[3]) * 60 + Number(match[4]),
  };
}

export function parseLookup(payload: string): LookupResult {
  const text = decodeAliaHtml(payload);
  const lines = text.split('\n').filter((line) => line !== '×');
  const street = lines[0] ?? '';

  if (/ordinanza/i.test(text) && /scadut/i.test(text)) {
    return { status: 'expired', street, raw: text };
  }

  const dateMatch = DATE_RE.exec(text);
  const window = parseTimeWindow(text);
  const ruleLine = lines.find((line) => RULE_RE.test(line));

  if (!dateMatch || !window) {
    // Nothing at all was recognised, so Alia really is saying there is no
    // scheduled cleaning. Anything else is a parse failure wearing the same
    // shape, and must not be reported with the same words.
    if (!dateMatch && !window && !ruleLine) {
      return { status: 'none', street, raw: text };
    }
    const missing = [!dateMatch && 'a date', !window && 'a time window']
      .filter((part): part is string => part !== false)
      .join(' and ');
    return {
      status: 'unparsed',
      street,
      reason: `the response describes a cleaning but ${missing} could not be read`,
      raw: text,
    };
  }

  const day = dateMatch[1]!.padStart(2, '0');
  const month = dateMatch[2]!.padStart(2, '0');

  const rule: CleaningRule = ruleLine
    ? parseRule(ruleLine, window)
    : { weekday: 0, selector: { kind: 'unknown' }, window, raw: text };

  return {
    status: 'scheduled',
    street,
    nextDate: `${dateMatch[3]}-${month}-${day}`,
    window,
    rule,
    raw: text,
  };
}
