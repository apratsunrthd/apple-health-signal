# Handoff

## Orient in 2 minutes
- The app is **one file**: `index.html`. CSS sits at the top; one inline `<script>` IIFE holds everything else. Search for these section banners: `state`, `dates`, `Apple Health export.xml`, `Clinical records`, `recompute / merge`, `sample data`, `analysis`, `action directives`, `rendering: sources`, `Clinical Labs`, `Body & Longevity`, `Overview`, `Meals`, `Activity & Training`, `Patterns`, `Sensor Log`, `settings`, `init`.
- Read ARCHITECTURE.md for data flow, and TODO.md for what's next.

## Run
```bash
python3 -m http.server 8000      # open http://localhost:8000
python3 scripts/check-inline-js.py
python3 scripts/run-tests.py     # pins TZ=America/New_York
node scripts/make-sample-export.mjs   # rewrite sample/apple_health_export
```

## Conventions
- ES5-style JS (`var`, `function`, string-built HTML) to match the existing code. No frameworks, no build step.
- Every render function guards its own data and shows an empty state that names the Apple Health source that would unlock it.
- New rules go in `actionDirectives()`. They must cite numbers (a test enforces this) and must stay silent when their data is missing.
- Escape any user or export text with `escapeHtml` before putting it into HTML (food names come from export metadata).
- Fixtures and sample data are fictional. Never commit a real export or real values.

## Gotchas
- Objects created inside the test `vm` context fail `assert.deepEqual` against literals, because the realms differ. Compare `JSON.parse(JSON.stringify(x))` instead (see `plain()` in the tests).
- `export_cda.xml` in the export folder is ignored on purpose. It duplicates `export.xml` as a CDA document.
- The heart-rate series is downsampled once it passes 150k points.
- `weeklyEnergyBalance` ignores days under 500 kcal, treating them as partial logs.
- The sample person's height and goal come from `SAMPLE_PROFILE` and apply only while `state.isDemo` is true.
- `renderOverview` re-runs on window resize.

- **Merging PRs:** don't use GitHub's web or API merge button. It authors the merge commit with the owner's private account email. Fast-forward instead: `git push origin <branch>:main` (GitHub marks the PR merged). Commits must use the repo-local no-reply identity (`git config user.email` is set in this clone).
- Pushing to `main` deploys GitHub Pages automatically.

## Open threads
- None blocking. See TODO.md.
