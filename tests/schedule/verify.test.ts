import { describe, expect, it } from 'vitest';
import { crossCheck } from '../../src/schedule/verify.ts';
import type { CleaningRule } from '../../src/alia/types.ts';

const GADDI: CleaningRule = {
  weekday: 2,
  selector: { kind: 'oddDayOfMonth' },
  window: { startMinutes: 0, endMinutes: 360 },
  raw: 'Ogni Martedi dispari del mese dalle 00.00 alle 06.00',
};

describe('crossCheck', () => {
  it('agrees when prediction and city list both say yes', () => {
    const result = crossCheck({
      rule: GADDI,
      street: 'PIAZZA TADDEO GADDI',
      date: '2026-10-13',
      cityList: ['PIAZZA TADDEO GADDI'],
    });
    expect(result).toEqual({ agrees: true, predicted: true, actual: true });
  });

  it('agrees when both say no', () => {
    expect(
      crossCheck({ rule: GADDI, street: 'PIAZZA TADDEO GADDI', date: '2026-10-20', cityList: [] })
        .agrees,
    ).toBe(true);
  });

  it('flags disagreement when the city list contradicts the rule', () => {
    // This is exactly the signature the wrong "dispari" reading would produce.
    const result = crossCheck({
      rule: GADDI,
      street: 'PIAZZA TADDEO GADDI',
      date: '2026-10-06',
      cityList: ['PIAZZA TADDEO GADDI'],
    });
    expect(result).toEqual({ agrees: false, predicted: false, actual: true });
  });

  it('matches street names case- and whitespace-insensitively', () => {
    expect(
      crossCheck({
        rule: GADDI,
        street: 'piazza  taddeo gaddi',
        date: '2026-10-13',
        cityList: ['PIAZZA TADDEO GADDI'],
      }).actual,
    ).toBe(true);
  });

  it('matches a street name containing an apostrophe from AliaClient#getStreets decoding', () => {
    // AliaClient.getStreets now decodes HTML entities in `nome` (e.g. "&#039;"
    // becomes "'"), and parseCityList runs payloads through decodeAliaHtml,
    // which does the same. Both sides of crossCheck's comparison must reach
    // the same apostrophe form, or these 87 central-Florence streets would
    // false-mismatch and train readers to ignore the safety net.
    const INDIPENDENZA: CleaningRule = {
      weekday: 3,
      selector: { kind: 'everyWeek' },
      window: { startMinutes: 0, endMinutes: 360 },
      raw: 'Ogni Mercoledi dalle 00.00 alle 06.00',
    };
    const result = crossCheck({
      rule: INDIPENDENZA,
      street: "PIAZZA DELL'INDIPENDENZA",
      date: '2026-10-14',
      cityList: ["PIAZZA DELL'INDIPENDENZA"],
    });
    expect(result).toEqual({ agrees: true, predicted: true, actual: true });
  });
});
