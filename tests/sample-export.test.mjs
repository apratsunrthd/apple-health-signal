import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAppInstance } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('generated sample export round-trips through the real upload parsers', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ahs-sample-'));
  execFileSync('node', [path.join(ROOT, 'scripts', 'make-sample-export.mjs'), out]);

  const { app: ref } = await createAppInstance();
  ref.genSampleData();
  const expected = ref.state.sources.health;

  const { app } = await createAppInstance();
  const xml = fs.readFileSync(path.join(out, 'export.xml'), 'utf-8');
  app.processAppleHealth({ name: 'export.xml', text: async () => xml });
  await new Promise(r => setTimeout(r, 100));
  const h = app.state.sources.health;
  assert.equal(h.glucoseParsed.length, expected.glucoseParsed.length);
  assert.equal(h.weightParsed.length, expected.weightParsed.length);
  assert.equal(h.energyParsed.length, expected.energyParsed.length);
  const meals = h.eventsParsed.filter(e => e.type === 'meal');
  assert.equal(meals.length, expected.eventsParsed.filter(e => e.type === 'meal').length);
  assert.ok(meals.every(m => !/entry$/.test(m.label)), 'food names come through HKFoodType metadata');

  const dir = path.join(out, 'clinical-records');
  const files = fs.readdirSync(dir).map(name => ({ name, text: async () => fs.readFileSync(path.join(dir, name), 'utf-8') }));
  assert.equal(await app.processClinicalRecordsBatch(files), ref.state.clinicalLabs.length);
  assert.equal(app.clinicalLabSummary().trigHdlRatio, ref.clinicalLabSummary().trigHdlRatio);
  fs.rmSync(out, { recursive: true, force: true });
});
