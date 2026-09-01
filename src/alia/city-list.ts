import { decodeAliaHtml } from './html.ts';

/**
 * Lines look like "VIA DEI SERRAGLI, DA SAURO A S. MONACA, Orario: 00.00 - 06.00".
 * The street name is everything before the first comma.
 */
export function parseCityList(payload: string): string[] {
  return decodeAliaHtml(payload)
    .split('\n')
    .filter((line) => /Orario:/i.test(line))
    .map((line) => line.split(',')[0]!.trim())
    .filter((name) => name.length > 0);
}
