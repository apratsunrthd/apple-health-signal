import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppInstance } from './harness.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const xml = fs.readFileSync(path.join(FIXTURES, 'apple-health-sample.xml'), 'utf-8');
const fhir = fs.readFileSync(path.join(FIXTURES, 'fhir-sample.json'), 'utf-8');
// Objects from the app's vm context have a different prototype; compare as plain JSON.
const plain = v => JSON.parse(JSON.stringify(v));
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));

async function loadExport(app) {
  app.processAppleHealth({ name: 'export.xml', text: async () => xml });
  await tick();
  return app.state.sources.health;
}

test('Apple Health parser extracts biometrics with unit conversions', async () => {
  const { app } = await createAppInstance();
  const h = await loadExport(app);

  assert.ok(h.glucoseParsed.find(r => r.v === 99), '5.5 mmol/L converts to ~99 mg/dL');
  assert.equal(h.glucoseParsed.length, 3);
  assert.ok(h.weightParsed.find(w => Math.abs(w.v - 167.6) < 0.2), '76 kg converts to ~167.6 lb');
  assert.ok(h.weightParsed.every(w => w.v >= 50), 'BMI never leaks into weight');
  assert.equal(h.bmiParsed[0].v, 25.6);
  assert.equal(h.bodyFatParsed[0].v, 22.1, 'fractional body fat becomes a percentage');
  assert.equal(h.leanMassParsed[0].v, 131, '59.4 kg lean mass converts to lb');
  assert.equal(h.vo2MaxParsed[0].v, 36.8);
  assert.equal(h.restingHrParsed[0].v, 63);
  assert.equal(h.hrvParsed[0].v, 37.4);
  assert.equal(h.sleepParsed.length, 1, 'only asleep segments count, not in-bed');
  assert.equal(h.sleepParsed[0].minutes, 420);
  assert.equal(app.state.isDemo, false);
});

test('Apple Health parser dedupes near-identical workouts and keeps history before CGM', async () => {
  const { app } = await createAppInstance();
  const h = await loadExport(app);
  const workouts = h.eventsParsed.filter(e => e.type === 'exercise');
  assert.equal(workouts.length, 2, 'two runs 2 minutes apart collapse into one; January strength session kept');
  assert.ok(workouts.find(w => w.label === 'Running' && w.durationMin === 40));
  assert.ok(workouts.find(w => w.label === 'TraditionalStrengthTraining'));
});

test('dietary records group into meals with metadata labels and kJ conversion', async () => {
  const { app } = await createAppInstance();
  const h = await loadExport(app);
  const meals = h.eventsParsed.filter(e => e.type === 'meal');
  assert.equal(meals.length, 2);
  const lunch = meals.find(m => m.label === 'Lunch');
  assert.ok(lunch, 'HKFoodMeal metadata names the meal');
  assert.deepEqual(plain([lunch.calories, lunch.protein, lunch.carbs, lunch.fat, lunch.netCarbs]), [540, 31, 52, 21, 45]);
  const dinner = meals.find(m => m.label === 'Food Log entry');
  assert.equal(dinner.calories, 700, '2929 kJ converts to kcal');
});

test('active energy keeps the larger source per day instead of double-counting', async () => {
  const { app } = await createAppInstance();
  const h = await loadExport(app);
  assert.deepEqual(plain(h.energyParsed), [{ day: '2026-03-15', active: 550, basal: 1650 }]);
  assert.equal(app.state.energy.length, 1);
});

test('FHIR clinical records parse into labs and drive the lipid summary', async () => {
  const { app } = await createAppInstance();
  const n = await app.processClinicalRecordsBatch([{ name: 'Observation-1.json', text: async () => fhir }, { name: 'notes.txt', text: async () => 'x' }]);
  assert.equal(n, 4, 'four Observations parsed; Patient resource and non-JSON files ignored');
  const sum = app.clinicalLabSummary();
  assert.equal(sum.trig, 168);
  assert.equal(sum.hdl, 42);
  assert.equal(sum.trigHdlRatio, 4);
  assert.equal(sum.trigHdlStatus, 'crit');
  assert.equal(sum.fastingGluc, 104);
  assert.equal(app.state.sources.records.labsParsed.length, 4);
  assert.equal(app.state.clinicalLabs.find(l => /glucose/i.test(l.name)).status, 'high');
});

test('dropping the export folder routes export.xml and clinical JSON, ignoring export_cda.xml', async () => {
  const { app } = await createAppInstance();
  let cdaRead = false;
  app.handleDroppedFiles([
    { name: 'export_cda.xml', text: async () => { cdaRead = true; return '<ClinicalDocument/>'; } },
    { name: 'export.xml', text: async () => xml },
    { name: 'Observation-1.json', text: async () => fhir }
  ]);
  await tick(60);
  assert.equal(cdaRead, false);
  assert.equal(app.state.sources.health.glucoseParsed.length, 3);
  assert.equal(app.state.clinicalLabs.length, 4);
});

test('parseDateFlexible handles ISO and slash formats', async () => {
  const { app } = await createAppInstance();
  assert.ok(!isNaN(app.parseDateFlexible('2026-03-15T08:30:00Z')));
  assert.equal(new Date(app.parseDateFlexible('3/15/2026 8:30 PM')).getHours(), 20);
  assert.ok(isNaN(app.parseDateFlexible('')));
});
