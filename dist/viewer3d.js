// v9 real-time 3D (three.js, vendored in ./vendor, works offline). Hero: the sample leg scan with the
// liner zone as a separate foam part. Design studio: patient selector + sliders feed the existing
// compilers (LinerCore, CompilerCore); the 3D morphs and the check status comes from their checks.
// No pressure colouring: no body-load simulation is computed here (next).
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SKIN = () => new THREE.MeshPhysicalMaterial({ color: 0xd7a58c, roughness: 0.52, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color(0xffd2c0), sheenRoughness: 0.6, clearcoat: 0.08, side: THREE.DoubleSide });
const FOAM = () => new THREE.MeshPhysicalMaterial({ color: 0x2ee6a6, roughness: 0.85, metalness: 0, emissive: 0x0a3d2b, emissiveIntensity: 0.35, side: THREE.DoubleSide });
const EVA = () => new THREE.MeshPhysicalMaterial({ color: 0x24c890, roughness: 0.9, emissive: 0x06281c, emissiveIntensity: 0.3 });
const BASE = () => new THREE.MeshPhysicalMaterial({ color: 0x2b3a44, roughness: 0.9 });

function stage(host, { auto = true, dist = 900, target = [0, 220, 0], interactive = true } = {}) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(r.domElement);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
  const cam = new THREE.PerspectiveCamera(32, 1, 1, 6000); cam.position.set(dist * 0.55, target[1] + dist * 0.22, dist * 0.8);
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-400, 900, 500); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -500, right: 500, top: 700, bottom: -300, near: 10, far: 3000 }); key.shadow.radius = 6; key.shadow.bias = -0.0005;
  const rim = new THREE.DirectionalLight(0x7fffd4, 1.4); rim.position.set(500, 400, -600);
  scene.add(key, rim, new THREE.HemisphereLight(0xdfefff, 0x0a0f12, 0.35));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.ShadowMaterial({ opacity: 0.28 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const ctl = new OrbitControls(cam, r.domElement); ctl.target.set(...target); ctl.enableDamping = true; ctl.dampingFactor = 0.08;
  ctl.autoRotate = auto && !reduce; ctl.autoRotateSpeed = 0.9; ctl.enablePan = false; ctl.minDistance = dist * 0.35; ctl.maxDistance = dist * 1.8; ctl.enabled = interactive;
  if (!interactive) r.domElement.style.pointerEvents = 'none';
  function size() { const w = host.clientWidth || 1, h = host.clientHeight || 1; r.setSize(w, h, false); r.domElement.style.width = '100%'; r.domElement.style.height = '100%'; cam.aspect = w / h; cam.updateProjectionMatrix(); }
  size(); new ResizeObserver(size).observe(host);
  const ticks = [];
  r.setAnimationLoop(() => { ticks.forEach(f => f()); ctl.update(); r.render(scene, cam); });
  ctl.addEventListener('start', () => { ctl.autoRotate = false; });
  return { scene, cam, ctl, ticks, r };
}

// Sample OBJ: rings of 48 vertices, z up (mm). Build an indexed surface from the rings.
function ringsFrom(text) {
  const m = ScanCore.parseOBJ(text), N = 48, n = m.v.length / 3, rings = [];
  for (let j = 0; j * N < n; j++) { const ring = []; for (let i = 0; i < N; i++) { const k = (j * N + i) * 3; ring.push([m.v[k], m.v[k + 1], m.v[k + 2]]); } rings.push(ring); }
  return rings;
}
function surface(rings, j0, j1, grow = 0, scaleAt = () => 1) {
  const N = rings[0].length, pos = [], idx = [];
  for (let j = j0; j <= j1; j++) {
    const ring = rings[j], cx = ring.reduce((a, p) => a + p[0], 0) / N, cy = ring.reduce((a, p) => a + p[1], 0) / N, z = ring[0][2], s = scaleAt(z);
    for (const p of ring) { const dx = (p[0] - cx) * s, dy = (p[1] - cy) * s, rr = Math.hypot(dx, dy) || 1, g = (rr + grow) / rr; pos.push(cx + dx * g, z, -(cy + dy * g)); }
  }
  for (let j = 0; j < j1 - j0; j++) for (let i = 0; i < N; i++) { const a = j * N + i, b = j * N + (i + 1) % N, c = a + N, d = b + N; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function capped(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }

let scanText = null;
const scanP = fetch('samples/sample-leg-scan.obj').then(r => r.ok ? r.text() : Promise.reject(r.status)).then(t => (scanText = t));
const ZONE = [225, 375]; // liner zone (mm along the scan), same as the 2D renderer

// ---------- hero ----------
const heroHost = document.getElementById('hero3d');
if (heroHost) scanP.then(t => {
  const S = stage(heroHost, { dist: 1050, target: [0, 230, 0], interactive: true });
  const rings = ringsFrom(t), zs = rings.map(r => r[0][2]);
  const jz = z => zs.findIndex(v => v >= z);
  const leg = capped(new THREE.Mesh(surface(rings, 0, rings.length - 1), SKIN()));
  const liner = capped(new THREE.Mesh(surface(rings, jz(ZONE[0]), jz(ZONE[1]), 4), FOAM()));
  const grp = new THREE.Group(); grp.add(leg, liner); S.scene.add(grp);
  const cv = document.getElementById('heroCanvas'); if (cv) { cv.dataset.off = '1'; cv.style.display = 'none'; }
  heroHost.classList.add('on');
  // entrance: liner slides on from below
  const t0 = performance.now(); liner.position.y = -120; liner.material.transparent = true; liner.material.opacity = 0;
  S.ticks.push(() => { const k = Math.min(1, (performance.now() - t0) / 1800), e = 1 - Math.pow(1 - k, 3); liner.position.y = -120 * (1 - e); liner.material.opacity = e; if (k === 1) liner.material.transparent = false; });
}).catch(() => {});

// ---------- design studio ----------
const studio = document.getElementById('studio');
if (studio && window.LinerCore && window.CompilerCore) {
  const host = studio.querySelector('.st-3d'), form = studio.querySelector('.st-form'), out = studio.querySelector('.st-status');
  const S = stage(host, { dist: 950, target: [0, 220, 0] });
  const grp = new THREE.Group(); S.scene.add(grp);
  const LC = window.LinerCore, CC = window.CompilerCore;
  const P = {
    A: { title: 'A · Ankle fracture · iWALK calf liner', inputs: [
      ['circ_top_mm', 'Calf girth, top', 240, 500, 326], ['circ_mid_mm', 'Calf girth, middle', 240, 500, 365], ['circ_bottom_mm', 'Calf girth, bottom', 240, 500, 327],
      ['height_mm', 'Liner height', 100, 200, 150], ['foam_thickness_mm', 'Foam thickness', 2, 8, 4]] },
    B: { title: 'B · Forefoot offloading insole (relief under a metatarsal head)', inputs: [
      ['lengthMm', 'Foot length', 170, 330, 252], ['forefootWidthMm', 'Forefoot width', 55, 135, 100], ['heelWidthMm', 'Heel width', 45, 90, 68]] }
  };
  let sc = 'A', vals = {}, target = null, cur = null, t0 = 0;
  const base = { A: null };
  function ui() {
    studio.querySelectorAll('.st-pick button').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === sc));
    form.innerHTML = P[sc].inputs.map(([k, l, a, b, d]) => `<label><span>${l}</span><output id="o_${k}">${vals[k] ?? d} mm</output><input type="range" min="${a}" max="${b}" step="1" value="${vals[k] ?? d}" data-k="${k}" aria-label="${l}"></label>`).join('')
      + `<p class="st-note">${sc === 'A' ? 'Inputs go straight into the liner compiler (LinerCore). Leg shape: the sample scan, scaled to these girths.' : 'Inputs go straight into the insole compiler (CompilerCore). Outline: synthetic foot from these sizes. Relief under a metatarsal head, as used in diabetic foot care; diabetic-foot tuning is next.'} Body mass is not a compiler input yet (next, with body-load simulation).</p>`;
  }
  function read() { vals = {}; form.querySelectorAll('input').forEach(i => { vals[i.dataset.k] = +i.value; form.querySelector('#o_' + i.dataset.k).textContent = i.value + ' mm'; }); }
  function show(checks) {
    const bad = checks.filter(c => !c.ok), nice = s => s.replace(/_/g, ' ').replace(/ mm$/, '');
    out.className = 'st-status ' + (bad.length ? 's-bad' : 's-ok');
    out.innerHTML = bad.length
      ? `<span class="wb-big">!</span><div><b>${bad.length} check${bad.length > 1 ? 's' : ''} failed: design blocked</b><small>${bad.map(c => nice(c.id) + ' · ' + c.detail).join('<br>')}</small></div>`
      : `<span class="wb-big">✓</span><div><b>All engineering checks passed</b><small>${checks.length} of ${checks.length} geometry checks · pressure and movement: next · awaiting clinician approval</small></div>`;
  }
  function buildA() {
    const v = vals, persona = LC.PERSONAS.P1;
    const spec = LC.makeLinerSpec({ persona, leg: { circ_top_mm: v.circ_top_mm, circ_mid_mm: v.circ_mid_mm, circ_bottom_mm: v.circ_bottom_mm, shin_length_mm: 380, knee_width_mm: 98, source: 'sliders' }, options: { height_mm: v.height_mm, foam_thickness_mm: v.foam_thickness_mm } });
    const c = LC.compileLiner(spec); show(c.checks);
    const rings = ringsFrom(scanText), zs = rings.map(r => r[0][2]);
    // per-ring scale: measured sample girths (perimeter) at the three liner levels vs slider girths
    const per = ring => ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
    const mid = (ZONE[0] + ZONE[1]) / 2, half = v.height_mm / 2, lv = [mid + half, mid, mid - half];
    const at = z => rings[Math.max(0, zs.findIndex(x => x >= z))];
    const sTop = v.circ_top_mm / per(at(lv[0])), sMid = v.circ_mid_mm / per(at(lv[1])), sBot = v.circ_bottom_mm / per(at(lv[2]));
    const scaleAt = z => z >= lv[0] ? 1 + (sTop - 1) * Math.max(0, 1 - (z - lv[0]) / 120) : z >= lv[1] ? sMid + (sTop - sMid) * (z - lv[1]) / (lv[0] - lv[1]) : z >= lv[2] ? sBot + (sMid - sBot) * (z - lv[2]) / (lv[1] - lv[2]) : 1 + (sBot - 1) * Math.max(0, 1 - (lv[2] - z) / 120);
    const jz = z => Math.max(0, zs.findIndex(x => x >= z));
    const g = new THREE.Group();
    g.add(capped(new THREE.Mesh(surface(rings, 0, rings.length - 1, 0, scaleAt), SKIN())));
    const lin = capped(new THREE.Mesh(surface(rings, jz(lv[2]), jz(lv[0]), v.foam_thickness_mm, scaleAt), FOAM()));
    if (!c.ok) lin.material.color.set(0xff6b63);
    g.add(lin); return g;
  }
  function buildB() {
    const v = vals, outline = CC.syntheticFoot({ lengthMm: v.lengthMm, forefootWidthMm: v.forefootWidthMm, heelWidthMm: v.heelWidthMm });
    const spec = CC.makeSpec({ scenario: CC.SCENARIOS.A, outline }), c = CC.compile(spec); show(c.checks);
    const g = new THREE.Group(), L = v.lengthMm;
    const shape = pts => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y - L / 2) : s.moveTo(x, y - L / 2)); s.closePath(); return s; };
    let y = 0;
    (c.layers || spec.layers).forEach((layer, i) => {
      const s = shape(layer.outline || outline);
      if (layer.role === 'relief') { const h = new THREE.Path(), [rx, ry] = spec.relief.center_mm; h.absarc(rx, ry - L / 2, spec.relief.radius_mm, 0, Math.PI * 2, true); s.holes.push(h); }
      const geo = new THREE.ExtrudeGeometry(s, { depth: layer.thickness_mm * 3, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 2, curveSegments: 48 });
      const m = capped(new THREE.Mesh(geo, layer.role === 'relief' ? EVA() : BASE())); m.rotation.x = -Math.PI / 2; m.position.y = y; y += layer.thickness_mm * 3 + 0.5; g.add(m);
      if (!c.ok) m.material.color.set(0xff6b63);
    });
    g.scale.setScalar(2.2); g.position.y = 10; return g;
  }
  function rebuild() {
    read(); if (sc === 'A' && !scanText) return;
    const g = sc === 'A' ? buildA() : buildB();
    grp.clear(); grp.add(g); g.scale.multiplyScalar(0.985); t0 = performance.now(); target = g.scale.x / 0.985;
    S.ctl.target.set(0, sc === 'A' ? 220 : 20, 0);
  }
  S.ticks.push(() => { const g = grp.children[0]; if (!g || !target) return; const k = Math.min(1, (performance.now() - t0) / 350); g.scale.setScalar(target * (0.985 + 0.015 * k)); });
  studio.querySelector('.st-pick').addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (!b) return; sc = b.dataset.s; vals = {}; ui(); rebuild();
    S.cam.position.set(...(sc === 'A' ? [520, 420, 760] : [380, 520, 520])); document.dispatchEvent(new CustomEvent('studio:case', { detail: sc })); });
  let raf = 0; form.addEventListener('input', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(rebuild); });
  ui(); scanP.then(rebuild).catch(() => { out.textContent = 'Sample scan could not load (open from a web server).'; });
  window.__studio = { set(k, v) { const i = form.querySelector(`input[data-k="${k}"]`); if (i) { i.value = v; rebuild(); } }, pick(s) { studio.querySelector(`.st-pick button[data-s="${s}"]`).click(); } };
}
