// Landing page contract (v6): short hero, cut- and print-ready wording, 5-step stepper, disclaimer, engineering + lab links, three cases with honest modes and replay data.
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../dist/home.js', import.meta.url), 'utf8');
const text = s => s.replace(/<[^>]+>/g, ' ').replace(/&#8209;/g, '-').replace(/&[#\w]+;/g, ' ').trim();
const h1 = text(html.match(/<h1>(.*?)<\/h1>/s)[1]);
assert.ok(h1.split(/\s+/).length <= 8, 'headline <= 8 words');
assert.match(h1, /Cut- and print-ready/, 'headline says cut- and print-ready, not only print-ready');
const hero = text(html.match(/<header class="bar">.*?<\/section>/s)[0]).split(/\s+/).filter(w => /\w/.test(w));
assert.ok(hero.length <= 25, `first viewport <= 25 words (got ${hero.length})`);
assert.match(html, /Sample scan/);
assert.match(html, /Nobody designs where your body meets the crutch, boot or insole/);
assert.match(html, /Rehab AI turns one phone scan into a clinician-approved, custom-fit contact part for the crutch, boot or insole you already have/);
assert.match(html, /Run demo/);
assert.match(html, /href="\.\/liner\.html">Engineering view/);
for (const f of ['lab.html', 'compiler.html']) {
  const has = existsSync(new URL('../dist/' + f, import.meta.url)), linked = html.includes(`href="./${f}"`);
  if (f === 'lab.html') assert.equal(linked, has, 'lab.html linked iff it ships'); else if (linked) assert.ok(has, f + ' linked but missing');
}
const DISC = 'Design-support prototype, not a medical device; not used on patients. A clinician prescribes and approves every design.';
assert.ok(html.includes(DISC), 'footer disclaimer');
assert.ok(js.includes(DISC), 'disclaimer next to approve');
assert.match(js, /const STEPS = \['Scan', 'Design', 'Check', 'File', 'Approve'\]/);
assert.match(js, /Newton recorded check on a test piece \(14 Oct\)/);
assert.doesNotMatch(html, /four fractures|injuries/i);
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

// v7 'Why it matters': only the sourced stats, each with its citation.
{
  const { readFileSync: rf } = await import('node:fs');
  const page = rf(new URL('../dist/index.html', import.meta.url), 'utf8');
  for (const [stat, cite] of [['67%', 'Ready 2018'], ['17.6%', 'Forni 2009'], ['42.9% → 3.6%', 'J Clin Nurs 2011'], ['43%', 'Yeoh 2021'], ['47.8% to 25.7% when worn', 'Bus 2013; no significant difference overall']]) {
    assert.ok(page.includes(stat), stat); assert.ok(page.includes(cite), cite);
  }
  assert.match(page, /Why not a towel\?/); assert.match(page, /Rehab AI does all four/);
  console.log('why-it-matters tests passed');
}
