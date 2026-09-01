import { describe, expect, it } from 'vitest';
import { parseLookup } from '../../src/alia/lookup.ts';

const SCHEDULED =
  '<h4>PIAZZA TADDEO GADDI</h4><p>La data di prossima pulizia strade &egrave;:</p>' +
  '<p>Martedi 15/9/2026</p><p>Orario 00.00 - 06.00</p>' +
  '<p>Ogni Martedi dispari del mese dalle 00.00 alle 06.00</p>';

const EXPIRED =
  "<h4>BORGO PINTI</h4><p>L'ordinanza per questo tratto di strada &egrave; scaduta</p>" +
  '<p>Momentaneamente non sono previste altre ordinanze</p>';

const NONE =
  '<h4>VIA ROMA</h4><p>Nessuna informazione disponibile per questa via</p>';

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

  it('reports none when there is no date and no window', () => {
    const result = parseLookup(NONE);
    expect(result.status).toBe('none');
    expect(result.street).toBe('VIA ROMA');
  });

  it('reports unparsed, not none, when a date is present but the window is not readable', () => {
    // 'none' is rendered to the user as "no cleaning currently scheduled".
    // A payload that plainly describes a cleaning we merely failed to read
    // must never wear those words.
    const payload = SCHEDULED.replace('Orario 00.00 - 06.00', 'Orario dalla sera al mattino');
    const result = parseLookup(payload);
    expect(result.status).toBe('unparsed');
  });

  it('reports unparsed when a rule sentence is present but no date is', () => {
    const payload =
      '<h4>PIAZZA TADDEO GADDI</h4><p>Orario 00.00 - 06.00</p>' +
      '<p>Ogni Martedi dispari del mese dalle 00.00 alle 06.00</p>';
    expect(parseLookup(payload).status).toBe('unparsed');
  });

  it('reads the time window whether or not Alia writes a colon after Orario', () => {
    // calcola_data writes "Orario 00.00" and calcola_data_all writes
    // "Orario: 00.00". Accepting both means a change on either endpoint
    // cannot turn every street into a silent 'none'.
    const withColon = parseLookup(SCHEDULED.replace('Orario 00.00', 'Orario: 00.00'));
    expect(withColon.status).toBe('scheduled');
    expect(withColon.status === 'scheduled' && withColon.window).toEqual({
      startMinutes: 0,
      endMinutes: 360,
    });
  });

  it('stays scheduled when the rule sentence uses an unrecognised article, keeping date and window', () => {
    const payload = SCHEDULED.replace(
      'Ogni Martedi dispari del mese dalle 00.00 alle 06.00',
      'Le settimane dispari dalle 00.00 alle 06.00',
    );
    const result = parseLookup(payload);
    expect(result.status).toBe('scheduled');
    if (result.status !== 'scheduled') return;
    expect(result.nextDate).toBe('2026-09-15');
    expect(result.window).toEqual({ startMinutes: 0, endMinutes: 360 });
    expect(result.rule.selector.kind).toBe('unknown');
  });

  it('stays scheduled with an unknown rule when no recurrence sentence is present', () => {
    const payload =
      '<h4>PIAZZA TADDEO GADDI</h4><p>La data di prossima pulizia strade &egrave;:</p>' +
      '<p>Martedi 15/9/2026</p><p>Orario 00.00 - 06.00</p>';
    const result = parseLookup(payload);
    expect(result.status).toBe('scheduled');
    if (result.status !== 'scheduled') return;
    expect(result.nextDate).toBe('2026-09-15');
    expect(result.window).toEqual({ startMinutes: 0, endMinutes: 360 });
    expect(result.rule.selector.kind).toBe('unknown');
  });
});
