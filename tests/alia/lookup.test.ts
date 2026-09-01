import { describe, expect, it } from 'vitest';
import { parseLookup } from '../../src/alia/lookup.ts';

const SCHEDULED =
  '<h4>PIAZZA TADDEO GADDI</h4><p>La data di prossima pulizia strade &egrave;:</p>' +
  '<p>Martedi 15/9/2026</p><p>Orario 00.00 - 06.00</p>' +
  '<p>Ogni Martedi dispari del mese dalle 00.00 alle 06.00</p>';

const EXPIRED =
  "<h4>BORGO PINTI</h4><p>L'ordinanza per questo tratto di strada &egrave; scaduta</p>" +
  '<p>Momentaneamente non sono previste altre ordinanze</p>';

describe('parseLookup', () => {
  it('extracts street, next date and window from a scheduled response', () => {
    const result = parseLookup(SCHEDULED);
    expect(result.status).toBe('scheduled');
    if (result.status !== 'scheduled') return;
    expect(result.street).toBe('PIAZZA TADDEO GADDI');
    expect(result.nextDate).toBe('2026-09-15');
    expect(result.window).toEqual({ startMinutes: 0, endMinutes: 360 });
    expect(result.rule.raw).toBe('Ogni Martedi dispari del mese dalle 00.00 alle 06.00');
  });

  it('zero-pads single-digit days and months', () => {
    const payload = SCHEDULED.replace('Martedi 15/9/2026', 'Martedi 1/9/2026');
    const result = parseLookup(payload);
    expect(result.status === 'scheduled' && result.nextDate).toBe('2026-09-01');
  });

  it('detects an expired ordinance', () => {
    const result = parseLookup(EXPIRED);
    expect(result.status).toBe('expired');
    expect(result.street).toBe('BORGO PINTI');
  });
});
