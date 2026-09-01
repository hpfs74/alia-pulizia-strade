import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../../src/ics/calendar.ts';
import type { CleaningRule } from '../../src/alia/types.ts';

const GADDI: CleaningRule = {
  weekday: 2,
  selector: { kind: 'oddDayOfMonth' },
  window: { startMinutes: 0, endMinutes: 360 },
  raw: 'Ogni Martedi dispari del mese dalle 00.00 alle 06.00',
};

describe('buildCalendar', () => {
  const ics = buildCalendar({
    street: 'PIAZZA TADDEO GADDI',
    rule: GADDI,
    fromDate: '2026-09-01',
    count: 2,
  });

  it('wraps events in a valid VCALENDAR', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
  });

  it('emits one event per projected occurrence in floating local time', () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20260915T000000');
    expect(ics).toContain('DTEND:20260915T060000');
    expect(ics).toContain('DTSTART:20260929T000000');
  });

  it('alarms at 21:00 the evening before a midnight cleaning', () => {
    expect(ics).toContain('TRIGGER:-PT3H');
  });

  it('alarms the evening before an afternoon cleaning', () => {
    const afternoon = buildCalendar({
      street: 'VIA ANTONIO MEUCCI',
      rule: {
        weekday: 3,
        selector: { kind: 'nthOfMonth', ns: [1] },
        window: { startMinutes: 780, endMinutes: 1140 },
        raw: 'Il 1º Mercoledi del mese dalle 13.00 alle 19.00',
      },
      fromDate: '2026-08-31',
      count: 1,
    });
    expect(afternoon).toContain('TRIGGER:-PT16H');
  });

  it('names the street in the summary and escapes commas', () => {
    expect(ics).toContain('SUMMARY:Pulizia strade — PIAZZA TADDEO GADDI');
    const withComma = buildCalendar({
      street: 'VIA DEI SERRAGLI, DA SAURO A S. MONACA',
      rule: GADDI,
      fromDate: '2026-09-01',
      count: 1,
    });
    expect(withComma).toContain('VIA DEI SERRAGLI\\, DA SAURO A S. MONACA');
  });

  it('produces no events for an unknown rule', () => {
    const unknown = buildCalendar({
      street: 'X',
      rule: { ...GADDI, selector: { kind: 'unknown' } },
      fromDate: '2026-09-01',
      count: 3,
    });
    expect(unknown).not.toContain('BEGIN:VEVENT');
  });
});
