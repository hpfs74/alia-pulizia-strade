import { writeFileSync } from 'node:fs';
import { AliaClient } from '../alia/client.ts';
import { createTransport } from '../alia/transport.ts';
import { buildCalendar } from '../ics/calendar.ts';
import { projectOccurrences } from '../schedule/occurrences.ts';
import { selectCrossCheckDates } from '../schedule/sample.ts';
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

// ASM streets need a civic number; Alia ignores it for EXQ ones (every street
// in Florence). Whatever we actually sent is what the answer describes, so the
// same value goes into the calendar's UIDs below.
const effectiveCivico = street.tipoStrada === 'ASM' && civico === '' ? '1' : civico;

const result = await client.lookup({
  idStrada: street.idStrada,
  tipoStrada: street.tipoStrada,
  comune,
  tratto,
  civico: effectiveCivico,
});

const segments = await client.getTratti(street.idStrada);
if (segments.length > 1 && tratto === '') {
  console.warn(
    `NOTE: this street has ${segments.length} segments and none was chosen. ` +
      `Re-run with --tratto "<one of: ${segments.join(' | ')}>" to be certain.`,
  );
}

console.log(`${street.nome} (${comune})`);

if (result.status === 'unparsed') {
  // NOT the same as 'none'. Alia described a cleaning we failed to read, so
  // saying "nothing scheduled" here would be exactly the under-alert this
  // tool exists to prevent.
  console.error(`Could not read Alia's answer: ${result.reason}.`);
  console.error('Treat every night as risky until this is checked by hand.');
  console.error(`Alia said:\n${result.raw}`);
  process.exit(2);
}

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

// Deliberately UTC, not Europe/Rome. Between 00:00 and 02:00 Rome time this is
// still yesterday, so projection starts a day early and the run shows one extra
// date. That errs towards more alerts, never fewer, which is the safe direction
// here; converting to Rome time would risk dropping tonight's cleaning instead.
const today = new Date().toISOString().slice(0, 10);
const upcoming = projectOccurrences(result.rule, today, 6);
console.log(`Projected: ${upcoming.join(', ')}`);

// Sample both directions against Alia's own per-date listing. Checking only
// result.nextDate proves nothing: Alia named that date, so it is in the
// listing by construction and the comparison reduces to re-running our own
// matcher offline.
const sample = selectCrossCheckDates(result.rule, today);
const failures: string[] = [];

console.log(`Cross-check: sampling ${sample.length} dates against Alia's city listing...`);

for (const { date, predicted } of sample) {
  const cityList = await client.getCityList(comune, date);
  const check = crossCheck({ rule: result.rule, street: street.nome, date, cityList });
  const verdict = check.agrees ? 'OK' : 'MISMATCH';
  console.log(
    `  ${date}  we say ${predicted ? 'CLEANING' : 'clear   '}  ` +
      `Alia says ${check.actual ? 'CLEANING' : 'clear   '}  ${verdict}`,
  );
  if (!check.agrees) failures.push(date);
}

if (failures.length > 0) {
  console.error(
    `\nCross-check FAILED on ${failures.length} of ${sample.length} dates: ${failures.join(', ')}.`,
  );
  console.error(
    'Our reading of the rule disagrees with Alia\'s own listing, so the projected\n' +
      'dates above cannot be trusted and no calendar was written. Check the street\n' +
      'by hand at https://www2.aliaserviziambientali.it/puliziastrade before parking.',
  );
  process.exit(3);
}

console.log(`Cross-check: OK — all ${sample.length} sampled dates agree with Alia.`);

if (icsPath) {
  const ics = buildCalendar({
    street: street.nome,
    rule: result.rule,
    fromDate: today,
    count: icsCount,
    tratto: tratto || undefined,
    civico: effectiveCivico || undefined,
  });
  if (ics === null) {
    // Unreachable today (an unknown rule already exited above), but the type
    // makes it explicit that an unwritable calendar is never a silent success.
    console.error('Rule not understood; no calendar written.');
    process.exit(2);
  }
  writeFileSync(icsPath, ics);
  // Report the number of events the calendar actually contains, not a
  // hardcoded guess — buildCalendar's projection may fall short of
  // icsCount if the rule can't fill the requested window.
  const written = projectOccurrences(result.rule, today, icsCount);
  console.log(`Wrote ${written.length} events to ${icsPath}`);
}
