import { describe, expect, it } from 'vitest';
import { decodeAliaHtml } from '../../src/alia/html.ts';

describe('decodeAliaHtml', () => {
  it('strips tags and decodes entities into logical lines', () => {
    const payload =
      '<div class="modal-header"><h4>PIAZZA TADDEO GADDI</h4></div>' +
      '<div class="modal-body"><p>La data di prossima pulizia strade &egrave;:</p>' +
      '<p>Martedi 15/9/2026</p></div>';

    expect(decodeAliaHtml(payload)).toBe(
      'PIAZZA TADDEO GADDI\nLa data di prossima pulizia strade è:\nMartedi 15/9/2026',
    );
  });

  it('decodes numeric entities and collapses blank lines', () => {
    expect(decodeAliaHtml('<p>Il 1&#186; Mercoledi</p><p></p><p>del mese</p>')).toBe(
      'Il 1º Mercoledi\ndel mese',
    );
  });
});
