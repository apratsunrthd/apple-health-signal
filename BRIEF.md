# Brief

## What it is
A public, privacy-first web app that turns anyone's Apple Health export into findings and a Start / Stop / Continue action list. It began as a generalized fork of a private single-user dashboard. All personal data, narrative, and non-Apple importers were removed, and the hardcoded insights were rebuilt as data-driven rules.

## Current state (2026-10-18)
- **Works:** streaming `export.xml` parser (smoke-tested on a real 3.6 GB export: about 19 s with no errors), FHIR `clinical-records/` labs, dietary and energy parsing, a fictional sample person, 8 tabs, the rules engine, IndexedDB persistence, and a sample export generator. 21 tests pass in CI.
- **Visibility:** public since 2026-10-18 and hosted on GitHub Pages at https://apratsunrthd.github.io/apple-health-signal/ (deploys from `main`, root).
- **No external services:** no API keys, LLM calls, or backend. The only network request is Google Fonts.
- **License:** PolyForm Noncommercial 1.0.0; commercial use needs a paid license (COMMERCIAL.md).

## Key decisions
- Apple Health is the only input; every other source arrives through it (CGM, scale, food apps, Health Records).
- Directives are transparent rules that only fire when their data exists, and every one quotes the user's numbers.
- No personal defaults: height, goal, and caffeine are empty; the default eating window is 07:00–21:00.
- "Recent" windows anchor on the newest data point, not on today.
- Energy balance uses measured active and basal burn; per-day, per-source max avoids iPhone + Watch double counting.

## What's next
See TODO.md. The main items are GitHub Pages hosting after going public, metric units, age/sex-adjusted VO2 bands from the export's `<Me>` element, and zip upload.
