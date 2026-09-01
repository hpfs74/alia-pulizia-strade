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
});
