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

/**
 * The closing semicolon is optional because Alia omits it on `&ordm`. Greedy
 * `[a-zA-Z]+` still stops at a `;`, so well-formed entities keep decoding, and
 * an unrecognised name is returned verbatim rather than guessed at.
 */
function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);?/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(parseInt(body.slice(2), 16));
    }
    if (body.startsWith('#')) {
      return String.fromCodePoint(parseInt(body.slice(1), 10));
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
