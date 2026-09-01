import { describe, expect, it } from 'vitest';
import { toRrule } from '../../src/schedule/rrule.ts';
import type { CleaningRule } from '../../src/alia/types.ts';

const base = { window: { startMinutes: 0, endMinutes: 360 }, raw: 'x' };

describe('toRrule', () => {
  it('emits the odd day-of-month intersection', () => {
    const rule: CleaningRule = { ...base, weekday: 2, selector: { kind: 'oddDayOfMonth' } };
    expect(toRrule(rule)).toBe(
      'FREQ=MONTHLY;BYDAY=TU;BYMONTHDAY=1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31',
    );
  });

  it('emits the even day-of-month intersection', () => {
    const rule: CleaningRule = { ...base, weekday: 4, selector: { kind: 'evenDayOfMonth' } };
    expect(toRrule(rule)).toBe(
      'FREQ=MONTHLY;BYDAY=TH;BYMONTHDAY=2,4,6,8,10,12,14,16,18,20,22,24,26,28,30',
    );
  });

  it('emits an ordinal BYDAY for a single-ordinal nth-of-month', () => {
    const rule: CleaningRule = { ...base, weekday: 3, selector: { kind: 'nthOfMonth', ns: [1] } };
    expect(toRrule(rule)).toBe('FREQ=MONTHLY;BYDAY=1WE');
  });

  it('emits comma-separated ordinal BYDAY entries for a multi-ordinal nth-of-month', () => {
    const rule: CleaningRule = {
      ...base,
      weekday: 1,
      selector: { kind: 'nthOfMonth', ns: [1, 3, 5] },
    };
    expect(toRrule(rule)).toBe('FREQ=MONTHLY;BYDAY=1MO,3MO,5MO');
  });

  it('emits a weekly rule', () => {
    const rule: CleaningRule = { ...base, weekday: 1, selector: { kind: 'everyWeek' } };
    expect(toRrule(rule)).toBe('FREQ=WEEKLY;BYDAY=MO');
  });

  it('returns null for unknown selectors', () => {
    const rule: CleaningRule = { ...base, weekday: 1, selector: { kind: 'unknown' } };
    expect(toRrule(rule)).toBeNull();
  });
});
