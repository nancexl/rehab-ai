// Landing page contract (v8): platform hero, scenarios A and B, today-vs-next note, 5-step stepper, disclaimer, engineering + lab links, three cases with honest modes and replay data.
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../dist/home.js', import.meta.url), 'utf8');
const text = s => s.replace(/<[^>]+>/g, ' ').replace(/&#8209;/g, '-').replace(/&[#\w]+;/g, ' ').trim();
const h1 = text(html.match(/<h1>(.*?)<\/h1>/s)[1]);
assert.ok(h1.split(/\s+/).length <= 8, 'headline <= 8 words');
assert.match(h1, /Fit the device to the person/, 'platform headline');
assert.doesNotMatch(html, /print-ready/i, 'landing must not call liner/insole print-ready');
const hero = text(html.match(/<header class="bar">.*?<\/section>/s)[0]).split(/\s+/).filter(w => /\w/.test(w));
assert.ok(hero.length <= 25, `first viewport <= 25 words (got ${hero.length})`);
assert.match(html, /Sample scan/);
assert.match(html, /Rehab AI is a platform that models the person with their device/);
assert.match(html, /id="todayNext"/, 'today-vs-next note');
assert.match(html, /Next, not built yet:<\/b> movement capture from patient video, and body \+ device load simulation/);
for (const s of ['2 · Capture movement', '3 · Simulate body + device']) { const li = html.slice(html.indexOf(s), html.indexOf('</li>', html.indexOf(s))); assert.match(li, /class="t next"/, s + ' labelled next'); }
assert.match(js, /A · Ankle fracture: iWALK liner/); assert.match(js, /B · Forefoot offloading insole/); assert.ok(!/Diabetic foot: insole/.test(js));
assert.match(html, /Run the demo/); assert.match(html, /href="\?demo=1"/);
assert.match(html, /href="\.\/liner\.html">Engineering view/);
// v9: one headline stat per scenario on the surface; everything else inside the collapsed Evidence panel.
{ const ev = html.indexOf('<details class="evidence"'); assert.ok(ev > 0, 'evidence panel'); const surface = html.slice(0, ev); assert.ok(!surface.includes('Ready 2018') && !surface.includes('Kerr 2019'), 'secondary stats live in Evidence'); assert.match(surface, /37%/); assert.match(surface, /40%/); }
for (const f of ['lab.html', 'compiler.html']) {
  const has = existsSync(new URL('../dist/' + f, import.meta.url)), linked = html.includes(`href="./${f}"`);
  if (f === 'lab.html') assert.equal(linked, has, 'lab.html linked iff it ships'); else if (linked) assert.ok(has, f + ' linked but missing');
}
const DISC = 'Design-support prototype, not a medical device; not used on patients. A clinician prescribes and approves every design.';
assert.ok(html.includes(DISC), 'footer disclaimer');
assert.ok(js.includes(DISC), 'disclaimer next to approve');
assert.match(js, /const STEPS = \['Scan', 'Design', 'Check', 'File', 'Approve'\]/);
assert.match(js, /Newton recorded check on a test piece \(14 Oct\)/);
assert.doesNotMatch(html, /four fractures/i);
const { cases } = JSON.parse(readFileSync(new URL('../dist/cases/cases.json', import.meta.url), 'utf8'));
assert.equal(cases.length, 3);
for (const c of cases) { assert.equal(c.replay.length, 5); assert.match(c.record_sha256, /^[0-9a-f]{64}$/); }
assert.equal(cases[0].modes.design, 'live Nemotron');
assert.match(cases[1].modes.design, /agent not used/);
assert.match(cases[2].modes.check, /recorded 14 Oct/);
assert.ok(!/nemotron/i.test(JSON.stringify(cases[1].replay)), 'case 2 must not claim the agent');
console.log('home page tests passed');

// v7 judge demo mode: offline data generated from recorded evidence; honest labels.
{
  const { readFileSync: rf } = await import('node:fs');
  const u = p => new URL('../dist/' + p, import.meta.url);
  const page = rf(u('index.html'), 'utf8'), djs = rf(u('demo.js'), 'utf8'), dd = rf(u('demo-data.js'), 'utf8');
  assert.match(page, /id="demoBtn"/); assert.match(page, /demo-data\.js/); assert.match(page, /id="runBtn"/);
  assert.match(djs, /demo'\) === '1'/);
  assert.match(djs, /Recorded live run/); assert.match(djs, /test piece only, not live/); assert.match(djs, /Any edit revokes approval/);
  assert.match(djs, /not a medical device/);
  assert.doesNotMatch(djs, /fetch\(/, 'demo must not need the network');
  const D = JSON.parse(dd.slice(dd.indexOf('{'), dd.lastIndexOf('}') + 1));
  const v1 = JSON.parse(rf(new URL('../evidence/live/pipeline-case1-liner/agent-v1.json', import.meta.url), 'utf8'));
  assert.equal(D.run.timestamp, v1.timestamp); assert.equal(D.outcome.spec_sha256, v1.outcome.spec_sha256);
  assert.equal(D.trace.length, v1.trace.length); assert.equal(D.checks.length, 10);
  assert.equal(D.newton.recorded, '2026-10-14');
  console.log('demo mode tests passed');
}

// v8 'Why it matters': scenario A and B stats, each with its citation.
{
  const { readFileSync: rf } = await import('node:fs');
  const page = rf(new URL('../dist/index.html', import.meta.url), 'utf8');
  for (const [stat, cite] of [['107–132', 'Court-Brown 1998'], ['67%', 'Ready 2018'], ['37%', 'Walsh 2023'], ['£837–962m', 'Kerr 2019'], ['40% → 65%', 'Armstrong 2017'], ['30.5%', 'Armstrong 2020'], ['HR 7.6', 'Otte 2015'], ['25.7% vs 47.8%', 'Bus 2013; no significant difference overall']]) {
    assert.ok(page.includes(stat), stat); assert.ok(page.includes(cite), cite);
  }
  assert.match(page, /A · Ankle fracture/); assert.match(page, /B · Diabetic foot ulcer, incl\. dialysis/);
  console.log('why-it-matters tests passed');
}

// v8 engineering workbench: three views, 9-step tracker, honest test report, hand-off with traceability.
{
  const { readFileSync: rf } = await import('node:fs');
  const page = rf(new URL('../dist/index.html', import.meta.url), 'utf8'), wb = rf(new URL('../dist/workbench.js', import.meta.url), 'utf8');
  assert.match(page, /id="workbench"/); assert.match(page, /workbench\.js/);
  for (const v of ['patient', 'clinician', 'manufacturer']) assert.ok(page.includes(`data-v="${v}"`), v);
  assert.match(wb, /\['Scan', 'Body model', 'Movement', 'Simulate', 'Design', 'Engineering tests', 'Clinician approve', 'Files', 'Follow-up \/ re-scan'\]/);
  const W = (() => { const window = {}; const document = { querySelector: () => null, addEventListener() {} }; new Function('window', 'document', wb)(window, document); return window.__workbench.W; })();
  for (const [id, c] of Object.entries(W)) {
    assert.equal(c.track.length, 9, id + ' track');
    for (const t of c.tests) assert.ok(['pass', 'warn', 'fail', 'next'].includes(t[0]), id + ' status');
    for (const t of c.tests.filter(t => t[0] === 'next')) assert.equal(t[2], 'not computed', 'next rows carry no numbers');
    assert.ok(c.tests.some(t => t[0] === 'next'), id + ' shows what is next');
  }
  assert.equal(W.case1.track[2][0], 'next', 'movement capture is next'); assert.equal(W.case2.track[2][0], 'next');
  assert.equal(W.case1.tests.filter(t => t[0] === 'pass').length >= 5, true);
  assert.match(W.case1.tests.find(t => t[0] === 'warn')[2], /355 \/ 393 \/ 357/);
  assert.match(W.case1.tests.find(t => t[0] === 'fail')[2], /620 mm/);
  assert.match(wb, /not approved yet/); assert.match(wb, /Patients never see an approve button/);
  assert.ok(!/print-ready/i.test(wb));
  console.log('workbench tests passed');
}

// v9 workbench status: honest summary, never 'all passed' when a row warns or fails.
{
  const { readFileSync: rf } = await import('node:fs');
  const wb = rf(new URL('../dist/workbench.js', import.meta.url), 'utf8');
  assert.match(wb, /All engineering checks passed/); assert.match(wb, /if \(!warn && !fail\)/);
  console.log('v9 status tests passed');
}
