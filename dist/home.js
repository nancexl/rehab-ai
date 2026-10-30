// Landing v6: hero 3D sample scan; 5-step stepper (Scan · Design · Check · File · Approve) driving the saved case replays.
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- hero: rotating sample leg scan (the real sample OBJ file) ----------
  const cv = $('#heroCanvas'), ctx = cv.getContext('2d');
  const DPR = Math.min(2, devicePixelRatio || 1);
  function size() { const r = cv.getBoundingClientRect(); cv.width = r.width * DPR; cv.height = r.height * DPR; }
  size(); addEventListener('resize', size);
  // v7 renderer: shaded surface (filled quads, smooth normals, key + rim light, back-face cull, depth sort,
  // end cap, ground shadow). Same sample OBJ as before; only the drawing changed.
  let rings = null, norms = null, loadMsg = 'Loading sample scan…'; const zone = [225, 375];
  fetch('samples/sample-leg-scan.obj').then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(t => {
    const m = ScanCore.parseOBJ(t), N = 48, n = m.v.length / 3; rings = [];
    for (let j = 0; j * N < n; j++) { const ring = []; for (let i = 0; i < N; i++) { const k = (j * N + i) * 3; ring.push([m.v[k], m.v[k + 1], m.v[k + 2]]); } rings.push(ring); }
    // smooth per-vertex normals: radial direction in the ring plane + slope of the radius along z
    norms = rings.map((ring, j) => {
      const cx = ring.reduce((a, p) => a + p[0], 0) / N, cy = ring.reduce((a, p) => a + p[1], 0) / N;
      const up = rings[Math.min(rings.length - 1, j + 1)], dn = rings[Math.max(0, j - 1)];
      return ring.map((p, i) => {
        const dx = p[0] - cx, dy = p[1] - cy, r = Math.hypot(dx, dy) || 1;
        const dr = Math.hypot(up[i][0] - cx, up[i][1] - cy) - Math.hypot(dn[i][0] - cx, dn[i][1] - cy), dz = (up[i][2] - dn[i][2]) || 1;
        const nz = -dr / dz, L = Math.hypot(1, nz); return [dx / r / L, dy / r / L, nz / L];
      });
    });
    if (reduce) draw(0.6, 1);
  }).catch(() => { loadMsg = 'Sample scan could not load. Open via a local web server.'; draw(0, 1); });
  const KEY = (() => { const v = [-0.55, -0.6, 0.58], l = Math.hypot(...v); return v.map(x => x / l); })();
  const CLAY = [222, 213, 203], GREEN = [11, 138, 104];
  function draw(yaw, sweep) {
    const W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
    if (!rings) { ctx.fillStyle = '#5d6b75'; ctx.font = `${13 * DPR}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillText(loadMsg, W / 2, H / 2); return; }
    const s = H / 470, cx = W / 2, base = H * 0.93, c = Math.cos(yaw), si = Math.sin(yaw), tilt = 0.28;
    const R = ([x, y, z]) => [x * c - y * si, x * si + y * c, z];
    const P = ([x, y, z]) => { const xr = x * c - y * si, yr = x * si + y * c; return [cx + xr * s, base - z * s + yr * s * tilt, yr]; };
    const zTop = 420 * sweep;
    // ground shadow
    const g = ctx.createRadialGradient(cx, base + 4 * DPR, 2, cx, base + 4 * DPR, 95 * s);
    g.addColorStop(0, 'rgba(14,20,24,.22)'); g.addColorStop(1, 'rgba(14,20,24,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, base + 4 * DPR, 95 * s, 22 * s, 0, 0, 7); ctx.fill();
    const quads = [], N = rings[0].length;
    let last = 0;
    for (let j = 0; j + 1 < rings.length; j++) {
      if (rings[j + 1][2] > zTop) break; last = j + 1;
      const r0 = rings[j], r1 = rings[j + 1], n0 = norms[j], n1 = norms[j + 1], z = (r0[0][2] + r1[0][2]) / 2, inZone = z >= zone[0] && z <= zone[1];
      for (let i = 0; i < N; i++) {
        const i2 = (i + 1) % N, nm = R([(n0[i][0] + n0[i2][0] + n1[i][0] + n1[i2][0]) / 4, (n0[i][1] + n0[i2][1] + n1[i][1] + n1[i2][1]) / 4, (n0[i][2] + n1[i][2]) / 2]);
        if (nm[1] > 0.12) continue; // faces away from the viewer
        const pts = [P(r0[i]), P(r0[i2]), P(r1[i2]), P(r1[i])];
        const diff = Math.max(0, nm[0] * KEY[0] + nm[1] * KEY[1] + nm[2] * KEY[2]), rim = Math.pow(1 - Math.min(1, Math.abs(nm[1])), 2.2) * 0.28;
        const k = 0.38 + 0.62 * diff, base3 = inZone ? CLAY.map((v, q) => v * 0.4 + GREEN[q] * 0.6) : CLAY;
        const col = base3.map(v => Math.min(255, Math.round(v * k + 255 * rim)));
        quads.push([(pts[0][2] + pts[2][2]) / 2, pts, `rgb(${col})`]);
      }
    }
    quads.sort((a, b) => b[0] - a[0]);
    ctx.lineWidth = 0.7 * DPR; ctx.lineJoin = 'round';
    for (const [, p, col] of quads) {
      ctx.fillStyle = ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[2][0], p[2][1]); ctx.lineTo(p[3][0], p[3][1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // measurement slices in the liner zone (front half only, faint)
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = DPR;
    for (let j = 0; j <= last; j += 3) {
      const ring = rings[j], z = ring[0][2]; if (z < zone[0] || z > zone[1]) continue;
      ctx.beginPath(); let on = false;
      for (let i = 0; i <= N; i++) { const p = P(ring[i % N]); if (p[2] < 0) { on ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); on = true; } else on = false; }
      ctx.stroke();
    }
    // top end cap so the surface never looks hollow
    if (last > 0) {
      const ring = rings[last]; ctx.beginPath(); ring.forEach((v, i) => { const p = P(v); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath();
      const zc = ring[0][2], inZ = zc >= zone[0] && zc <= zone[1];
      ctx.fillStyle = inZ ? 'rgb(120,183,163)' : 'rgb(236,230,223)'; ctx.fill(); ctx.strokeStyle = 'rgba(14,20,24,.12)'; ctx.stroke();
    }
    if (sweep < 1) { const y = base - zTop * s; ctx.fillStyle = 'rgba(11,138,104,.9)'; ctx.fillRect(cx - 120 * s, y - 1.5 * DPR, 240 * s, 3 * DPR); }
  }
  if (!reduce) {
    const t0 = performance.now();
    (function loop(t) { const el = (t - t0) / 1000, cyc = el % 9; draw(el * 0.6, Math.min(1, cyc / 2.2)); requestAnimationFrame(loop); })(t0);
  }

  // ---------- 'Why it matters' count-ups (values are the sourced text; animation only) ----------
  const statEls = document.querySelectorAll('.stats b[data-to]');
  if (statEls.length && !reduce && 'IntersectionObserver' in window) {
    const so = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return; so.unobserve(e.target);
      const el = e.target, to = +el.dataset.to, dec = +(el.dataset.dec || 0), suf = el.dataset.suf || '', t0 = performance.now();
      (function f(t) { const k = Math.min(1, (t - t0) / 900), v = to * (1 - Math.pow(1 - k, 3)); el.textContent = (k < 1 ? v.toFixed(dec) : el.dataset.to) + suf; if (k < 1) requestAnimationFrame(f); })(t0);
    }), { threshold: 0.6 });
    statEls.forEach(el => so.observe(el));
  }

  // ---------- stepper + one card per step ----------
  const STEPS = ['Scan', 'Design', 'Check', 'File', 'Approve'];
  const SHORT = { case1: 'Crutch liner', case2: 'Insole', case3: 'Test piece' };
  // One key number per card; every value is copied from cases/cases.json for that case.
  const CARD = {
    case1: [
      ['5/5', 'scan quality checks', 'Sample leg scan · synthetic'],
      ['12', 'AI-stated numbers, all traced to code', 'Nemotron 3 Super · Nebius Token Factory · live'],
      ['10/10', 'geometry checks pass', 'Physics: NVIDIA Newton recorded check on a test piece (14 Oct), not this part'],
      ['5', 'A4 tiles, 1:1 cut pattern (SVG)', 'Cut-ready, by code'],
    ],
    case2: [
      ['252 × 100 mm', 'foot outline', 'Sample foot outline · synthetic'],
      ['14×16 mm', 'forefoot relief window', 'Rule-based code · AI not used'],
      ['6/6', 'geometry checks pass', 'No physics run for this part'],
      ['2', 'layer patterns, 1:1 SVG (A4)', 'Cut-ready, by code'],
    ],
    case3: [
      ['520 mm', 'synthetic geometry study', 'Sample input · not a scan, not a limb'],
      ['388', 'triangles in the test piece', 'Shape by code · AI not used'],
      ['27', 'NVIDIA Newton contacts', 'Recorded check on a test piece, 14 Oct · not live'],
      ['STL', 'print-ready mesh', 'Only the test piece exports STL'],
    ],
  };
  let CASES = [], cur = 0, timers = [], played = false;
  const SP = Math.max(1, +new URLSearchParams(location.search).get('speed') || 1);

  $('#stepper').innerHTML = STEPS.map((s, k) => `<li><button class="step" type="button" data-k="${k}"><span class="n">${k + 1}</span>${s}<i></i></button></li>`).join('');

  function renderCards() {
    const c = CASES[cur], d = CARD[c.id];
    $('#cards').innerHTML = STEPS.map((s, k) => k < 4
      ? `<article class="card" data-k="${k}"><span class="lbl">${k + 1} · ${s}</span><span class="num">${esc(d[k][0])}</span><p class="what">${esc(d[k][1])}</p><span class="mode">${esc(d[k][2])}</span></article>`
      : `<article class="card approve" data-k="4"><span class="lbl">5 · Approve</span><span class="num">Clinician</span><p class="what">${esc(c.status[0].toUpperCase() + c.status.slice(1))}. The AI can only draft.</p><a href="./liner.html?view=tech">Open approval gate</a><p class="disc">Design-support prototype, not a medical device; not used on patients. A clinician prescribes and approves every design.</p></article>`).join('');
    document.querySelectorAll('.seg button').forEach((b, i) => b.setAttribute('aria-selected', i === cur));
  }
  function mark(k) {
    document.querySelectorAll('.step').forEach((b, i) => { b.classList.toggle('on', i === k); b.classList.toggle('done', i < k); b.setAttribute('aria-current', i === k ? 'step' : 'false'); });
    document.querySelectorAll('.card').forEach((el, i) => { el.classList.toggle('on', i === k); el.classList.toggle('done', i < k); });
  }
  function showLog(k, animate) {
    const s = CASES[cur].replay[k], stage = $('#stage');
    $('#logStep').textContent = `· ${STEPS[k]} (${s.mode})`;
    stage.innerHTML = '';
    s.rows.forEach(([kind, label, text], r) => {
      const add = () => { const el = document.createElement('div'); el.className = 'row' + (kind === 'bad' ? ' bad' : ''); el.innerHTML = `<span class="k">${esc(label === 'Print-ready' && cur < 2 ? 'Cut-ready' : label)}</span><span>${esc(text)}</span>`; stage.appendChild(el); };
      animate ? timers.push(setTimeout(add, r * (300 / SP))) : add();
    });
  }
  function go(k) { timers.forEach(clearTimeout); timers = []; mark(k); showLog(k, false); }
  function replay(i, scroll) {
    if (i != null && CASES[i]) { cur = i; renderCards(); }
    timers.forEach(clearTimeout); timers = []; played = true;
    const STEP_MS = reduce ? 0 : 2000 / SP;
    if (scroll !== false) $('#how').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    mark(-1);
    for (let k = 0; k < 5; k++) timers.push(setTimeout(() => { mark(k); showLog(k, !reduce); }, 500 / SP + k * STEP_MS));
  }

  fetch('cases/cases.json').then(r => r.json()).then(data => {
    CASES = data.cases;
    $('#seg').innerHTML = CASES.map((c, i) => `<button type="button" role="tab" data-i="${i}">${esc(SHORT[c.id] || c.title)}</button>`).join('');
    document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { cur = +b.dataset.i; renderCards(); replay(null, false); }));
    renderCards(); go(0);
    $('#hashes').innerHTML = CASES.map(c => `<li>${esc(SHORT[c.id])} record <b>${c.record_sha256.slice(0, 12)}</b></li>`).join('');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => { if (es[0].isIntersecting && !played) { played = true; replay(null, false); io.disconnect(); } }, { threshold: 0.45 });
      io.observe($('#stepper'));
    }
  });
  $('#stepper').addEventListener('click', e => { const b = e.target.closest('.step'); if (b && CASES.length) go(+b.dataset.k); });
  $('#playBtn').addEventListener('click', () => CASES.length && replay());
  $('#runBtn').addEventListener('click', () => { if (CASES.length) replay(0); else $('#how').scrollIntoView(); });
  window.__home = { replay };
})();
