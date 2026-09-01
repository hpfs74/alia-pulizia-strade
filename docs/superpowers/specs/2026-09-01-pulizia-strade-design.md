# Pulizia Strade — Design

**Date:** 2026-09-01
**Status:** Approved (mechanism section); remaining sections to be refined

## Problem

Alia publishes Florence street-cleaning schedules at
`https://www2.aliaserviziambientali.it/puliziastrade/`. A car or bike left on a
street during its cleaning window is removed and fined. The site must be checked
manually, so the failure mode is simply forgetting.

Goal: an Alexa skill that proactively warns the night before, and lets the user
acknowledge ("I moved the car") by voice. Useful to any Florence resident, not
just the author.

## Verified facts

Everything below was confirmed empirically against the live site on 2026-09-01,
not assumed.

### Alia endpoints

Four POST endpoints. No auth, no cookies, no CSRF token. Plain `curl` works.

| Endpoint | Input | Output |
|---|---|---|
| `main/get_indirizzi` | `comune` | JSON: streets with `id_strada`, `nome`, `tipo_strada` (1560 for FIRENZE) |
| `main/get_tratti` | `id_strada` | JSON: street segments, or `null` |
| `pulizie/calcola_data` | `id_strada`, `tipo_strada`, `comune`, `trattostrada`, `civico` | HTML-in-JSON: next date, time window, **recurrence rule** |
| `pulizie/calcola_data_all` | `datatratti` (DD/MM/YYYY), `comune` | HTML-in-JSON: every street cleaned in the comune that date |

`calcola_data_all` is the key to multi-user scale: **one request per comune per
day serves all users**, regardless of how many.

### The "dispari" trap

`PIAZZA TADDEO GADDI` returns:

```
Ogni Martedi dispari del mese dalle 00.00 alle 06.00
```

"Martedì dispari" has two plausible readings:

- **A** — odd *occurrence*: 1st, 3rd, 5th Tuesday of the month
- **B** — odd *day-of-month*: Tuesdays whose date is odd

September 2026 cannot distinguish them (both yield 1, 15, 29). October can.
Probed via `calcola_data_all`:

```
01/09 PRESENT   15/09 PRESENT     (odd dates)
06/10 absent    20/10 absent      (even dates)
13/10 PRESENT   27/10 PRESENT     (odd dates)
03/11 PRESENT   17/11 PRESENT     (odd dates)
10/11 absent    24/11 absent      (even dates)
```

**Reading B is correct.** Reading A would have alerted on Oct 6 and 20 — nights
the car was safe — and stayed silent on Oct 13 and 27, when it was not.

Consequence: the interval between cleanings oscillates between 7 and 14 days
across month boundaries (Oct 27 → Nov 3 are consecutive Tuesdays). No fixed
weekly or monthly period reproduces this.

### Alexa platform constraints

- **Reminders cannot be created out-of-session.** Creation requires the
  in-session `apiAccessToken`. Out-of-session tokens may only read, update, and
  delete reminders the skill previously created. A nightly job can therefore
  never spontaneously create a reminder.
- **RRULE support is real**: `FREQ`, `BYDAY`, `BYMONTHDAY`, `BYHOUR`,
  `BYMINUTE`, `BYSECOND`, `INTERVAL`. `FREQ` ∈ {DAILY, WEEKLY, MONTHLY, YEARLY}.
- Permissions: `alexa::alerts:reminders:skill:readwrite` in the manifest, plus
  spoken per-reminder consent.
- Limit ~500 reminders per user — irrelevant at one per street.
- Custom skills remain open for submission; `it-IT` is a supported Alexa locale.
  The platform is churning (Automotive skills removed 2026-08-07, skill quality
  coach removed 2026-04-28), so budget for maintenance.

### Open question (must be resolved before build)

Alia's rule maps to:

```
FREQ=MONTHLY;BYDAY=TU;BYMONTHDAY=1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31
```

Under RFC 5545 this is the *intersection* — Tuesdays that also fall on an odd
date. Amazon documents which RRULE fields it accepts, **not** its intersection
semantics. Whether Alexa intersects, unions, or drops a field must be verified
empirically on a real device before anything depends on it.

Two further unverified points, both cheap to settle in the dev console:

- `it-IT` reminders availability is documented only as "all Alexa locales" — no
  explicit per-locale matrix was found.
- Whether a `COMPLETED` reminder can be rescheduled out-of-session (relevant
  only to the fallback below).

## Design

### Alerting mechanism

1. **Setup (in-session).** User enrolls a street by voice. Skill requests
   reminder permission, fetches the Alia rule, converts it to an RRULE, and
   creates one recurring reminder — the only moment creation is permitted.
2. **Maintenance (out-of-session).** A nightly job sweeps `calcola_data_all` per
   comune and updates or deletes affected reminders when an ordinance changes or
   expires. Both operations are permitted out-of-session.
3. **Acknowledge / snooze.** When the reminder fires and the user replies, that
   is an active session, so a one-off snooze reminder may legally be created
   there.

### Two sources, deliberately

`calcola_data` supplies the rule used for scheduling. `calcola_data_all`
supplies per-date ground truth. The nightly job compares RRULE projection
against the city list; disagreement means the parse is wrong and the user is
alerted conservatively. This check is what would have caught the reading-A error
automatically.

### Failure direction

**Every ambiguity resolves toward over-alerting.** A spurious warning costs a
walk; a missed one costs the fine the product exists to prevent.

Fallback if the RRULE intersection test fails: a plain weekly Tuesday reminder
whose text the nightly job rewrites — noisy on even Tuesdays, never silent on
odd ones.

### Data layer

- `AliaClient` wrapping the three endpoints.
- Parser: Italian rule text → `CleaningRule` (weekday, parity, time window).
  `parity` means **odd/even day-of-month**, per the finding above — never odd/even
  occurrence-within-month. This distinction is the single most dangerous
  ambiguity in the domain and must never be reintroduced.
- **First implementation task: grammar harvest.** Sweep all 1560 Firenze streets
  once, throttled, and cluster distinct rule phrasings. Two samples already
  yielded two grammars ("Il 1º Mercoledi del mese", "Ogni Martedi dispari del
  mese"); the full corpus defines the parser's real target instead of guesswork.
- Handle: active rule, expired ordinance ("L'ordinanza per questo tratto di
  strada è scaduta"), no ordinance, transport error.
- `tipo_strada`: `ASM` requires a civic number (the site disables lookup without
  one); `EXQ` does not. Multi-segment streets return a `tratti` list.
- Known-answer fixtures, starting with Piazza Taddeo Gaddi and the dates above.

### Runtime

Node/TypeScript throughout — ASK SDK v2 is native, and one language avoids two
codebases. Lambda for the skill, DynamoDB for user → street → `alertToken`,
EventBridge nightly cron for the sweep. Phase-1 calendar output reuses the same
core and emits `.ics`.

### Multi-user, privacy, liability

- Load on Alia is one request per comune per day regardless of user count.
  Identify via User-Agent; cache aggressively.
- A home street is personal data under GDPR. Privacy policy (required for
  certification anyway, since permissions are requested), minimal retention, and
  a "dimentica la mia via" deletion intent.
- Voice copy carries a disclaimer at setup and an "I'm not sure — check the
  official site" fallback whenever sources disagree.
- Approach Alia for an official feed. A public skill people trust with fines
  should not rest permanently on undocumented endpoints.

## Phasing

- **Phase 1a** — data layer + `.ics` calendar output. Protects the author
  immediately; no AWS or Echo needed.
- **Phase 1b** — dev-mode skill on the author's own Echo. Resolves the RRULE
  intersection question on real hardware.
- **Phase 2** — multi-user backend, nightly sweep, certification, publication.

## Out of scope

Comuni other than Firenze at launch (the client is comune-generic, but only
Firenze is validated). Non-Alexa voice platforms. Automated fine appeals.
