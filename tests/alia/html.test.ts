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

  it('decodes ordinal entities written without a closing semicolon', () => {
    // Alia serves rule sentences as "Il 4&ordm Martedi" — no semicolon, and
    // "ordm" is not in the HTML5 named-entity set most decoders ship with.
    expect(decodeAliaHtml('<p>Il 4&ordm Martedi del mese</p>')).toBe('Il 4º Martedi del mese');
    expect(decodeAliaHtml('<p>Il 4&ordm; Martedi</p>')).toBe('Il 4º Martedi');
    expect(decodeAliaHtml('<p>La 1&ordf Domenica</p>')).toBe('La 1ª Domenica');
  });

  it('decodes numeric entities written without a closing semicolon', () => {
    const decoded = "PIAZZA DELL'INDIPENDENZA";
    expect(decodeAliaHtml('<p>PIAZZA DELL&#039;INDIPENDENZA</p>')).toBe(decoded);
    expect(decodeAliaHtml('<p>PIAZZA DELL&#039INDIPENDENZA</p>')).toBe(decoded);
  });

  it('does not let a semicolon-less decimal entity swallow following A-F letters', () => {
    // A decimal entity must be read with a decimal character class. Reading it
    // with a hex class ate the "A" of ANDREA and all of "BCDEF" — and a test
    // whose next letter is outside A-F passes either way, so assert on one
    // that is not.
    expect(decodeAliaHtml('<p>VIA A&#039BCDEF</p>')).toBe("VIA A'BCDEF");
    expect(decodeAliaHtml('<p>PIAZZA DELL&#039ANDREA</p>')).toBe("PIAZZA DELL'ANDREA");
    // The hex form still reads hex digits; without a semicolon it is genuinely
    // ambiguous, so only the terminated form is relied on.
    expect(decodeAliaHtml('<p>VIA A&#x27;BCDEF</p>')).toBe("VIA A'BCDEF");
    expect(decodeAliaHtml('<p>VIA A&#X27;BCDEF</p>')).toBe("VIA A'BCDEF");
  });

  it('leaves an out-of-range numeric entity alone instead of throwing', () => {
    // String.fromCodePoint raises RangeError above U+10FFFF; malformed input
    // must not crash the lookup parser that calls this.
    expect(decodeAliaHtml('<p>&#9999999;</p>')).toBe('&#9999999;');
    expect(decodeAliaHtml('<p>&#x1FFFFFF;</p>')).toBe('&#x1FFFFFF;');
    expect(decodeAliaHtml('<p>&#1114111;</p>')).toBe('\u{10FFFF}');
  });

  it('leaves unknown entity names untouched', () => {
    expect(decodeAliaHtml('<p>Rossi &amp; Bianchi &notanentity R&amp;D AT&T</p>')).toBe(
      'Rossi & Bianchi &notanentity R&D AT&T',
    );
  });
});
