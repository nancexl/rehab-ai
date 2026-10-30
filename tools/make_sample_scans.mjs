// Writes the SAMPLE scans shipped with the demo. Synthetic geometry, not a person.
// sample-leg-scan.obj: lower-leg surface (mm, z = ankle→knee); sample-leg-rescan.obj: same leg, girths −4 %;
// sample-foot-outline.json: plantar outline (mm) from CompilerCore.syntheticFoot.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CC = require('../dist/compiler-core.js');
const out = process.argv[2] || 'dist/samples';
mkdirSync(out, { recursive: true });
function legObj(scale, label) {
  const N = 48, Z = 85, L = 420, rings = [];
  const girth = z => 230 + 135 * Math.exp(-(((z - 300) / 130) ** 2));
  let s = `# ${label}\n# SAMPLE SCAN: synthetic lower leg, millimetres. Not a real person.\n`;
  for (let j = 0; j <= Z; j++) {
    const z = j / Z * L, g = girth(z) * scale, k = 1.15; // ellipse a = k·b, perimeter ≈ Ramanujan
    const b = g / (Math.PI * (3 * (k + 1) - Math.sqrt((3 * k + 1) * (k + 3)))), a = k * b;
    for (let i = 0; i < N; i++) { const t = i / N * 2 * Math.PI; s += `v ${(a * Math.cos(t)).toFixed(3)} ${(b * Math.sin(t)).toFixed(3)} ${z.toFixed(3)}\n`; }
  }
  for (let j = 0; j < Z; j++) for (let i = 0; i < N; i++) {
    const p = j * N + i + 1, q = j * N + (i + 1) % N + 1;
    s += `f ${p} ${q} ${q + N}\nf ${p} ${q + N} ${p + N}\n`;
  }
  return s;
}
writeFileSync(`${out}/sample-leg-scan.obj`, legObj(1, 'sample-leg-scan v1'));
writeFileSync(`${out}/sample-leg-rescan.obj`, legObj(0.96, 'sample-leg-rescan (girths -4%, synthetic re-measure)'));
const foot = CC.syntheticFoot({ lengthMm: 252, forefootWidthMm: 98, heelWidthMm: 63 });
writeFileSync(`${out}/sample-foot-outline.json`, JSON.stringify({ label: 'SAMPLE SCAN: synthetic right-foot plantar outline (mm). Not a real person.', side: 'right',
  painful_spot_note: 'relief placed by the distal 5th-metatarsal design rule (sample)', outline_mm: foot.map(p => p.map(v => +v.toFixed(2))) }) + '\n');
console.log('wrote sample scans to', out);
