import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../dist/scan-core.js');

// Synthetic lower leg: 360 mm long (ankle z=0 → knee z=360), elliptical sections, max calf girth at z=260.
const ell = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));   // Ramanujan perimeter
function radii(z) {
  const g = 230 + 140 * Math.exp(-(((z - 260) / 95) ** 2));     // target girth profile, mm
  const k = 1.25;                                                 // a/b aspect ratio of the calf section
  const b = g / ell(k, 1); return [k * b, b];
}
function legMesh({ gapFaces = false, metres = true, tilt = 0.35 } = {}) {
  const N = 96, M = 73, v = [], f = [], s = metres ? 0.001 : 1;
  for (let j = 0; j < M; j++) {
    const z = j * 5, [a, b] = radii(z);
    for (let i = 0; i < N; i++) {
      const t = 2 * Math.PI * i / N, x = a * Math.cos(t), y = b * Math.sin(t);
      // tilt the whole leg about the x axis so the axis isn't aligned with z
      const yy = y * Math.cos(tilt) - z * Math.sin(tilt), zz = y * Math.sin(tilt) + z * Math.cos(tilt);
      v.push((x + 40) * s, (yy - 15) * s, (zz + 900) * s);
    }
  }
  for (let j = 0; j < M - 1; j++) for (let i = 0; i < N; i++) {
    if (gapFaces && i < 6 && j > 20) continue;                     // a hole down one side
    const a = j * N + i, b = j * N + (i + 1) % N, c = (j + 1) * N + i, d = (j + 1) * N + (i + 1) % N;
    f.push(a, b, d, a, d, c);
  }
  return { v, f };
}
const toOBJ = m => m.v.reduce((s, _, i) => i % 3 ? s : s + `v ${m.v[i]} ${m.v[i + 1]} ${m.v[i + 2]}\n`, '') +
  Array.from({ length: m.f.length / 3 }, (_, i) => `f ${m.f[3 * i] + 1} ${m.f[3 * i + 1] + 1} ${m.f[3 * i + 2] + 1}`).join('\n');
function toBinarySTL(m) {
  const n = m.f.length / 3, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf); dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) dv.setFloat32(84 + t * 50 + 12 + k * 12 + c * 4, m.v[3 * m.f[3 * t + k] + c], true);
  return buf;
}
function toBinaryPLY(m) {
  const nv = m.v.length / 3, nf = m.f.length / 3;
  const head = `ply\nformat binary_little_endian 1.0\nelement vertex ${nv}\nproperty float x\nproperty float y\nproperty float z\nelement face ${nf}\nproperty list uchar int vertex_indices\nend_header\n`;
  const hb = new TextEncoder().encode(head), buf = new ArrayBuffer(hb.length + nv * 12 + nf * 13), dv = new DataView(buf);
  new Uint8Array(buf).set(hb); let o = hb.length;
  for (let i = 0; i < nv * 3; i++, o += 4) dv.setFloat32(o, m.v[i], true);
  for (let t = 0; t < nf; t++) { dv.setUint8(o, 3); o += 1; for (let k = 0; k < 3; k++, o += 4) dv.setInt32(o, m.f[3 * t + k], true); }
  return buf;
}
const enc = s => new TextEncoder().encode(s).buffer;
const truth = z => { const [a, b] = radii(z); return ell(a, b); };

test('OBJ in metres, tilted: girths at the three liner heights match within 1.5%', () => {
  const r = S.measureLeg(S.parseScan('leg.obj', enc(toOBJ(legMesh()))));
  assert.equal(r.ok, true, JSON.stringify(r.quality.filter(q => !q.ok)));
  assert.equal(r.unit_scale, 1000);
  // levels: 75 mm above max (toward knee), max, 75 mm below
  const expect = [truth(335), truth(260), truth(185)];
  r.circ_mm.forEach((g, i) => assert.ok(Math.abs(g - expect[i]) / expect[i] < 0.015, `level ${i}: ${g} vs ${expect[i].toFixed(1)}`));
  assert.ok(r.circ_mm[1] > r.circ_mm[0] && r.circ_mm[1] > r.circ_mm[2]);
});

test('binary STL and binary PLY give the same result as OBJ', () => {
  const m = legMesh(), a = S.measureLeg(S.parseScan('leg.obj', enc(toOBJ(m))));
  for (const [name, buf] of [['leg.stl', toBinarySTL(m)], ['leg.ply', toBinaryPLY(m)]]) {
    const b = S.measureLeg(S.parseScan(name, buf));
    b.circ_mm.forEach((g, i) => assert.ok(Math.abs(g - a.circ_mm[i]) < 0.5, `${name} level ${i}: ${g} vs ${a.circ_mm[i]}`));
  }
});

test('a scan with a hole fails the quality check instead of producing numbers silently', () => {
  const r = S.measureLeg(S.parseScan('leg.obj', enc(toOBJ(legMesh({ gapFaces: true })))));
  assert.equal(r.ok, false);
  assert.ok(r.quality.some(q => q.id === 'cross_sections_closed' && !q.ok));
});

test('unsupported formats and point clouds are refused with a clear message', () => {
  assert.throws(() => S.parseScan('leg.usdz', new ArrayBuffer(10)), /Unsupported/);
  assert.throws(() => S.parseScan('pts.obj', enc('v 0 0 0\nv 1 0 0\nv 0 1 0\n')), /no triangles/);
});
