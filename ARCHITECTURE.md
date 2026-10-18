# Architecture

Apple Health Signal is one static file, `index.html`: markup, CSS, and a single inline script wrapped in an IIFE. There is no backend, build step, or runtime dependency. Everything below runs in the visitor's browser.

## Data flow

```
export.xml ──stream──> processAppleHealth ─┐
clinical-records/*.json ─> processClinicalRecordsBatch ─┤
genSampleData (fictional person) ─────────┘
                    │  state.sources.{health,records}.*Parsed
                    ▼
               recompute()  merge, sort, dedupe → state.glucose / events / weight / energy / …
                    │
        ┌───────────┼──────────────────────────┐
   analytics      rules engine            IndexedDB cache
 (computeKPIs,   actionDirectives()     (saveLocalCache /
  bodyComposition…, weeklyEnergyBalance)  loadLocalCache)
        └───────────┬──────────────────────────┘
                    ▼
     render*() → eight tab sections (innerHTML strings)
```

## Components

**Parsers**
- `processAppleHealth(file)` streams `export.xml` through `TextDecoder`, splits it into lines, and matches each `<Record>` / `<Workout>` line with regexes, so a multi-GB export never sits in memory as a DOM. Handled types: blood glucose (mmol/L → mg/dL), heart rate (downsampled past 150k points), resting HR, HRV, VO2 max, body mass (kg → lb, kept apart from BMI), BMI, body fat (fraction → %), lean mass, sleep (asleep stages only), workouts (near-duplicates within 10 min collapse), dietary energy/protein/carbs/fat/fiber, and active/basal energy.
- Dietary records: food apps write one record per nutrient per entry, so records with the same `startDate` merge into one meal. `HKFoodType` / `HKFoodMeal` metadata lines name the meal.
- Energy: active and basal samples are summed per day **per source app**, and the largest source is kept, because iPhone and Watch both write active energy.
- `processClinicalRecordsBatch(files)` reads FHIR JSON (Observation, Bundle, or arrays) from Apple Health's `clinical-records/` folder; `classifyLabPanel` assigns panels and `clinicalLabSummary` derives lipid ratios and history.

**State and storage**
- `state.sources.health` and `state.sources.records` hold the parsed arrays (`PARSED_FIELDS`). `recompute()` merges them into the flat `state.*` series that every analytic reads.
- Uploads persist in IndexedDB (`apple-health-signal-cache`); there is a migration from the older localStorage key `apple-health-signal-data`. Settings and manual notes live in localStorage. Sample data is never cached.
- `profile()` returns the settings, plus a height and goal for the sample person while `state.isDemo` is true.

**Analytics** (pure functions over `state`)
- Glucose: `computeKPIs`, `findGaps`, `glucoseDistribution`, `lowEpisodes`, `dawnPhenomenon`, `mealResponses`, `exerciseImpacts`, `fastingAnalytics`, `glycemicHealthProfile`.
- Body: `bodyCompositionAnalytics` (the roadmap holds lean mass constant; VO2 max at goal = current × weight / goal weight), `weightTrend` (8-week linear slope), `proteinTarget` (1 g/lb lean mass, else 0.7 g/lb body weight).
- Energy: `weeklyEnergyBalance` splits logged days into weekdays and weekends, compares intake with measured burn (falling back to weight × 14 when burn covers less than 60% of days), and sets the predicted lb/week against the scale slope.
- "Recent" windows anchor on `latestDataT()`, the newest timestamp in the data, not on today, so an old export still analyzes its final weeks.

**Rules engine**: `actionDirectives()` runs a fixed list of rules. Each rule checks that its inputs exist, then calls `add(bucket, priority, area, title, desc)` with text that quotes the person's own numbers. The output is sorted by priority and split into `start` / `stop` / `cont`. The Overview shows the top 3 per column (`directiveMatrixHtml(dir, 3)`); Health Intelligence shows all of them. To add a rule, add a block inside `actionDirectives` and a test in `tests/findings.test.mjs`.

**Rendering**: each tab has a `render*()` function that builds an HTML string and checks its own data, showing an empty state that says which Apple Health data unlocks it. Shared helpers: `kpiTile`, `findingCard`, `energyWaterfallHtml`, `findingHead`, `chip`.

## Key decisions

- **Single file, no build**: anyone can audit, fork, or open it offline. The tests extract the inline script and run it in a `vm` context with a small DOM and IndexedDB mock (`tests/harness.mjs`).
- **Apple Health only**: CGMs, smart scales, food apps, and Health Records all sync into Apple Health, so one export covers them all. Third-party CSV importers were removed.
- **Rules, not a model**: directives are deterministic and explainable, and every claim cites the number behind it. They are framed as prompts, not medical advice.
- **Coarse reference bands**: VO2 max categories are general adult bands, because age and sex are not always in the export.

## Tests

`tests/parsers.test.mjs` (Apple Health + FHIR fixtures), `tests/storage.test.mjs`, `tests/findings.test.mjs` (rules, energy, body, rendering with sample, partial, and empty data), and `tests/sample-export.test.mjs` (the generated sample export round-trips through the real parsers). Fixtures are fictional.
