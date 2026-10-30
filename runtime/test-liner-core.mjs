import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../dist/liner-core.js');

const compile = id => L.compileLiner(L.makeLinerSpec({ persona: L.PERSONAS[id] }));

test('all three personas compile valid liners with different patterns', () => {
  const out = ['P1', 'P2', 'P3'].map(compile);
  for (const c of out) assert.equal(c.ok, true, JSON.stringify(c.checks.filter(x => !x.ok)));
  const widths = out.map(c => c.cut_lengths_mm[1]);
  assert.ok(widths[2] > widths[0] && widths[0] > widths[1], `muscular calf widest, P2 narrowest: ${widths}`);
});

test('cut length follows the foam mid-surface: circumference + pi*t + overlap', () => {
  const p = L.PERSONAS.P1, c = compile('P1');
  assert.ok(Math.abs(c.cut_lengths_mm[0] - (p.leg.circ_top_mm + Math.PI * 4 + 30)) < 0.11);
});

test('frustum development: the outline edges really are the designed arc lengths', () => {
  const c = compile('P3');
  const top = c.outline.slice(0, 41);
  let len = 0; for (let i = 1; i < top.length; i++) len += Math.hypot(top[i][0] - top[i - 1][0], top[i][1] - top[i - 1][1]);
  assert.ok(Math.abs(len - c.cut_lengths_mm[0]) < 0.5, `top arc ${len.toFixed(2)} vs ${c.cut_lengths_mm[0]}`);
  assert.ok(Math.abs(c.height_mm - 150) < 3, `slant height ${c.height_mm}`);
});

test('out-of-range legs are refused', () => {
  const bad = { ...L.PERSONAS.P1.leg, circ_mid_mm: 520 };
  assert.equal(L.compileLiner(L.makeLinerSpec({ persona: L.PERSONAS.P1, leg: bad })).ok, false);
  const shortShin = { ...L.PERSONAS.P1.leg, shin_length_mm: 190 };
  assert.equal(L.compileLiner(L.makeLinerSpec({ persona: L.PERSONAS.P1, leg: shortShin })).ok, false);
});

test('mobility plan refuses hands-free for a balance concern and never puts it on stairs', () => {
  const p2 = L.planMobility(L.PERSONAS.P2.intake), p1 = L.planMobility(L.PERSONAS.P1.intake);
  assert.equal(p2.hands_free_recommended, false);
  assert.ok(p2.refusal_reasons.includes('balance concern reported'));
  assert.equal(p1.hands_free_recommended, true);
  for (const p of [p1, p2]) assert.doesNotMatch(p.tasks.find(t => t.task === 'Stairs').aid, /hands-free|scooter/i);
  assert.ok(p1.flags.some(f => /alone/.test(f)));
});

test('calibration from measured overlaps corrects each height', () => {
  const spec = L.makeLinerSpec({ persona: L.PERSONAS.P1 });
  const r = L.calibrateLiner(spec, { ruler_mm: 99, overlap_mm: [42, 30, 18] });
  assert.deepEqual(r.errors_mm, [12, 0, -12]);
  assert.deepEqual(r.calibration.length_add_mm, [-12, 0, 12]);
  const v2 = L.compileLiner(L.makeLinerSpec({ persona: L.PERSONAS.P1, calibration: r.calibration }));
  assert.equal(v2.ok, true);
  const v1 = compile('P1');
  assert.ok(Math.abs(v2.cut_lengths_mm[0] - (v1.cut_lengths_mm[0] - 12)) < 0.11);
});

test('SVG templates tile the full pattern on 1:1 landscape A4 with a ruler', () => {
  const c = compile('P1');
  for (const layer of ['liner', 'crest']) {
    const pages = L.linerPages(c, { title: 'P1', layer });
    if (layer === 'liner') assert.ok(pages.length >= 2);
    for (const svg of pages) {
    assert.match(svg, /width="297mm" height="210mm" viewBox="0 0 297 210"/);
    assert.match(svg, /100 mm calibration ruler/);
    }
  }
  assert.throws(() => L.linerSvg(c), /exceeds page/);
});

test('tile coverage contains every actual outline vertex without scaling at all supported personas', () => {
  for (const id of ['P1', 'P2', 'P3']) {
    const c = compile(id), pages = L.linerPages(c);
    const tiles = pages.map(svg => Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, Number(svg.match(new RegExp(`data-tile-${k}-mm="([^"]+)"`))[1])])));
    for (const [x, y] of c.outline) assert.ok(tiles.some(t => x >= t.x - 1e-7 && x <= t.x + t.width + 1e-7 && y >= t.y - 1e-7 && y <= t.y + t.height + 1e-7));
    for (const svg of pages) assert.doesNotMatch(svg, /scale\(/);
  }
});
