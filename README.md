# Pulizia Strade

Reads Alia's Florence street-cleaning schedule and emits a calendar with
night-before alarms, so the car gets moved before the street is cleaned.

## Usage

    npm install
    npm run check -- "Piazza Taddeo Gaddi"
    npm run check -- "Piazza Taddeo Gaddi" --ics pulizia.ics

Import `pulizia.ics` into any calendar app. Events use floating local time, so
they render correctly for a calendar set to Europe/Rome.

Other flags: `--comune X` (default `FIRENZE`), `--tratto "DA X A Y"` to pin a
specific street segment when a street has more than one and the CLI warns
about it, and `--civico N` for a civic number.

`--civico` does nothing in Florence: all 1,560 of its streets are
`tipo_strada: EXQ`, and Alia ignores the civic number for those. The flag
exists for comuni with `ASM` streets, which do need one.

## Why the cross-check exists

Alia writes rules like `Ogni Martedi dispari del mese`. "Dispari" means the
**date** is odd, not the occurrence — so October 2026 is the 13th and 27th, not
the 6th and 20th. Getting this backwards alerts on the wrong nights entirely.

So before writing anything, `check` samples up to six dates in the next six
weeks — some it predicts are cleaned, some it predicts are clear — and asks
Alia's own per-date city listing about each one. Both directions are sampled
on purpose: checking only the date Alia already named proves nothing, since
that date is in the listing by construction. This is a sample, not a proof:
dates outside it are not verified. If any sampled date disagrees, `check`
prints the mismatch, withholds the calendar, and exits 3 — a rule we have
misread must never become alarms someone trusts.

See `docs/superpowers/specs/2026-09-01-pulizia-strade-design.md`.

## Development

    npm test
    npm run typecheck
    npm run harvest   # refresh data/rule-corpus.json (~10 min, live requests)
