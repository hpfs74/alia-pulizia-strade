# Alia Data Layer + Calendar Output — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested TypeScript library that reads Alia's street-cleaning schedule for any Florence street and emits a calendar file with night-before alarms.

**Architecture:** A thin HTTP client over Alia's four POST endpoints, a parser turning Italian rule text into a structured `CleaningRule`, a date projector that expands a rule into occurrences, and an `.ics` emitter. A cross-check module validates projected dates against Alia's own per-date city list, so a parser error surfaces as a test failure rather than a parking fine.

**Tech Stack:** Node 22.6+, TypeScript 5, vitest, zero runtime dependencies (native `fetch`, hand-rolled iCalendar).

**Spec:** `docs/superpowers/specs/2026-09-01-pulizia-strade-design.md`

## Global Constraints

- Node 22.6 or later (required by `--experimental-strip-types`). Native `fetch` only — no `axios`, no `node-fetch`.
- Zero runtime dependencies. Dev dependencies (typescript, vitest, @types/node) are fine.
- **No test may hit the network.** Tests use committed fixtures in `tests/fixtures/`. Only `src/cli/harvest.ts` and `src/cli/check.ts` make live requests, and they are run by hand.
- Live requests are throttled to **at most one request every 300ms** and send a `User-Agent` of `pulizia-strade-skill/0.1 (+https://github.com/hpfs/pulizia-strade-skill)`.
- Base URL is `https://www2.aliaserviziambientali.it/puliziastrade`.
- `parity` always means **odd/even day-of-month**, never odd/even occurrence-within-month. See the spec's "dispari trap" section.
- Any rule text the parser does not recognise returns `{ kind: 'unknown' }` and callers must treat it as "alert anyway". Failure direction is always toward over-alerting.
- All dates are handled as `YYYY-MM-DD` strings in Europe/Rome local terms. No UTC conversion anywhere.

---

### Task 1: Project scaffolding, shared types, HTML decoding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/alia/types.ts`
- Create: `src/alia/html.ts`
- Test: `tests/alia/html.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `decodeAliaHtml(payload: string): string` — takes the HTML-in-JSON string Alia returns and yields plain text with one logical line per element. Types `Street`, `Weekday`, `TimeWindow`, `Selector`, `CleaningRule`, `LookupResult`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "pulizia-strade",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.6" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "harvest": "node --experimental-strip-types src/cli/harvest.ts",
    "check": "node --experimental-strip-types src/cli/check.ts"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["node"],
    "lib": ["ES2022"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Create `src/alia/types.ts`**

```ts
/** Alia's street classification. ASM streets require a civic number; EXQ do not. */
export type TipoStrada = 'EXQ' | 'ASM' | (string & {});

export interface Street {
  idStrada: string;
  nome: string;
  tipoStrada: TipoStrada;
}

/** 0 = Sunday, matching JavaScript's Date#getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TimeWindow {
  /** Minutes from midnight, inclusive. */
  startMinutes: number;
  /** Minutes from midnight, exclusive. 06.00 becomes 360. */
  endMinutes: number;
}

/**
 * Which occurrences of `weekday` within a month are selected.
 * `oddDayOfMonth` means the DATE is odd (1st, 3rd, 15th...), NOT the
 * first/third occurrence. See the spec's "dispari trap" section.
 */
export type Selector =
  | { kind: 'oddDayOfMonth' }
  | { kind: 'evenDayOfMonth' }
  | { kind: 'nthOfMonth'; n: number }
  | { kind: 'everyWeek' }
  | { kind: 'unknown' };

export interface CleaningRule {
  weekday: Weekday;
  selector: Selector;
  window: TimeWindow;
  /** The original Italian sentence, kept for debugging and audit. */
  raw: string;
}

export type LookupResult =
  | {
      status: 'scheduled';
      street: string;
      /** YYYY-MM-DD, Europe/Rome local. */
      nextDate: string;
      window: TimeWindow;
      rule: CleaningRule;
      raw: string;
    }
  | { status: 'expired'; street: string; raw: string }
  | { status: 'none'; street: string; raw: string };
```

- [ ] **Step 6: Write the failing test**

Create `tests/alia/html.test.ts`:

```ts
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
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run tests/alia/html.test.ts`
Expected: FAIL — cannot resolve `../../src/alia/html.ts`.

- [ ] **Step 8: Create `src/alia/html.ts`**

```ts
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
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
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
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run tests/alia/html.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/alia/types.ts src/alia/html.ts tests/alia/html.test.ts
git commit -m "feat: scaffold project with shared types and Alia HTML decoding"
```

---

### Task 2: HTTP transport and street catalogue

**Files:**
- Create: `src/alia/transport.ts`
- Create: `src/alia/client.ts`
- Create: `tests/fixtures/get_indirizzi-firenze-sample.json`
- Test: `tests/alia/client.test.ts`

**Interfaces:**
- Consumes: `Street` from `src/alia/types.ts`.
- Produces:
  - `type PostFn = (path: string, form: Record<string, string>) => Promise<unknown>`
  - `createTransport(options?: { minIntervalMs?: number }): PostFn` — live, throttled.
  - `class AliaClient { constructor(post: PostFn); getStreets(comune: string): Promise<Street[]>; getTratti(idStrada: string): Promise<string[]> }`

`AliaClient` takes its `PostFn` by injection so tests supply a stub and never touch the network.

- [ ] **Step 1: Create the fixture**

Create `tests/fixtures/get_indirizzi-firenze-sample.json`:

```json
[
  { "id_strada": "13370", "nome": "PIAZZA TADDEO GADDI", "tipo_strada": "EXQ" },
  { "id_strada": "12892", "nome": "VIA ANTONIO MEUCCI", "tipo_strada": "EXQ" },
  { "id_strada": "13561", "nome": "VIA DEI SERRAGLI", "tipo_strada": "EXQ" }
]
```

- [ ] **Step 2: Write the failing test**

Create `tests/alia/client.test.ts`:

```ts
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
    expect(result).toHaveLength(3);
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/alia/client.test.ts`
Expected: FAIL — cannot resolve `../../src/alia/client.ts`.

- [ ] **Step 4: Create `src/alia/transport.ts`**

```ts
export const BASE_URL = 'https://www2.aliaserviziambientali.it/puliziastrade';
export const USER_AGENT =
  'pulizia-strade-skill/0.1 (+https://github.com/hpfs/pulizia-strade-skill)';

export type PostFn = (path: string, form: Record<string, string>) => Promise<unknown>;

/**
 * Live transport. Serialises every request through a single promise chain so
 * that calls are spaced by at least `minIntervalMs`, keeping us a negligible
 * load on Alia's servers even during a full-city harvest.
 */
export function createTransport(options: { minIntervalMs?: number } = {}): PostFn {
  const minIntervalMs = options.minIntervalMs ?? 300;
  let queue: Promise<unknown> = Promise.resolve();
  let lastStart = 0;

  return (path, form) => {
    const result = queue.then(async () => {
      const wait = Math.max(0, lastStart + minIntervalMs - Date.now());
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastStart = Date.now();

      const response = await fetch(`${BASE_URL}/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams(form).toString(),
      });

      if (!response.ok) {
        throw new Error(`Alia ${path} returned HTTP ${response.status}`);
      }
      return response.json();
    });

    queue = result.catch(() => undefined);
    return result;
  };
}
```

- [ ] **Step 5: Create `src/alia/client.ts`**

```ts
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/alia/client.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add src/alia/transport.ts src/alia/client.ts tests/alia/client.test.ts tests/fixtures/get_indirizzi-firenze-sample.json
git commit -m "feat: add throttled Alia transport and street catalogue client"
```

---

### Task 3: Lookup response parsing

**Files:**
- Modify: `src/alia/client.ts`
- Create: `src/alia/lookup.ts`
- Test: `tests/alia/lookup.test.ts`

**Interfaces:**
- Consumes: `decodeAliaHtml`, `LookupResult`, `AliaClient`.
- Produces:
  - `parseLookup(payload: string): LookupResult`
  - `AliaClient#lookup(args: { idStrada: string; tipoStrada: string; comune: string; tratto?: string; civico?: string }): Promise<LookupResult>`

This task detects *status* and extracts the raw rule sentence. Turning that sentence into a `CleaningRule` is Task 5; until then `rule` is built by a stub that Task 5 replaces.

- [ ] **Step 1: Write the failing test**

Create `tests/alia/lookup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseLookup } from '../../src/alia/lookup.ts';

const SCHEDULED =
  '<h4>PIAZZA TADDEO GADDI</h4><p>La data di prossima pulizia strade &egrave;:</p>' +
  '<p>Martedi 15/9/2026</p><p>Orario 00.00 - 06.00</p>' +
  '<p>Ogni Martedi dispari del mese dalle 00.00 alle 06.00</p>';

const EXPIRED =
  "<h4>BORGO PINTI</h4><p>L'ordinanza per questo tratto di strada &egrave; scaduta</p>" +
  '<p>Momentaneamente non sono previste altre ordinanze</p>';

describe('parseLookup', () => {
  it('extracts street, next date and window from a scheduled response', () => {
    const result = parseLookup(SCHEDULED);
    expect(result.status).toBe('scheduled');
    if (result.status !== 'scheduled') return;
    expect(result.street).toBe('PIAZZA TADDEO GADDI');
    expect(result.nextDate).toBe('2026-09-15');
    expect(result.window).toEqual({ startMinutes: 0, endMinutes: 360 });
    expect(result.rule.raw).toBe('Ogni Martedi dispari del mese dalle 00.00 alle 06.00');
  });

  it('zero-pads single-digit days and months', () => {
    const payload = SCHEDULED.replace('Martedi 15/9/2026', 'Martedi 1/9/2026');
    const result = parseLookup(payload);
    expect(result.status === 'scheduled' && result.nextDate).toBe('2026-09-01');
  });

  it('detects an expired ordinance', () => {
    const result = parseLookup(EXPIRED);
    expect(result.status).toBe('expired');
    expect(result.street).toBe('BORGO PINTI');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/alia/lookup.test.ts`
Expected: FAIL — cannot resolve `../../src/alia/lookup.ts`.

- [ ] **Step 3: Create `src/alia/lookup.ts`**

```ts
import { decodeAliaHtml } from './html.ts';
import { parseRule } from './rule.ts';
import type { LookupResult, TimeWindow } from './types.ts';

const DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
const WINDOW_RE = /Orario\s+(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})/i;
const RULE_RE = /^(?:Ogni|Il|Lo|La)\s+.*\bdalle\b.*\balle\b.*$/i;

export function parseTimeWindow(text: string): TimeWindow | null {
  const match = WINDOW_RE.exec(text);
  if (!match) return null;
  return {
    startMinutes: Number(match[1]) * 60 + Number(match[2]),
    endMinutes: Number(match[3]) * 60 + Number(match[4]),
  };
}

export function parseLookup(payload: string): LookupResult {
  const text = decodeAliaHtml(payload);
  const lines = text.split('\n').filter((line) => line !== '×');
  const street = lines[0] ?? '';

  if (/ordinanza/i.test(text) && /scadut/i.test(text)) {
    return { status: 'expired', street, raw: text };
  }

  const dateMatch = DATE_RE.exec(text);
  const window = parseTimeWindow(text);
  const ruleLine = lines.find((line) => RULE_RE.test(line));

  if (!dateMatch || !window || !ruleLine) {
    return { status: 'none', street, raw: text };
  }

  const day = dateMatch[1]!.padStart(2, '0');
  const month = dateMatch[2]!.padStart(2, '0');

  return {
    status: 'scheduled',
    street,
    nextDate: `${dateMatch[3]}-${month}-${day}`,
    window,
    rule: parseRule(ruleLine, window),
    raw: text,
  };
}
```

- [ ] **Step 4: Create the Task 5 seam so this compiles**

Create `src/alia/rule.ts` with the minimum needed now. Task 5 replaces the body.

```ts
import type { CleaningRule, TimeWindow } from './types.ts';

export function parseRule(raw: string, window: TimeWindow): CleaningRule {
  return { weekday: 0, selector: { kind: 'unknown' }, window, raw };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/alia/lookup.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Add `lookup` to `AliaClient`**

Append this method inside the `AliaClient` class in `src/alia/client.ts`, and add
`import { parseLookup } from './lookup.ts';` plus
`import type { LookupResult } from './types.ts';` at the top:

```ts
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
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/alia/lookup.ts src/alia/rule.ts src/alia/client.ts tests/alia/lookup.test.ts
git commit -m "feat: parse Alia lookup responses into typed results"
```

---

### Task 4: Grammar harvest script

**Files:**
- Create: `src/cli/harvest.ts`
- Create: `data/.gitkeep`

**Interfaces:**
- Consumes: `AliaClient`, `createTransport`, `parseLookup`.
- Produces: `data/rule-corpus.json` — an array of
  `{ raw: string; count: number; examples: string[] }`, sorted by descending count.
  Task 5 consumes this file as its completeness target.

This task has no unit test: it is an operator script whose output is a committed
data artefact. Its correctness is verified by inspecting the corpus.

- [ ] **Step 1: Create `src/cli/harvest.ts`**

```ts
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
```

- [ ] **Step 2: Run the harvest**

Run: `npm run harvest`
Expected: roughly 8–10 minutes for Firenze at 300ms spacing. Prints progress every 25 streets and finishes with a distinct-phrasing count. Safe to interrupt and re-run — progress resumes from `data/harvest-progress.json`.

- [ ] **Step 3: Inspect the corpus**

Run: `head -60 data/rule-corpus.json`
Expected: entries such as `Ogni Martedi dispari del mese dalle 00.00 alle 06.00` and `Il 1º Mercoledi del mese dalle 13.00 alle 19.00`. Read every distinct phrasing before starting Task 5 — this list is the parser's specification.

- [ ] **Step 4: Commit**

```bash
git add src/cli/harvest.ts data/rule-corpus.json
git commit -m "feat: add rule grammar harvest and Firenze corpus"
```

---

### Task 5: Rule parser, complete over the corpus

**Files:**
- Modify: `src/alia/rule.ts`
- Test: `tests/alia/rule.test.ts`

**Interfaces:**
- Consumes: `data/rule-corpus.json`, `CleaningRule`, `Selector`, `TimeWindow`.
- Produces: `parseRule(raw: string, window: TimeWindow): CleaningRule` — same signature as the Task 3 stub, now returning real selectors.

The corpus test is the point of this task: it asserts that **every** phrasing
Alia actually uses parses to a known selector. It will fail until each grammar
in the corpus has a handler.

- [ ] **Step 1: Write the failing test**

Create `tests/alia/rule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseRule } from '../../src/alia/rule.ts';
import { readFileSync } from 'node:fs';

const corpus = JSON.parse(
  readFileSync(new URL('../../data/rule-corpus.json', import.meta.url), 'utf8'),
) as Array<{ raw: string; count: number; examples: string[] }>;

const WINDOW = { startMinutes: 0, endMinutes: 360 };

describe('parseRule', () => {
  it('parses odd day-of-month rules', () => {
    const rule = parseRule('Ogni Martedi dispari del mese dalle 00.00 alle 06.00', WINDOW);
    expect(rule.weekday).toBe(2);
    expect(rule.selector).toEqual({ kind: 'oddDayOfMonth' });
  });

  it('parses even day-of-month rules', () => {
    const rule = parseRule('Ogni Giovedi pari del mese dalle 00.00 alle 06.00', WINDOW);
    expect(rule.weekday).toBe(4);
    expect(rule.selector).toEqual({ kind: 'evenDayOfMonth' });
  });

  it('parses nth-occurrence rules', () => {
    const rule = parseRule('Il 1º Mercoledi del mese dalle 13.00 alle 19.00', WINDOW);
    expect(rule.weekday).toBe(3);
    expect(rule.selector).toEqual({ kind: 'nthOfMonth', n: 1 });
  });

  it('returns unknown rather than guessing', () => {
    expect(parseRule('Quando capita, forse', WINDOW).selector).toEqual({ kind: 'unknown' });
  });

  it.each(corpus.map((entry) => [entry.raw, entry.examples[0]] as const))(
    'parses corpus phrasing %s (e.g. %s)',
    (raw) => {
      expect(parseRule(raw, WINDOW).selector.kind).not.toBe('unknown');
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/alia/rule.test.ts`
Expected: FAIL — the stub returns `unknown` for every case.

- [ ] **Step 3: Implement the parser**

Replace `src/alia/rule.ts` entirely:

```ts
import type { CleaningRule, Selector, TimeWindow, Weekday } from './types.ts';

/** Alia writes weekday names without accents. Both forms are accepted. */
const WEEKDAYS: Record<string, Weekday> = {
  domenica: 0,
  lunedi: 1,
  lunedì: 1,
  martedi: 2,
  martedì: 2,
  mercoledi: 3,
  mercoledì: 3,
  giovedi: 4,
  giovedì: 4,
  venerdi: 5,
  venerdì: 5,
  sabato: 6,
};

function findWeekday(raw: string): Weekday | null {
  const lower = raw.toLowerCase();
  for (const [name, day] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) return day;
  }
  return null;
}

function findSelector(raw: string): Selector {
  const lower = raw.toLowerCase();

  // "Ogni Martedi dispari del mese" — the DATE is odd, not the occurrence.
  if (/\bdispari\b/.test(lower)) return { kind: 'oddDayOfMonth' };
  if (/\bpari\b/.test(lower)) return { kind: 'evenDayOfMonth' };

  // "Il 1º Mercoledi del mese", also written 1°, 1o, or 1.
  const nth = /\b(\d)\s*(?:º|°|o)?\s*(?:domenica|luned|marted|mercoled|gioved|venerd|sabato)/i.exec(
    raw,
  );
  if (nth) return { kind: 'nthOfMonth', n: Number(nth[1]) };

  if (/\bogni\s+settimana\b|\btutti\s+i\b|\bsettimanale\b/.test(lower)) {
    return { kind: 'everyWeek' };
  }
  return { kind: 'unknown' };
}

export function parseRule(raw: string, window: TimeWindow): CleaningRule {
  const weekday = findWeekday(raw);
  if (weekday === null) {
    return { weekday: 0, selector: { kind: 'unknown' }, window, raw };
  }
  return { weekday, selector: findSelector(raw), window, raw };
}
```

- [ ] **Step 4: Run the test and close remaining corpus gaps**

Run: `npx vitest run tests/alia/rule.test.ts`

If any corpus phrasing still reports `unknown`, add a handler for it in
`findSelector` and, if it is a genuinely new shape, add a variant to `Selector`
in `src/alia/types.ts` plus a matching branch in Task 6's `matchesRule`. Repeat
until green. Do **not** delete a failing corpus case to make the suite pass —
an unparsed grammar is a real gap that would silently under-alert someone.

Expected when done: PASS, 4 unit tests plus one per distinct corpus phrasing.

- [ ] **Step 5: Commit**

```bash
git add src/alia/rule.ts src/alia/types.ts tests/alia/rule.test.ts
git commit -m "feat: parse Italian cleaning rules with corpus completeness test"
```

---

### Task 6: Occurrence projection

**Files:**
- Create: `src/schedule/occurrences.ts`
- Test: `tests/schedule/occurrences.test.ts`

**Interfaces:**
- Consumes: `CleaningRule`, `Selector`.
- Produces:
  - `matchesRule(rule: CleaningRule, date: string): boolean`
  - `projectOccurrences(rule: CleaningRule, fromDate: string, count: number): string[]` — `YYYY-MM-DD`, strictly after `fromDate`.

The test data is the empirically verified table from the spec. These exact dates
came from Alia's own per-date listings, so a regression here is a real defect.

- [ ] **Step 1: Write the failing test**

Create `tests/schedule/occurrences.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchesRule, projectOccurrences } from '../../src/schedule/occurrences.ts';
import type { CleaningRule } from '../../src/alia/types.ts';

const GADDI: CleaningRule = {
  weekday: 2,
  selector: { kind: 'oddDayOfMonth' },
  window: { startMinutes: 0, endMinutes: 360 },
  raw: 'Ogni Martedi dispari del mese dalle 00.00 alle 06.00',
};

describe('projectOccurrences', () => {
  // Verified against Alia's calcola_data_all on 2026-09-01. See the spec.
  it('reproduces the confirmed Taddeo Gaddi schedule', () => {
    expect(projectOccurrences(GADDI, '2026-09-01', 6)).toEqual([
      '2026-09-15',
      '2026-09-29',
      '2026-10-13',
      '2026-10-27',
      '2026-11-03',
      '2026-11-17',
    ]);
  });

  it('excludes the even-dated Tuesdays Alia omits', () => {
    for (const date of ['2026-10-06', '2026-10-20', '2026-11-10', '2026-11-24']) {
      expect(matchesRule(GADDI, date)).toBe(false);
    }
  });

  it('includes the odd-dated Tuesdays Alia lists', () => {
    for (const date of ['2026-09-01', '2026-10-13', '2026-11-03']) {
      expect(matchesRule(GADDI, date)).toBe(true);
    }
  });

  it('handles the 7-day gap across a month boundary', () => {
    expect(projectOccurrences(GADDI, '2026-10-27', 1)).toEqual(['2026-11-03']);
  });

  it('selects the nth occurrence, not the nth date', () => {
    const rule: CleaningRule = {
      weekday: 3,
      selector: { kind: 'nthOfMonth', n: 1 },
      window: { startMinutes: 780, endMinutes: 1140 },
      raw: 'Il 1º Mercoledi del mese dalle 13.00 alle 19.00',
    };
    expect(projectOccurrences(rule, '2026-08-31', 2)).toEqual(['2026-09-02', '2026-10-07']);
  });

  it('never matches an unknown selector', () => {
    const rule: CleaningRule = { ...GADDI, selector: { kind: 'unknown' } };
    expect(matchesRule(rule, '2026-09-15')).toBe(false);
    expect(projectOccurrences(rule, '2026-09-01', 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schedule/occurrences.test.ts`
Expected: FAIL — cannot resolve `../../src/schedule/occurrences.ts`.

- [ ] **Step 3: Create `src/schedule/occurrences.ts`**

```ts
import type { CleaningRule } from '../alia/types.ts';

/** Parse YYYY-MM-DD as a UTC calendar date. UTC avoids DST shifting the day. */
function toDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Which occurrence of its weekday this date is within its month: 1-based. */
function occurrenceInMonth(date: Date): number {
  return Math.floor((date.getUTCDate() - 1) / 7) + 1;
}

export function matchesRule(rule: CleaningRule, iso: string): boolean {
  const date = toDate(iso);
  if (date.getUTCDay() !== rule.weekday) return false;

  switch (rule.selector.kind) {
    case 'oddDayOfMonth':
      return date.getUTCDate() % 2 === 1;
    case 'evenDayOfMonth':
      return date.getUTCDate() % 2 === 0;
    case 'nthOfMonth':
      return occurrenceInMonth(date) === rule.selector.n;
    case 'everyWeek':
      return true;
    case 'unknown':
      return false;
  }
}

/** The next `count` cleaning dates strictly after `fromDate`. */
export function projectOccurrences(
  rule: CleaningRule,
  fromDate: string,
  count: number,
): string[] {
  if (rule.selector.kind === 'unknown') return [];

  const found: string[] = [];
  const cursor = toDate(fromDate);
  // Two years is far beyond any real ordinance and bounds the loop.
  const limit = 366 * 2;

  for (let step = 0; step < limit && found.length < count; step += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const iso = toIso(cursor);
    if (matchesRule(rule, iso)) found.push(iso);
  }
  return found;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/schedule/occurrences.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/schedule/occurrences.ts tests/schedule/occurrences.test.ts
git commit -m "feat: project cleaning rules into dates with verified fixtures"
```

---

### Task 7: RRULE emission

**Files:**
- Create: `src/schedule/rrule.ts`
- Test: `tests/schedule/rrule.test.ts`

**Interfaces:**
- Consumes: `CleaningRule`.
- Produces: `toRrule(rule: CleaningRule): string | null` — an RFC 5545 RRULE, or `null` for `unknown`.

Phase 1b feeds this to the Alexa Reminders API. Emitting and testing it now means
the intersection-semantics experiment on real hardware needs no new code.

- [ ] **Step 1: Write the failing test**

Create `tests/schedule/rrule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toRrule } from '../../src/schedule/rrule.ts';
import type { CleaningRule } from '../../src/alia/types.ts';

const base = { window: { startMinutes: 0, endMinutes: 360 }, raw: 'x' };

describe('toRrule', () => {
  it('emits the odd day-of-month intersection', () => {
    const rule: CleaningRule = { ...base, weekday: 2, selector: { kind: 'oddDayOfMonth' } };
    expect(toRrule(rule)).toBe(
      'FREQ=MONTHLY;BYDAY=TU;BYMONTHDAY=1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31',
    );
  });

  it('emits the even day-of-month intersection', () => {
    const rule: CleaningRule = { ...base, weekday: 4, selector: { kind: 'evenDayOfMonth' } };
    expect(toRrule(rule)).toBe(
      'FREQ=MONTHLY;BYDAY=TH;BYMONTHDAY=2,4,6,8,10,12,14,16,18,20,22,24,26,28,30',
    );
  });

  it('emits an ordinal BYDAY for nth-of-month', () => {
    const rule: CleaningRule = { ...base, weekday: 3, selector: { kind: 'nthOfMonth', n: 1 } };
    expect(toRrule(rule)).toBe('FREQ=MONTHLY;BYDAY=1WE');
  });

  it('emits a weekly rule', () => {
    const rule: CleaningRule = { ...base, weekday: 1, selector: { kind: 'everyWeek' } };
    expect(toRrule(rule)).toBe('FREQ=WEEKLY;BYDAY=MO');
  });

  it('returns null for unknown selectors', () => {
    const rule: CleaningRule = { ...base, weekday: 1, selector: { kind: 'unknown' } };
    expect(toRrule(rule)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schedule/rrule.test.ts`
Expected: FAIL — cannot resolve `../../src/schedule/rrule.ts`.

- [ ] **Step 3: Create `src/schedule/rrule.ts`**

```ts
import type { CleaningRule, Weekday } from '../alia/types.ts';

const BYDAY: Record<Weekday, string> = {
  0: 'SU',
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
};

const ODD_DAYS = Array.from({ length: 16 }, (_, i) => i * 2 + 1).join(',');
const EVEN_DAYS = Array.from({ length: 15 }, (_, i) => (i + 1) * 2).join(',');

/**
 * RFC 5545: with FREQ=MONTHLY, BYDAY and BYMONTHDAY intersect. Whether Alexa
 * honours that intersection is the open question in the spec and must be
 * verified on a real device before Phase 1b depends on it.
 */
export function toRrule(rule: CleaningRule): string | null {
  const day = BYDAY[rule.weekday];

  switch (rule.selector.kind) {
    case 'oddDayOfMonth':
      return `FREQ=MONTHLY;BYDAY=${day};BYMONTHDAY=${ODD_DAYS}`;
    case 'evenDayOfMonth':
      return `FREQ=MONTHLY;BYDAY=${day};BYMONTHDAY=${EVEN_DAYS}`;
    case 'nthOfMonth':
      return `FREQ=MONTHLY;BYDAY=${rule.selector.n}${day}`;
    case 'everyWeek':
      return `FREQ=WEEKLY;BYDAY=${day}`;
    case 'unknown':
      return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/schedule/rrule.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/schedule/rrule.ts tests/schedule/rrule.test.ts
git commit -m "feat: emit RFC 5545 rules from cleaning schedules"
```

---

### Task 8: City-wide ground truth and cross-check

**Files:**
- Modify: `src/alia/client.ts`
- Create: `src/alia/city-list.ts`
- Create: `src/schedule/verify.ts`
- Test: `tests/alia/city-list.test.ts`, `tests/schedule/verify.test.ts`

**Interfaces:**
- Consumes: `decodeAliaHtml`, `matchesRule`, `AliaClient`.
- Produces:
  - `parseCityList(payload: string): string[]` — street names cleaned on that date.
  - `AliaClient#getCityList(comune: string, date: string): Promise<string[]>` (date as `YYYY-MM-DD`).
  - `crossCheck(args: { rule: CleaningRule; street: string; date: string; cityList: string[] }): { agrees: boolean; predicted: boolean; actual: boolean }`

This is the safety net that would have caught the reading-A error automatically.

- [ ] **Step 1: Write the failing tests**

Create `tests/alia/city-list.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseCityList } from '../../src/alia/city-list.ts';

const PAYLOAD =
  '<h4>Elenco strade di FIRENZE interessate dal servizio</h4><p>In data: 13/10/2026</p>' +
  '<p>PIAZZA TADDEO GADDI, Orario: 00.00 - 06.00</p>' +
  '<p>VIA DEI SERRAGLI, DA SAURO A S. MONACA, Orario: 00.00 - 06.00</p>';

describe('parseCityList', () => {
  it('extracts street names, dropping segment and time detail', () => {
    expect(parseCityList(PAYLOAD)).toEqual(['PIAZZA TADDEO GADDI', 'VIA DEI SERRAGLI']);
  });

  it('ignores the header lines', () => {
    expect(parseCityList(PAYLOAD)).not.toContain('In data: 13/10/2026');
  });
});
```

Create `tests/schedule/verify.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { crossCheck } from '../../src/schedule/verify.ts';
import type { CleaningRule } from '../../src/alia/types.ts';

const GADDI: CleaningRule = {
  weekday: 2,
  selector: { kind: 'oddDayOfMonth' },
  window: { startMinutes: 0, endMinutes: 360 },
  raw: 'Ogni Martedi dispari del mese dalle 00.00 alle 06.00',
};

describe('crossCheck', () => {
  it('agrees when prediction and city list both say yes', () => {
    const result = crossCheck({
      rule: GADDI,
      street: 'PIAZZA TADDEO GADDI',
      date: '2026-10-13',
      cityList: ['PIAZZA TADDEO GADDI'],
    });
    expect(result).toEqual({ agrees: true, predicted: true, actual: true });
  });

  it('agrees when both say no', () => {
    expect(
      crossCheck({ rule: GADDI, street: 'PIAZZA TADDEO GADDI', date: '2026-10-20', cityList: [] })
        .agrees,
    ).toBe(true);
  });

  it('flags disagreement when the city list contradicts the rule', () => {
    // This is exactly the signature the wrong "dispari" reading would produce.
    const result = crossCheck({
      rule: GADDI,
      street: 'PIAZZA TADDEO GADDI',
      date: '2026-10-06',
      cityList: ['PIAZZA TADDEO GADDI'],
    });
    expect(result).toEqual({ agrees: false, predicted: false, actual: true });
  });

  it('matches street names case- and whitespace-insensitively', () => {
    expect(
      crossCheck({
        rule: GADDI,
        street: 'piazza  taddeo gaddi',
        date: '2026-10-13',
        cityList: ['PIAZZA TADDEO GADDI'],
      }).actual,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/alia/city-list.test.ts tests/schedule/verify.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/alia/city-list.ts`**

```ts
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
```

- [ ] **Step 4: Create `src/schedule/verify.ts`**

```ts
import type { CleaningRule } from '../alia/types.ts';
import { matchesRule } from './occurrences.ts';

function normalise(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Compare what our parsed rule predicts against what Alia's own per-date city
 * listing says. Disagreement means our parse is wrong; callers must alert
 * conservatively and surface the mismatch.
 */
export function crossCheck(args: {
  rule: CleaningRule;
  street: string;
  date: string;
  cityList: string[];
}): { agrees: boolean; predicted: boolean; actual: boolean } {
  const predicted = matchesRule(args.rule, args.date);
  const target = normalise(args.street);
  const actual = args.cityList.some((entry) => normalise(entry) === target);
  return { agrees: predicted === actual, predicted, actual };
}
```

- [ ] **Step 5: Add `getCityList` to `AliaClient`**

Append inside the `AliaClient` class in `src/alia/client.ts`, adding
`import { parseCityList } from './city-list.ts';` at the top:

```ts
  /** `date` is YYYY-MM-DD; Alia expects DD/MM/YYYY. */
  async getCityList(comune: string, date: string): Promise<string[]> {
    const [year, month, day] = date.split('-');
    const payload = (await this.post('pulizie/calcola_data_all', {
      datatratti: `${day}/${month}/${year}`,
      comune,
    })) as string;
    return parseCityList(payload);
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/alia/city-list.test.ts tests/schedule/verify.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add src/alia/city-list.ts src/schedule/verify.ts src/alia/client.ts tests/alia/city-list.test.ts tests/schedule/verify.test.ts
git commit -m "feat: cross-check projected dates against Alia city listings"
```

---

### Task 9: iCalendar output

**Files:**
- Create: `src/ics/calendar.ts`
- Test: `tests/ics/calendar.test.ts`

**Interfaces:**
- Consumes: `CleaningRule`, `projectOccurrences`.
- Produces: `buildCalendar(args: { street: string; rule: CleaningRule; fromDate: string; count: number; alarmHour?: number }): string`

Events use **floating local time** — no `TZID`, no `Z` — so a calendar app in
Florence renders them at the right wall-clock time without shipping a
`VTIMEZONE` block. The alarm is an offset back to `alarmHour` (default 21:00) on
the evening before, so a 00:00 cleaning warns at 21:00 the night before and a
13:00 cleaning warns at 21:00 the previous evening too.

- [ ] **Step 1: Write the failing test**

Create `tests/ics/calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../../src/ics/calendar.ts';
import type { CleaningRule } from '../../src/alia/types.ts';

const GADDI: CleaningRule = {
  weekday: 2,
  selector: { kind: 'oddDayOfMonth' },
  window: { startMinutes: 0, endMinutes: 360 },
  raw: 'Ogni Martedi dispari del mese dalle 00.00 alle 06.00',
};

describe('buildCalendar', () => {
  const ics = buildCalendar({
    street: 'PIAZZA TADDEO GADDI',
    rule: GADDI,
    fromDate: '2026-09-01',
    count: 2,
  });

  it('wraps events in a valid VCALENDAR', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
  });

  it('emits one event per projected occurrence in floating local time', () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20260915T000000');
    expect(ics).toContain('DTEND:20260915T060000');
    expect(ics).toContain('DTSTART:20260929T000000');
  });

  it('alarms at 21:00 the evening before a midnight cleaning', () => {
    expect(ics).toContain('TRIGGER:-PT3H');
  });

  it('alarms the evening before an afternoon cleaning', () => {
    const afternoon = buildCalendar({
      street: 'VIA ANTONIO MEUCCI',
      rule: {
        weekday: 3,
        selector: { kind: 'nthOfMonth', n: 1 },
        window: { startMinutes: 780, endMinutes: 1140 },
        raw: 'Il 1º Mercoledi del mese dalle 13.00 alle 19.00',
      },
      fromDate: '2026-08-31',
      count: 1,
    });
    expect(afternoon).toContain('TRIGGER:-PT16H');
  });

  it('names the street in the summary and escapes commas', () => {
    expect(ics).toContain('SUMMARY:Pulizia strade — PIAZZA TADDEO GADDI');
    const withComma = buildCalendar({
      street: 'VIA DEI SERRAGLI, DA SAURO A S. MONACA',
      rule: GADDI,
      fromDate: '2026-09-01',
      count: 1,
    });
    expect(withComma).toContain('VIA DEI SERRAGLI\\, DA SAURO A S. MONACA');
  });

  it('produces no events for an unknown rule', () => {
    const unknown = buildCalendar({
      street: 'X',
      rule: { ...GADDI, selector: { kind: 'unknown' } },
      fromDate: '2026-09-01',
      count: 3,
    });
    expect(unknown).not.toContain('BEGIN:VEVENT');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ics/calendar.test.ts`
Expected: FAIL — cannot resolve `../../src/ics/calendar.ts`.

- [ ] **Step 3: Create `src/ics/calendar.ts`**

```ts
import type { CleaningRule } from '../alia/types.ts';
import { projectOccurrences } from '../schedule/occurrences.ts';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** RFC 5545 requires these characters to be escaped in TEXT values. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Fold lines longer than 75 octets, per RFC 5545 section 3.1. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join('\r\n');
}

function stamp(iso: string, minutes: number): string {
  const [year, month, day] = iso.split('-');
  return `${year}${month}${day}T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`;
}

export function buildCalendar(args: {
  street: string;
  rule: CleaningRule;
  fromDate: string;
  count: number;
  alarmHour?: number;
}): string {
  const alarmHour = args.alarmHour ?? 21;
  const dates = projectOccurrences(args.rule, args.fromDate, args.count);
  const summary = escapeText(`Pulizia strade — ${args.street}`);

  // Minutes from the alarm (previous evening) to the cleaning start.
  const leadMinutes = args.rule.window.startMinutes + (24 * 60 - alarmHour * 60);
  const trigger = `-PT${Math.floor(leadMinutes / 60)}H${
    leadMinutes % 60 === 0 ? '' : `${leadMinutes % 60}M`
  }`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//pulizia-strade//IT',
    'CALSCALE:GREGORIAN',
  ];

  for (const date of dates) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${date}-${args.street.replace(/\W+/g, '-').toLowerCase()}@pulizia-strade`,
      `DTSTART:${stamp(date, args.rule.window.startMinutes)}`,
      `DTEND:${stamp(date, args.rule.window.endMinutes)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${escapeText(args.rule.raw)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:${trigger}`,
      `DESCRIPTION:${summary}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ics/calendar.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ics/calendar.ts tests/ics/calendar.test.ts
git commit -m "feat: emit iCalendar files with night-before alarms"
```

---

### Task 10: Operator CLI

**Files:**
- Create: `src/cli/check.ts`
- Create: `config.example.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `node --experimental-strip-types src/cli/check.ts <street name> [--comune FIRENZE] [--civico 1] [--tratto "DA X A Y"] [--ics out.ics]`

The street is a configuration parameter, per the brief. The CLI resolves the
street by name, looks up the rule, cross-checks the next occurrence against the
city list, and optionally writes a calendar file.

- [ ] **Step 1: Create `config.example.json`**

```json
{
  "comune": "FIRENZE",
  "street": "PIAZZA TADDEO GADDI",
  "civico": "1",
  "occurrences": 24
}
```

- [ ] **Step 2: Create `src/cli/check.ts`**

```ts
import { writeFileSync } from 'node:fs';
import { AliaClient } from '../alia/client.ts';
import { createTransport } from '../alia/transport.ts';
import { buildCalendar } from '../ics/calendar.ts';
import { projectOccurrences } from '../schedule/occurrences.ts';
import { crossCheck } from '../schedule/verify.ts';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const positional = process.argv.slice(2).filter((arg, i, all) => {
  if (arg.startsWith('--')) return false;
  return !(i > 0 && all[i - 1]!.startsWith('--'));
});

const streetQuery = positional.join(' ');
const comune = flag('comune') ?? 'FIRENZE';
const civico = flag('civico') ?? '';
const tratto = flag('tratto') ?? '';
const icsPath = flag('ics');

if (!streetQuery) {
  console.error('usage: check.ts <street name> [--comune X] [--civico N] [--tratto T] [--ics out.ics]');
  process.exit(1);
}

const client = new AliaClient(createTransport());
const streets = await client.getStreets(comune);
const needle = streetQuery.replace(/\s+/g, ' ').trim().toUpperCase();
const street =
  streets.find((s) => s.nome.toUpperCase() === needle) ??
  streets.find((s) => s.nome.toUpperCase().includes(needle));

if (!street) {
  console.error(`No street matching "${streetQuery}" in ${comune}.`);
  process.exit(1);
}

const result = await client.lookup({
  idStrada: street.idStrada,
  tipoStrada: street.tipoStrada,
  comune,
  tratto,
  civico: street.tipoStrada === 'ASM' && civico === '' ? '1' : civico,
});

const segments = await client.getTratti(street.idStrada);
if (segments.length > 1 && tratto === '') {
  console.warn(
    `NOTE: this street has ${segments.length} segments and none was chosen. ` +
      `Re-run with --tratto "<one of: ${segments.join(' | ')}>" to be certain.`,
  );
}

console.log(`${street.nome} (${comune})`);

if (result.status !== 'scheduled') {
  console.log(`Status: ${result.status}. No cleaning currently scheduled.`);
  process.exit(0);
}

console.log(`Rule:  ${result.rule.raw}`);
console.log(`Alia's next date: ${result.nextDate}`);

if (result.rule.selector.kind === 'unknown') {
  console.warn('WARNING: rule text not understood. Treat every week as risky.');
  process.exit(2);
}

const today = new Date().toISOString().slice(0, 10);
const upcoming = projectOccurrences(result.rule, today, 6);
console.log(`Projected: ${upcoming.join(', ')}`);

const cityList = await client.getCityList(comune, result.nextDate);
const check = crossCheck({
  rule: result.rule,
  street: street.nome,
  date: result.nextDate,
  cityList,
});

if (check.agrees) {
  console.log('Cross-check: OK — projection matches Alia\'s city listing.');
} else {
  console.error(
    `Cross-check FAILED for ${result.nextDate}: predicted=${check.predicted} actual=${check.actual}`,
  );
}

if (icsPath) {
  const ics = buildCalendar({
    street: street.nome,
    rule: result.rule,
    fromDate: today,
    count: 24,
  });
  writeFileSync(icsPath, ics);
  console.log(`Wrote ${upcoming.length ? 24 : 0} events to ${icsPath}`);
}
```

- [ ] **Step 3: Run it against the known-answer street**

Run: `npm run check -- "Piazza Taddeo Gaddi" --civico 1`
Expected output includes:

```
Rule:  Ogni Martedi dispari del mese dalle 00.00 alle 06.00
Cross-check: OK — projection matches Alia's city listing.
```

- [ ] **Step 4: Generate a calendar and import it**

Run: `npm run check -- "Piazza Taddeo Gaddi" --civico 1 --ics pulizia.ics`
Expected: `pulizia.ics` written. Open it in Calendar.app and confirm the first
event sits on a Tuesday with an odd date and its alert fires at 21:00 the
previous evening.

- [ ] **Step 5: Replace `README.md`**

```markdown
# Pulizia Strade

Reads Alia's Florence street-cleaning schedule and emits a calendar with
night-before alarms, so the car gets moved before the street is cleaned.

## Usage

    npm install
    npm run check -- "Piazza Taddeo Gaddi" --civico 1
    npm run check -- "Piazza Taddeo Gaddi" --civico 1 --ics pulizia.ics

Import `pulizia.ics` into any calendar app. Events use floating local time, so
they render correctly for a calendar set to Europe/Rome.

## Why the cross-check exists

Alia writes rules like `Ogni Martedi dispari del mese`. "Dispari" means the
**date** is odd, not the occurrence — so October 2026 is the 13th and 27th, not
the 6th and 20th. Getting this backwards alerts on the wrong nights entirely.
Every projection is therefore verified against Alia's own per-date listing.

See `docs/superpowers/specs/2026-09-01-pulizia-strade-design.md`.

## Development

    npm test
    npm run typecheck
    npm run harvest   # refresh data/rule-corpus.json (~10 min, live requests)
```

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/cli/check.ts config.example.json README.md
git commit -m "feat: add operator CLI and document usage"
```

---

## Done when

- `npx vitest run` and `npx tsc --noEmit` both pass.
- `data/rule-corpus.json` is committed and every phrasing in it parses.
- `npm run check -- "Piazza Taddeo Gaddi" --civico 1` reports the verified rule
  and a passing cross-check.
- An imported `.ics` alarms at 21:00 on the evening before an odd-dated Tuesday.

## Next, not in this plan

Phase 1b (dev-mode Alexa skill; resolve the `BYDAY`+`BYMONTHDAY` intersection
question on real hardware) and Phase 2 (multi-user backend, GDPR, certification)
each get their own plan.
