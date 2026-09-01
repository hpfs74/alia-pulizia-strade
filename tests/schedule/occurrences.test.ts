import { describe, expect, it } from 'vitest';
import { matchesRule, projectOccurrences } from '../../src/schedule/occurrences.ts';
import type { CleaningRule } from '../../src/alia/types.ts';

const GADDI: CleaningRule = {
  weekday: 2,
  selector: { kind: 'oddDayOfMonth' },
  window: { startMinutes: 0, endMinutes: 360 },
  raw: 'Ogni Martedi dispari del mese dalle 00.00 alle 06.00',
};

describe('projectOccurrences', () => {
  // Verified against Alia's calcola_data_all on 2026-09-01. See the spec.
  it('reproduces the confirmed Taddeo Gaddi schedule', () => {
    expect(projectOccurrences(GADDI, '2026-09-01', 6)).toEqual([
      '2026-09-15',
      '2026-09-29',
      '2026-10-13',
      '2026-10-27',
      '2026-11-03',
      '2026-11-17',
    ]);
  });

  it('excludes the even-dated Tuesdays Alia omits', () => {
    for (const date of ['2026-10-06', '2026-10-20', '2026-11-10', '2026-11-24']) {
      expect(matchesRule(GADDI, date)).toBe(false);
    }
  });

  it('includes the odd-dated Tuesdays Alia lists', () => {
    for (const date of ['2026-09-01', '2026-10-13', '2026-11-03']) {
      expect(matchesRule(GADDI, date)).toBe(true);
    }
  });

  it('handles the 7-day gap across a month boundary', () => {
    expect(projectOccurrences(GADDI, '2026-10-27', 1)).toEqual(['2026-11-03']);
  });

  it('selects the nth occurrence, not the nth date', () => {
    const rule: CleaningRule = {
      weekday: 3,
      selector: { kind: 'nthOfMonth', ns: [1] },
      window: { startMinutes: 780, endMinutes: 1140 },
      raw: 'Il 1º Mercoledi del mese dalle 13.00 alle 19.00',
    };
    expect(projectOccurrences(rule, '2026-08-31', 2)).toEqual(['2026-09-02', '2026-10-07']);
  });

  it('matches every listed ordinal for a multi-ordinal selector', () => {
    // Il 2º e il 4º Lunedì del mese: 85 Florence streets use this shape.
    const rule: CleaningRule = {
      weekday: 1,
      selector: { kind: 'nthOfMonth', ns: [2, 4] },
      window: { startMinutes: 0, endMinutes: 360 },
      raw: 'Il 2º e il 4º Lunedi del mese dalle 00.00 alle 06.00',
    };
    // September 2026 Mondays: 7 (1st), 14 (2nd), 21 (3rd), 28 (4th).
    expect(matchesRule(rule, '2026-09-07')).toBe(false);
    expect(matchesRule(rule, '2026-09-14')).toBe(true);
    expect(matchesRule(rule, '2026-09-21')).toBe(false);
    expect(matchesRule(rule, '2026-09-28')).toBe(true);
    expect(projectOccurrences(rule, '2026-09-01', 2)).toEqual(['2026-09-14', '2026-09-28']);
  });

  it('never matches an unknown selector', () => {
    const rule: CleaningRule = { ...GADDI, selector: { kind: 'unknown' } };
    expect(matchesRule(rule, '2026-09-15')).toBe(false);
    expect(projectOccurrences(rule, '2026-09-01', 3)).toEqual([]);
  });
});
