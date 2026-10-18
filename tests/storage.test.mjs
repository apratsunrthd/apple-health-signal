import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppInstance } from './harness.mjs';

const plain = v => JSON.parse(JSON.stringify(v));

test('defaults carry no personal profile and no pre-logged events', async () => {
  const { app } = await createAppInstance();
  const s = app.state.settings;
  assert.equal(s.heightInches, null);
  assert.equal(s.currentWeightLb, null);
  assert.equal(s.targetWeightLb, null);
  assert.deepEqual(plain(s.caffeine), []);
  assert.deepEqual(plain(app.state.manualEvents), []);
});

test('settings and manual events persist under the app keys', async () => {
  const { app, localStorage } = await createAppInstance();
  app.state.settings.targetWeightLb = 160;
  app.saveSettings();
  app.state.manualEvents.push({ t: 1, label: 'Headache' });
  app.saveManualEvents();
  assert.equal(JSON.parse(localStorage.getItem('apple-health-signal-settings')).targetWeightLb, 160);
  assert.equal(JSON.parse(localStorage.getItem('apple-health-signal-events'))[0].label, 'Headache');
});

test('IndexedDB cache roundtrips and restore rebuilds sources including energy', async () => {
  const { app } = await createAppInstance();
  const payload = {
    health: { fileName: 'export.xml', glucoseParsed: [{ t: 1, v: 100 }], energyParsed: [{ day: '2026-01-01', active: 400, basal: 1700 }], weightParsed: [{ t: 1, v: 25 }, { t: 2, v: 170 }] },
    clinicalLabs: [{ t: 1, dateStr: '2026-01-01', name: 'HDL Cholesterol', value: 50 }]
  };
  await app.writeIndexedCache(payload);
  const back = await app.readIndexedCache();
  assert.equal(back.health.fileName, 'export.xml');
  assert.equal(app.restoreLocalCache(back), true);
  const h = app.state.sources.health;
  assert.equal(h.energyParsed.length, 1);
  assert.deepEqual(plain(h.weightParsed.map(w => w.v)), [170], 'BMI-range values are dropped from weight');
  assert.equal(app.state.isDemo, false);
  await app.removeIndexedCache();
  assert.equal(await app.readIndexedCache(), null);
});

test('sample data is never written to the upload cache', async () => {
  const { app } = await createAppInstance();
  app.genSampleData();
  assert.equal(app.state.isDemo, true);
  assert.deepEqual(plain(app.buildLocalCachePayload()), {});
});

test('legacy localStorage uploads migrate to IndexedDB', async () => {
  const legacy = { health: { fileName: 'export.xml', glucoseParsed: [{ t: 1, v: 95 }, { t: 2, v: 110 }] } };
  const { app, localStorage } = await createAppInstance({ initialLocalStorage: { 'apple-health-signal-data': JSON.stringify(legacy) } });
  assert.equal(await app.loadLocalCache(), true);
  assert.equal(app.state.sources.health.count, 2);
  assert.equal((await app.readIndexedCache()).health.fileName, 'export.xml');
  assert.equal(localStorage.getItem('apple-health-signal-data'), null);
});

test('loadLocalCache falls back gracefully when storage is unavailable', async () => {
  const { app } = await createAppInstance({ disableIndexedDB: true });
  assert.equal(await app.loadLocalCache(), false);
});
