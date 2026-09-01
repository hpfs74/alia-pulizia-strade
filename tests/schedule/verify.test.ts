import { describe, expect, it } from 'vitest';
import { crossCheck } from '../../src/schedule/verify.ts';
import { decodeAliaHtml } from '../../src/alia/html.ts';
import { parseCityList } from '../../src/alia/city-list.ts';
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

  it('matches an apostrophe street name reached through the real decode paths on both sides', () => {
    // The street side goes through decodeAliaHtml, mirroring what
    // AliaClient.getStreets now does to `nome` (87 of Florence's 1,560 street
    // names carry "&#039;", e.g. "PIAZZA DELL&#039;INDIPENDENZA"). The
    // city-list side goes through parseCityList on a raw Alia-shaped payload.
    // The two inputs are deliberately given different case, so that
    // crossCheck's normalise() is load-bearing on BOTH sides: dropping it
    // from either side breaks this test, unlike a test built from two
    // byte-identical literals.
    const street = decodeAliaHtml('piazza dell&#039;INDIPENDENZA');
    const cityList = parseCityList(
      "<p>Piazza  dell&#039;Indipendenza, Orario: 00.00 - 06.00</p>",
    );
    expect(cityList).toEqual(["Piazza dell'Indipendenza"]);

    const INDIPENDENZA: CleaningRule = {
      weekday: 3,
      selector: { kind: 'everyWeek' },
      window: { startMinutes: 0, endMinutes: 360 },
      raw: 'Ogni Mercoledi dalle 00.00 alle 06.00',
    };
    const result = crossCheck({
      rule: INDIPENDENZA,
      street,
      date: '2026-10-14',
      cityList,
    });
    expect(result).toEqual({ agrees: true, predicted: true, actual: true });
  });
});
