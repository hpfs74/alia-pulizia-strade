import { decodeAliaHtml } from './html.ts';
import { parseCityList } from './city-list.ts';
import { parseLookup } from './lookup.ts';
import type { LookupResult, Street } from './types.ts';
import type { PostFn } from './transport.ts';

interface RawStreet {
  id_strada: string;
  nome: string;
  tipo_strada: string;
}

export class AliaClient {
  private readonly post: PostFn;

  constructor(post: PostFn) {
    this.post = post;
  }

  async getStreets(comune: string): Promise<Street[]> {
    const raw = (await this.post('main/get_indirizzi', { comune })) as RawStreet[] | null;
    return (raw ?? []).map((entry) => ({
      idStrada: entry.id_strada,
      // Alia serves names HTML-encoded ("PIAZZA DELL&#039;INDIPENDENZA") and its
      // own page calls htmlDecode() before displaying them. Mirror that, so the
      // catalogue compares equal to text that came back through decodeAliaHtml.
      nome: decodeAliaHtml(entry.nome),
      tipoStrada: entry.tipo_strada,
    }));
  }

  async getTratti(idStrada: string): Promise<string[]> {
    const raw = (await this.post('main/get_tratti', { id_strada: idStrada })) as
      | Array<{ tratto: string }>
      | null;
    return (raw ?? []).map((entry) => entry.tratto);
  }

  async lookup(args: {
    idStrada: string;
    tipoStrada: string;
    comune: string;
    tratto?: string;
    civico?: string;
  }): Promise<LookupResult> {
    const payload = (await this.post('pulizie/calcola_data', {
      id_strada: args.idStrada,
      tipo_strada: args.tipoStrada,
      comune: args.comune,
      trattostrada: args.tratto ?? '',
      civico: args.civico ?? '',
    })) as string;
    return parseLookup(payload);
  }

  /** `date` is YYYY-MM-DD; Alia expects DD/MM/YYYY. */
  async getCityList(comune: string, date: string): Promise<string[]> {
    const [year, month, day] = date.split('-');
    const payload = (await this.post('pulizie/calcola_data_all', {
      datatratti: `${day}/${month}/${year}`,
      comune,
    })) as string;
    return parseCityList(payload);
  }
}
