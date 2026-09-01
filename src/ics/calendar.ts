import type { CleaningRule } from '../alia/types.ts';
import { projectOccurrences } from '../schedule/occurrences.ts';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** RFC 5545 requires these characters to be escaped in TEXT values. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

const encoder = new TextEncoder();

/**
 * Fold lines longer than 75 octets, per RFC 5545 section 3.1. Counts UTF-8
 * bytes, not JS string length — Florence street/rule text contains
 * multi-byte characters (e.g. the ordinal marker 'º' is two bytes), and a
 * codepoint must never be split across a fold boundary.
 */
function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;

  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > 75) {
      out.push(current);
      current = ' '; // continuation lines begin with a single space
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n');
}

function stamp(iso: string, minutes: number): string {
  const [year, month, day] = iso.split('-');
  return `${year}${month}${day}T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`;
}

/** UTC generation timestamp. RFC 5545 requires DTSTAMP on every VEVENT. */
function dtstamp(now: Date): string {
  return `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

function slug(value: string): string {
  return value.replace(/\W+/g, '-').toLowerCase();
}

/**
 * A UID must be unique per event. Date plus street name is not: a street with
 * several `tratti` is cleaned on the same night on each of them, and calendar
 * apps silently dedupe a repeated UID — one segment's alarm would just
 * disappear on import. Segment and civic number are appended when known, and
 * omitted otherwise so a single-segment street keeps a stable UID across runs.
 */
function uid(date: string, args: { street: string; tratto?: string; civico?: string }): string {
  const parts = [date, slug(args.street)];
  if (args.tratto) parts.push(slug(args.tratto));
  if (args.civico) parts.push(`civ-${slug(args.civico)}`);
  return `${parts.join('-')}@pulizia-strade`;
}

/**
 * Events use floating local time (no TZID, no trailing Z) so a calendar app
 * in Florence renders them at the right wall-clock time without shipping a
 * VTIMEZONE block.
 *
 * Returns null when the rule's selector is `unknown`, mirroring `toRrule`. An
 * unknown rule has no projected dates, and emitting a valid-but-empty calendar
 * would let a user import it and read "nothing scheduled" off a street we
 * simply failed to parse. null forces the caller to say so instead.
 */
export function buildCalendar(args: {
  street: string;
  rule: CleaningRule;
  fromDate: string;
  count: number;
  alarmHour?: number;
  /** Street segment, when the street has more than one. Part of the UID. */
  tratto?: string;
  /** Civic number, when one was used for the lookup. Part of the UID. */
  civico?: string;
}): string | null {
  if (args.rule.selector.kind === 'unknown') return null;

  const alarmHour = args.alarmHour ?? 21;
  const dates = projectOccurrences(args.rule, args.fromDate, args.count);
  const summary = escapeText(`Pulizia strade — ${args.street}`);
  const generatedAt = dtstamp(new Date());

  // Minutes from the alarm (previous evening) to the cleaning start.
  const leadMinutes = args.rule.window.startMinutes + (24 * 60 - alarmHour * 60);
  const trigger = `-PT${Math.floor(leadMinutes / 60)}H${
    leadMinutes % 60 === 0 ? '' : `${leadMinutes % 60}M`
  }`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//pulizia-strade//IT',
    'CALSCALE:GREGORIAN',
  ];

  for (const date of dates) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid(date, args)}`,
      `DTSTAMP:${generatedAt}`,
      `DTSTART:${stamp(date, args.rule.window.startMinutes)}`,
      `DTEND:${stamp(date, args.rule.window.endMinutes)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${escapeText(args.rule.raw)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:${trigger}`,
      `DESCRIPTION:${summary}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
