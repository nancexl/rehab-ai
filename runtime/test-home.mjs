// Landing page contract: short hero, disclaimer, engineering link, three cases with honest modes and replay data.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const h1 = html.match(/<h1>(.*?)<\/h1>/s)[1].replace(/<[^>]+>|&[#\w]+;/g, ' ').trim().split(/\s+/);
assert.ok(h1.length <= 8, 'headline <= 8 words');
assert.match(html, /Run the pipeline/);
assert.match(html, /href="\.\/liner\.html">Engineering view/);
assert.match(html, /Design demo\. Not a medical device\. Not for wearing on a person; not load-bearing\./);
assert.doesNotMatch(html, /four fractures/i);
const { cases } = JSON.parse(readFileSync(new URL('../dist/cases/cases.json', import.meta.url), 'utf8'));
assert.equal(cases.length, 3);
for (const c of cases) { assert.equal(c.replay.length, 5); assert.match(c.record_sha256, /^[0-9a-f]{64}$/); }
assert.equal(cases[0].modes.design, 'live Nemotron');
assert.match(cases[1].modes.design, /agent not used/);
assert.match(cases[2].modes.check, /recorded 14 Oct/);
assert.ok(!/nemotron/i.test(JSON.stringify(cases[1].replay)), 'case 2 must not claim the agent');
console.log('home page tests passed');
