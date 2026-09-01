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

/**
 * Events use floating local time (no TZID, no trailing Z) so a calendar app
 * in Florence renders them at the right wall-clock time without shipping a
 * VTIMEZONE block.
 */
export function buildCalendar(args: {
  street: string;
  rule: CleaningRule;
  fromDate: string;
  count: number;
  alarmHour?: number;
}): string {
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
      `UID:${date}-${args.street.replace(/\W+/g, '-').toLowerCase()}@pulizia-strade`,
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
