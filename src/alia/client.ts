import type { Street } from './types.ts';
import type { PostFn } from './transport.ts';

interface RawStreet {
  id_strada: string;
  nome: string;
  tipo_strada: string;
}

export class AliaClient {
  constructor(private readonly post: PostFn) {}

  async getStreets(comune: string): Promise<Street[]> {
    const raw = (await this.post('main/get_indirizzi', { comune })) as RawStreet[] | null;
    return (raw ?? []).map((entry) => ({
      idStrada: entry.id_strada,
      nome: entry.nome,
      tipoStrada: entry.tipo_strada,
    }));
  }

  async getTratti(idStrada: string): Promise<string[]> {
    const raw = (await this.post('main/get_tratti', { id_strada: idStrada })) as
      | Array<{ tratto: string }>
      | null;
    return (raw ?? []).map((entry) => entry.tratto);
  }
}
