import { decodeAliaHtml } from './html.ts';
import { parseRule } from './rule.ts';
import type { CleaningRule, LookupResult, TimeWindow } from './types.ts';

const DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
const WINDOW_RE = /Orario\s+(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})/i;
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
    return { status: 'none', street, raw: text };
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
