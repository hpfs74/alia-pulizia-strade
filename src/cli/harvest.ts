import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { AliaClient } from '../alia/client.ts';
import { createTransport } from '../alia/transport.ts';

const COMUNE = process.argv[2] ?? 'FIRENZE';
const OUT = 'data/rule-corpus.json';
const PROGRESS = 'data/harvest-progress.json';

interface Progress {
  done: Record<string, string | null>;
}

async function main(): Promise<void> {
  mkdirSync('data', { recursive: true });
  const client = new AliaClient(createTransport({ minIntervalMs: 300 }));
  const streets = await client.getStreets(COMUNE);
  console.log(`${streets.length} streets in ${COMUNE}`);

  const progress: Progress = existsSync(PROGRESS)
    ? (JSON.parse(readFileSync(PROGRESS, 'utf8')) as Progress)
    : { done: {} };

  for (const [index, street] of streets.entries()) {
    if (street.idStrada in progress.done) continue;
    try {
      const result = await client.lookup({
        idStrada: street.idStrada,
        tipoStrada: street.tipoStrada,
        comune: COMUNE,
        civico: street.tipoStrada === 'ASM' ? '1' : '',
      });
      progress.done[street.idStrada] =
        result.status === 'scheduled' ? result.rule.raw : null;
    } catch (error) {
      console.warn(`skip ${street.nome}: ${(error as Error).message}`);
      progress.done[street.idStrada] = null;
    }

    if (index % 25 === 0) {
      writeFileSync(PROGRESS, JSON.stringify(progress));
      console.log(`${index}/${streets.length}`);
    }
  }
  writeFileSync(PROGRESS, JSON.stringify(progress));

  const byId = new Map(streets.map((s) => [s.idStrada, s.nome]));
  const grouped = new Map<string, { raw: string; count: number; examples: string[] }>();
  for (const [id, raw] of Object.entries(progress.done)) {
    if (raw === null) continue;
    const entry = grouped.get(raw) ?? { raw, count: 0, examples: [] };
    entry.count += 1;
    if (entry.examples.length < 3) entry.examples.push(byId.get(id) ?? id);
    grouped.set(raw, entry);
  }

  const corpus = [...grouped.values()].sort((a, b) => b.count - a.count);
  writeFileSync(OUT, `${JSON.stringify(corpus, null, 2)}\n`);
  console.log(`${corpus.length} distinct rule phrasings written to ${OUT}`);
}

await main();
