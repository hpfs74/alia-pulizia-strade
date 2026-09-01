import { describe, expect, it } from 'vitest';
import { selectCrossCheckDates } from '../../src/schedule/sample.ts';
import { matchesRule } from '../../src/schedule/occurrences.ts';
import type { CleaningRule } from '../../src/alia/types.ts';

const ODD_TUESDAY: CleaningRule = {
  weekday: 2,
  selector: { kind: 'oddDayOfMonth' },
  window: { startMinutes: 0, endMinutes: 360 },
  raw: 'Ogni Martedi dispari del mese dalle 00.00 alle 06.00',
};

const EVERY_SATURDAY: CleaningRule = {
  weekday: 6,
  selector: { kind: 'everyWeek' },
  window: { startMinutes: 0, endMinutes: 360 },
  raw: 'Ogni Sabato del mese dalle 00.00 alle 06.00',
};

describe('selectCrossCheckDates', () => {
  it('samples both predicted-present and predicted-absent dates', () => {
    const sample = selectCrossCheckDates(ODD_TUESDAY, '2026-09-01');

    const present = sample.filter((entry) => entry.predicted);
    const absent = sample.filter((entry) => !entry.predicted);

    expect(present).toHaveLength(3);
    expect(absent).toHaveLength(3);
    // The whole point of the cross-check: a wrong `dispari` reading agrees on
    // the next date but disagrees on the even-dated Tuesdays around it.
    expect(present.map((entry) => entry.date)).toEqual([
      '2026-09-15',
      '2026-09-29',
      '2026-10-13',
    ]);
    expect(absent.map((entry) => entry.date)).toEqual([
      '2026-09-08',
      '2026-09-22',
      '2026-10-06',
    ]);
  });

  it('never samples more than six dates', () => {
    expect(selectCrossCheckDates(ODD_TUESDAY, '2026-09-01').length).toBeLessThanOrEqual(6);
    expect(selectCrossCheckDates(EVERY_SATURDAY, '2026-09-01').length).toBeLessThanOrEqual(6);
  });

  it("labels every sampled date with what the rule actually predicts", () => {
    for (const rule of [ODD_TUESDAY, EVERY_SATURDAY]) {
      for (const entry of selectCrossCheckDates(rule, '2026-09-01')) {
        expect(entry.predicted).toBe(matchesRule(rule, entry.date));
      }
    }
  });

  it('falls back to other weekdays when the rule matches every occurrence of its own', () => {
    // An everyWeek rule has no predicted-absent Saturday, so the negative
    // direction can only be tested on other weekdays.
    const sample = selectCrossCheckDates(EVERY_SATURDAY, '2026-09-01');
    const absent = sample.filter((entry) => !entry.predicted);

    expect(absent.length).toBeGreaterThanOrEqual(2);
    for (const entry of absent) {
      expect(matchesRule(EVERY_SATURDAY, entry.date)).toBe(false);
    }
    expect(sample.some((entry) => entry.predicted)).toBe(true);
  });

  it('stays strictly inside the window, after fromDate, and sorted', () => {
    const sample = selectCrossCheckDates(ODD_TUESDAY, '2026-09-01', { days: 42 });
    const dates = sample.map((entry) => entry.date);

    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
    for (const date of dates) {
      expect(date > '2026-09-01').toBe(true);
      expect(date <= '2026-10-13').toBe(true);
    }
  });

  it('returns nothing for an unknown rule, so no false reassurance is sampled', () => {
    expect(
      selectCrossCheckDates({ ...ODD_TUESDAY, selector: { kind: 'unknown' } }, '2026-09-01'),
    ).toEqual([]);
  });
});
