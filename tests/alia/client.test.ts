import { describe, expect, it } from 'vitest';
import { AliaClient } from '../../src/alia/client.ts';
import type { PostFn } from '../../src/alia/transport.ts';
import { readFileSync } from 'node:fs';

const streets = JSON.parse(
  readFileSync(new URL('../fixtures/get_indirizzi-firenze-sample.json', import.meta.url), 'utf8'),
) as Array<{ id_strada: string; nome: string; tipo_strada: string }>;

describe('AliaClient', () => {
  it('maps the street catalogue into typed records', async () => {
    const calls: Array<{ path: string; form: Record<string, string> }> = [];
    const post: PostFn = async (path, form) => {
      calls.push({ path, form });
      return streets;
    };

    const result = await new AliaClient(post).getStreets('FIRENZE');

    expect(calls).toEqual([{ path: 'main/get_indirizzi', form: { comune: 'FIRENZE' } }]);
    expect(result[0]).toEqual({
      idStrada: '13370',
      nome: 'PIAZZA TADDEO GADDI',
      tipoStrada: 'EXQ',
    });
    expect(result).toHaveLength(4);
  });

  it('decodes HTML entities in street names', async () => {
    // 87 of Firenze's 1,560 street names arrive as e.g. "DELL&#039;INDIPENDENZA".
    // Alia's own page calls htmlDecode() on nome; the cross-check in the CLI
    // compares these against already-decoded text, so they must match.
    const post: PostFn = async () => streets;
    const result = await new AliaClient(post).getStreets('FIRENZE');

    expect(result[3]).toEqual({
      idStrada: '13185',
      nome: "PIAZZA DELL'INDIPENDENZA",
      tipoStrada: 'EXQ',
    });
  });

  it('returns an empty segment list when Alia sends null', async () => {
    const post: PostFn = async () => null;
    expect(await new AliaClient(post).getTratti('13370')).toEqual([]);
  });

  it('extracts segment names when present', async () => {
    const post: PostFn = async () => [{ tratto: 'DA MATTEOTTI A ALFANI' }];
    expect(await new AliaClient(post).getTratti('13563')).toEqual(['DA MATTEOTTI A ALFANI']);
  });
});
