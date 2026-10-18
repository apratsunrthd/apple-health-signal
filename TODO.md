# TODO

## For Claude / other models
- [ ] Read `<Me>` (date of birth, biological sex) from export.xml and use age/sex-adjusted VO2 max and body-fat bands.
- [ ] Metric units toggle (kg, mmol/L) in Profile & Goals.
- [ ] Accept `export.zip` directly (stream-unzip in the browser, e.g. with DecompressionStream plus a small zip reader).
- [ ] Steps and stand hours: parse `StepCount` and add a daily-movement rule.
- [ ] Blood pressure (`BloodPressureSystolic` / `Diastolic`) parsing and a rule.
- [ ] Show a progress bar while a large export is parsing (the status line updates every ~25 MB today).
- [ ] Add a print / share-as-image view of the Start / Stop / Continue card.

## For a human
- [ ] Review the repo, then make it public (`gh repo edit apratsunrthd/apple-health-signal --visibility public --accept-visibility-change-consequences`).
- [ ] After it's public: enable GitHub Pages (Settings → Pages → deploy from `main`, root) for a zero-install hosted link.
- [ ] Decide commercial license pricing and a contact channel; update COMMERCIAL.md if it should be email instead of GitHub issues.
- [ ] Optional: have a lawyer confirm PolyForm Noncommercial fits the monetization plan.
