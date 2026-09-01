import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRule } from '../../src/alia/rule.ts';
import { decodeAliaHtml } from '../../src/alia/html.ts';

const corpus = JSON.parse(
  readFileSync(new URL('../../data/rule-corpus.json', import.meta.url), 'utf8'),
) as Array<{ raw: string; count: number; examples: string[] }>;

const WINDOW = { startMinutes: 0, endMinutes: 360 };

describe('parseRule', () => {
  it('parses odd day-of-month rules', () => {
    const rule = parseRule('Ogni Giovedi dispari del mese dalle 00.00 alle 06.00', WINDOW);
    expect(rule.weekday).toBe(4);
    expect(rule.selector).toEqual({ kind: 'oddDayOfMonth' });
  });

  it('parses even day-of-month rules', () => {
    const rule = parseRule('Ogni Mercoledi pari del mese dalle 00.00 alle 06.00', WINDOW);
    expect(rule.weekday).toBe(3);
    expect(rule.selector).toEqual({ kind: 'evenDayOfMonth' });
  });

  it('parses nth-occurrence rules', () => {
    const rule = parseRule('Il 1º Mercoledi del mese dalle 13.00 alle 19.00', WINDOW);
    expect(rule.weekday).toBe(3);
    expect(rule.selector).toEqual({ kind: 'nthOfMonth', ns: [1] });
  });

  it('keeps the window and the original sentence for audit', () => {
    const raw = 'Il 1º Mercoledi del mese dalle 13.00 alle 19.00';
    const rule = parseRule(raw, WINDOW);
    expect(rule.raw).toBe(raw);
    expect(rule.window).toEqual(WINDOW);
  });

  it('returns unknown rather than guessing', () => {
    expect(parseRule('Quando capita, forse', WINDOW).selector).toEqual({ kind: 'unknown' });
  });

  it('returns unknown when no weekday is named', () => {
    expect(parseRule('Il 1º del mese dalle 13.00 alle 19.00', WINDOW).selector).toEqual({
      kind: 'unknown',
    });
  });

  it('returns unknown when two different weekdays are named', () => {
    const rule = parseRule('Il 1º Lunedi e il 2º Martedi del mese dalle 13.00 alle 19.00', WINDOW);
    expect(rule.selector).toEqual({ kind: 'unknown' });
  });

  it('returns unknown for an impossible ordinal', () => {
    expect(parseRule('Il 6º Lunedi del mese dalle 13.00 alle 19.00', WINDOW).selector).toEqual({
      kind: 'unknown',
    });
  });

  it('accepts accented weekday names', () => {
    const rule = parseRule('Ogni Martedì dispari del mese dalle 00.00 alle 06.00', WINDOW);
    expect(rule.weekday).toBe(2);
    expect(rule.selector).toEqual({ kind: 'oddDayOfMonth' });
  });

  it('treats "dispari" as odd DATE, never as odd occurrence', () => {
    // Guards the "dispari trap": the day number is odd, not the nth occurrence.
    const rule = parseRule('Ogni Martedi dispari del mese dalle 00.00 alle 06.00', WINDOW);
    expect(rule.selector).toEqual({ kind: 'oddDayOfMonth' });
  });

  it('does not mistake "dispari" for "pari"', () => {
    const rule = parseRule('Ogni Sabato dispari del mese dalle 00.00 alle 06.00', WINDOW);
    expect(rule.selector).toEqual({ kind: 'oddDayOfMonth' });
  });

  it('returns unknown when parity and an ordinal are both present', () => {
    // Never seen in the corpus; choosing one reading over the other is a guess.
    expect(
      parseRule('Il 2º Sabato pari del mese dalle 00.00 alle 06.00', WINDOW).selector,
    ).toEqual({ kind: 'unknown' });
  });

  it('returns unknown when both parity words are present', () => {
    expect(
      parseRule('Ogni Sabato pari e dispari del mese dalle 00.00 alle 06.00', WINDOW).selector,
    ).toEqual({ kind: 'unknown' });
  });

  // One representative per structural family found in data/rule-corpus.json.
  // "not unknown" is not enough: a confidently wrong selector is worse than none.
  const FAMILIES: Array<{
    family: string;
    raw: string;
    weekday: number;
    selector: unknown;
  }> = [
    {
      family: 'Il N&ordm <Weekday> del mese (802 streets)',
      raw: 'Il 4&ordm Martedi del mese dalle 00.00 alle 06.00',
      weekday: 2,
      selector: { kind: 'nthOfMonth', ns: [4] },
    },
    {
      family: 'Ogni <Weekday> dispari del mese (117 streets)',
      raw: 'Ogni Giovedi dispari del mese dalle 00.00 alle 06.00',
      weekday: 4,
      selector: { kind: 'oddDayOfMonth' },
    },
    {
      family: 'Ogni <Weekday> pari del mese (105 streets)',
      raw: 'Ogni Martedi pari del mese dalle 00.00 alle 06.00',
      weekday: 2,
      selector: { kind: 'evenDayOfMonth' },
    },
    {
      family: 'La N&ordm <Weekday> del mese (92 streets)',
      raw: 'La 3&ordm Domenica del mese dalle 00.00 alle 06.00',
      weekday: 0,
      selector: { kind: 'nthOfMonth', ns: [3] },
    },
    {
      family: 'Il N&ordm e il N&ordm <Weekday> del mese (71 streets)',
      raw: 'Il 2&ordm e il 4&ordm Lunedi del mese dalle 06.00 alle 09.30',
      weekday: 1,
      selector: { kind: 'nthOfMonth', ns: [2, 4] },
    },
    {
      family: 'Il N&ordm e il N&ordm e il N&ordm <Weekday> del mese (11 streets)',
      raw: 'Il 1&ordm e il 3&ordm e il 5&ordm Venerdi del mese dalle 06.30 alle 10.00',
      weekday: 5,
      selector: { kind: 'nthOfMonth', ns: [1, 3, 5] },
    },
    {
      family: 'La N&ordm e la N&ordm <Weekday> del mese (3 streets)',
      raw: 'La 2&ordm e la 4&ordm Domenica del mese dalle 09.00 alle 12.00',
      weekday: 0,
      selector: { kind: 'nthOfMonth', ns: [2, 4] },
    },
    {
      family: 'Ogni <Weekday> del mese, no parity word (2 streets)',
      raw: 'Ogni Sabato del mese dalle 07.00 alle 09.00',
      weekday: 6,
      selector: { kind: 'everyWeek' },
    },
  ];

  it.each(FAMILIES)('parses family $family', ({ raw, weekday, selector }) => {
    // Both the undecoded shape Alia serves and the decoded shape our pipeline
    // hands to parseRule must land on the same rule.
    for (const text of [raw, decodeAliaHtml(raw)]) {
      const rule = parseRule(text, WINDOW);
      expect(rule.weekday).toBe(weekday);
      expect(rule.selector).toEqual(selector);
    }
  });

  it('covers every family present in the corpus', () => {
    // If Alia adds a ninth shape, the corpus test below still passes only if a
    // handler exists — but this guards against the family list silently rotting.
    const skeleton = (raw: string) =>
      raw
        .replace(/\d+/g, 'N')
        .replace(/\b(domenica|luned|marted|mercoled|gioved|venerd|sabato)\w*/gi, 'WD');
    const corpusFamilies = new Set(corpus.map((entry) => skeleton(entry.raw)));
    const covered = new Set(FAMILIES.map((entry) => skeleton(entry.raw)));
    expect([...corpusFamilies].sort()).toEqual([...covered].sort());
  });

  it('has the whole harvested corpus available to assert on', () => {
    // Guards the corpus table below against being emptied or filtered.
    expect(corpus).toHaveLength(131);
    expect(corpus.reduce((sum, entry) => sum + entry.count, 0)).toBe(1203);
  });

  it.each(corpus.map((entry) => [entry.raw, entry.examples[0]] as const))(
    'parses corpus phrasing %s (e.g. %s)',
    (raw) => {
      const rule = parseRule(raw, WINDOW);
      expect(rule.selector.kind).not.toBe('unknown');
      // The decoded form is what production actually feeds in; it must agree.
      expect(parseRule(decodeAliaHtml(raw), WINDOW)).toEqual({ ...rule, raw: decodeAliaHtml(raw) });
    },
  );
});
