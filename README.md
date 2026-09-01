# Pulizia Strade

Reads Alia's Florence street-cleaning schedule and emits a calendar with
night-before alarms, so the car gets moved before the street is cleaned.

## Usage

    npm install
    npm run check -- "Piazza Taddeo Gaddi" --civico 1
    npm run check -- "Piazza Taddeo Gaddi" --civico 1 --ics pulizia.ics

Import `pulizia.ics` into any calendar app. Events use floating local time, so
they render correctly for a calendar set to Europe/Rome.

Other flags: `--comune X` (default `FIRENZE`), `--tratto "DA X A Y"` to pin a
specific street segment when a street has more than one and the CLI warns
about it.

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
