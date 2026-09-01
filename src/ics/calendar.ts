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

/** Fold lines longer than 75 octets, per RFC 5545 section 3.1. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join('\r\n');
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
