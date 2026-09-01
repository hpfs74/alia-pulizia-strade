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

  it('folds lines by UTF-8 octets, not JS string length', () => {
    // 73 JS chars but 76 UTF-8 bytes: each 'º' is two bytes. Under the old
    // `.length <= 75` check this line shipped unfolded, violating RFC 5545's
    // 75-octet limit. A real committed-corpus rule (count: 11) triggers this.
    const raw = 'Il 1º e il 3º e il 5º Venerdi del mese dalle 06.30 alle 10.00';
    const rule: CleaningRule = {
      weekday: 5,
      selector: { kind: 'nthOfMonth', ns: [1, 3, 5] },
      window: { startMinutes: 390, endMinutes: 600 },
      raw,
    };
    const ics = buildCalendar({ street: 'X', rule, fromDate: '2026-09-01', count: 1 });
    const encoder = new TextEncoder();

    for (const line of ics.split('\r\n')) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }

    // Unfolding (stripping CRLF + a single leading continuation space)
    // must reconstruct the original DESCRIPTION text exactly, so the fix
    // cannot pass by truncating instead of folding.
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`DESCRIPTION:${raw}`);
  });
});
