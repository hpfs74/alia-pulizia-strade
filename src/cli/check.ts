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
const icsCount = 24;

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
    count: icsCount,
  });
  writeFileSync(icsPath, ics);
  // Report the number of events the calendar actually contains, not a
  // hardcoded guess — buildCalendar's projection may fall short of
  // icsCount if the rule can't fill the requested window.
  const written = projectOccurrences(result.rule, today, icsCount);
  console.log(`Wrote ${written.length} events to ${icsPath}`);
}
