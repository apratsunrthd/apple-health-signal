import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppInstance } from './harness.mjs';

const RENDERERS = ['renderOverview', 'renderFindings', 'renderLabs', 'renderBody', 'renderMeals', 'renderActivity', 'renderPatterns', 'renderSensor', 'renderSources'];

function titles(list) { return list.map(d => d.title); }

test('sample person exercises every data stream', async () => {
  const { app } = await createAppInstance();
  app.genSampleData();
  const s = app.state;
  assert.ok(s.glucose.length > 3000, 'two weeks of 5-minute CGM');
  assert.ok(s.events.filter(e => e.type === 'meal').length > 150);
  assert.ok(s.events.filter(e => e.type === 'exercise').length > 30);
  assert.ok(s.energy.length >= 50);
  assert.ok(s.weight.length > 30 && s.vo2Max.length > 5 && s.sleep.length > 50);
  assert.ok(s.clinicalLabs.length > 10);
});

test('directives are data-driven: each column fires and quotes the numbers', async () => {
  const { app } = await createAppInstance();
  app.genSampleData();
  const dir = app.actionDirectives();
  assert.ok(dir.start.length && dir.stop.length && dir.cont.length, 'all three columns have items');
  const start = titles(dir.start).join(' | ');
  assert.match(start, /daily protein floor/);
  assert.match(start, /Two strength sessions/);
  assert.match(start, /7-hour sleep/);
  assert.match(start, /triglyceride\/HDL/);
  assert.match(start, /longer than 90 minutes/);
  assert.match(titles(dir.stop).join(' | '), /weekends undo the week/);
  assert.match(titles(dir.cont).join(' | '), /aerobic base/);
  dir.all.forEach(d => assert.match(d.desc, /\d/, 'every directive cites a number: ' + d.title));
  for (let i = 1; i < dir.start.length; i++) assert.ok(dir.start[i - 1].priority >= dir.start[i].priority);
});

test('rules stay silent without their data', async () => {
  const { app } = await createAppInstance();
  app.genSampleData();
  const h = app.state.sources.health;
  h.glucoseParsed = []; h.eventsParsed = h.eventsParsed.filter(e => e.type !== 'meal');
  app.state.clinicalLabs = []; app.state.sources.records.labsParsed = [];
  app.recompute();
  const areas = new Set(app.actionDirectives().all.map(d => d.area));
  assert.ok(!areas.has('Glucose') && !areas.has('Nutrition') && !areas.has('Labs') && !areas.has('Energy'));
  assert.ok(areas.has('Training'));
});

test('energy balance uses measured Apple Health burn and compares with the scale', async () => {
  const { app } = await createAppInstance();
  app.genSampleData();
  const eb = app.weeklyEnergyBalance();
  assert.equal(eb.measuredBurn, true);
  assert.ok(eb.weekendAvgIn - eb.weekdayAvgIn > 400);
  assert.ok(eb.weekdayDelta < 0 && eb.weekendDelta > 0);
  assert.equal(eb.net, eb.weekdayDelta + eb.weekendDelta);
  assert.ok(eb.actualLbPerWeek < 0, 'sample person is slowly losing weight');
});

test('body analytics: roadmap only with a goal, protein target from lean mass', async () => {
  const { app } = await createAppInstance();
  app.genSampleData();
  const b = app.bodyCompositionAnalytics();
  assert.equal(b.roadmap, true, 'sample profile supplies a goal');
  assert.ok(Math.abs(b.curWeight - b.curLbm - b.curFatMass) < 0.2);
  assert.ok(b.projectedVo2 > b.curVo2);
  assert.equal(app.proteinTarget().grams, Math.round(b.curLbm));

  const { app: empty } = await createAppInstance();
  empty.genSampleData();
  empty.state.isDemo = false;
  const b2 = empty.bodyCompositionAnalytics();
  assert.equal(b2.roadmap, false, 'no goal set means no roadmap for real uploads');
  assert.equal(b2.projectedVo2, null);
});

test('every view renders for the sample, for partial data, and for nothing at all', async () => {
  const { app, getOrCreate } = await createAppInstance();
  app.genSampleData();
  RENDERERS.forEach(fn => assert.doesNotThrow(() => app[fn](), fn + ' (sample)'));
  const overview = getOrCreate('tab-overview').innerHTML;
  assert.match(overview, /Start, Stop, Continue/);
  assert.match(overview, /Finding 5/);

  // Workouts only: a Watch user with no CGM, scale, food log, or labs
  const h = app.state.sources.health;
  ['glucoseParsed', 'weightParsed', 'bodyFatParsed', 'leanMassParsed', 'bmiParsed', 'energyParsed'].forEach(f => { h[f] = []; });
  h.eventsParsed = h.eventsParsed.filter(e => e.type === 'exercise');
  app.state.clinicalLabs = []; app.state.sources.records.labsParsed = [];
  app.state.isDemo = false;
  app.recompute();
  RENDERERS.forEach(fn => assert.doesNotThrow(() => app[fn](), fn + ' (workouts only)'));
  assert.doesNotMatch(getOrCreate('tab-overview').innerHTML, /Weekly calorie balance/);

  // Nothing loaded
  ['eventsParsed', 'heartRateParsed', 'vo2MaxParsed', 'restingHrParsed', 'hrvParsed', 'sleepParsed'].forEach(f => { h[f] = []; });
  app.recompute();
  RENDERERS.forEach(fn => assert.doesNotThrow(() => app[fn](), fn + ' (empty)'));
  assert.match(getOrCreate('tab-overview').innerHTML, /Upload your Apple Health/);
});

test('glucose analytics on the sample: KPIs, gaps, lows, meal responses', async () => {
  const { app } = await createAppInstance();
  app.genSampleData();
  const k = app.computeKPIs();
  assert.ok(k.timeInRange > 80 && k.timeInRange < 100);
  assert.ok(app.findGaps().some(g => g.duration >= 3 * 3600000 - 10 * 60000), 'the 3-hour sensor dropout is detected');
  assert.ok(app.lowEpisodeSummary().overnight.length >= 1);
  assert.ok(app.mealResponses().filter(r => !r.noData).length > 20);
  const p = app.glycemicHealthProfile();
  assert.ok(!Number.isNaN(p.tbr) && !Number.isNaN(p.tar), 'time below/above range are real numbers');
});
