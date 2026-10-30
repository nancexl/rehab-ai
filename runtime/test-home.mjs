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
