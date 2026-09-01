import { decodeAliaHtml } from './html.ts';

/**
 * Lines look like "VIA DEI SERRAGLI, DA SAURO A S. MONACA, Orario: 00.00 - 06.00".
 * The street name is everything before the first comma.
 *
 * The colon is optional: the sibling `calcola_data` endpoint writes "Orario"
 * without one, and if this endpoint ever followed suit a colon-only pattern
 * would return an empty listing for the whole city — which reads as "Alia
 * cleans nothing tonight" and would confirm every predicted-clear date.
 */
export function parseCityList(payload: string): string[] {
  return decodeAliaHtml(payload)
    .split('\n')
    .filter((line) => /Orario:?\s*\d/i.test(line))
    .map((line) => line.split(',')[0]!.trim())
    .filter((name) => name.length > 0);
}
