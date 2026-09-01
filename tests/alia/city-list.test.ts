import { describe, expect, it } from 'vitest';
import { parseCityList } from '../../src/alia/city-list.ts';

const PAYLOAD =
  '<h4>Elenco strade di FIRENZE interessate dal servizio</h4><p>In data: 13/10/2026</p>' +
  '<p>PIAZZA TADDEO GADDI, Orario: 00.00 - 06.00</p>' +
  '<p>VIA DEI SERRAGLI, DA SAURO A S. MONACA, Orario: 00.00 - 06.00</p>';

describe('parseCityList', () => {
  it('extracts street names, dropping segment and time detail', () => {
    expect(parseCityList(PAYLOAD)).toEqual(['PIAZZA TADDEO GADDI', 'VIA DEI SERRAGLI']);
  });

  it('ignores the header lines', () => {
    expect(parseCityList(PAYLOAD)).not.toContain('In data: 13/10/2026');
  });

  it('still finds streets if Alia drops the colon after Orario', () => {
    // The sibling endpoint already writes "Orario 00.00". If this one ever
    // matched it, a colon-only pattern would return an empty listing, and an
    // empty listing makes every predicted cleaning look like a mismatch —
    // or, worse for a predicted-clear date, a false confirmation.
    expect(parseCityList(PAYLOAD.replace(/Orario:/g, 'Orario'))).toEqual([
      'PIAZZA TADDEO GADDI',
      'VIA DEI SERRAGLI',
    ]);
  });
});
