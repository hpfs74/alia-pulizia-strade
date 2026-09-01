const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  egrave: 'è',
  eacute: 'é',
  agrave: 'à',
  ograve: 'ò',
  igrave: 'ì',
  ugrave: 'ù',
  deg: '°',
  times: '×',
  // Alia writes ordinals as "Il 4&ordm Martedi" — masculine/feminine ordinal
  // indicators, and it omits the closing semicolon.
  ordm: 'º',
  ordf: 'ª',
};

const MAX_CODE_POINT = 0x10ffff;

/**
 * The closing semicolon is optional because Alia omits it on `&ordm`. Greedy
 * `[a-zA-Z]+` still stops at a `;`, so well-formed entities keep decoding, and
 * an unrecognised name is returned verbatim rather than guessed at.
 *
 * Decimal and hex have separate branches: sharing one `[0-9a-fA-F]+` class let
 * an unterminated decimal entity run on into the following text, so
 * "DELL&#039ANDREA" decoded as "DELL'NDREA" — the A was eaten as a hex digit.
 */
function decodeEntities(input: string): string {
  return input.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);?/g, (match, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      // fromCodePoint throws above U+10FFFF. Malformed input must not crash
      // the lookup parser, so an out-of-range entity is left as written.
      if (!Number.isInteger(code) || code < 0 || code > MAX_CODE_POINT) return match;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Alia returns a JSON string containing an HTML fragment. Turn it into plain
 * text with one logical line per block element, dropping empty lines.
 */
export function decodeAliaHtml(payload: string): string {
  return decodeEntities(payload.replace(/<[^>]*>/g, '\n'))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}
