// Landing page: hero 3D sample scan, pipeline strip, three case cards with step-by-step replay of saved traces.
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- pipeline strip ----------
  const STEPS = [
    ['📱', 'Phone scan → 3D', 'a specialist scanner and technician'],
    ['🧠', 'AI designs it', '30–60+ min manual rectification'],
    ['🧪', 'Simulate first (NVIDIA Newton)', 'remakes of 3–17%'],
    ['🖨️', 'Print-ready file', '1–4 week builds; ~7-week NHS waits'],
    ['🩺', 'Clinician approves', 'drafting by scarce staff (~1,250 UK P&Os)'],
    ['🔁', 'Fit → re-scan → v2', 'Every fit improves the next design', true],
  ];
  $('#strip').innerHTML = STEPS.map(([ic, t, p, loop]) => `<li${loop ? ' class="loopstep"' : ''}><span class="ic" aria-hidden="true">${ic}</span><b>${t}</b><span class="pain">${p}</span></li>`).join('');

  // ---------- hero: rotating sample leg scan (the real sample OBJ file) ----------
  const cv = $('#heroCanvas'), ctx = cv.getContext('2d');
  const DPR = Math.min(2, devicePixelRatio || 1);
  function size() { const r = cv.getBoundingClientRect(); cv.width = r.width * DPR; cv.height = r.height * DPR; }
  size(); addEventListener('resize', size);
  let rings = null, zone = [225, 375];
  fetch('samples/sample-leg-scan.obj').then(r => r.text()).then(t => {
    const m = ScanCore.parseOBJ(t), N = 48, n = m.v.length / 3; rings = [];
    for (let j = 0; j * N < n; j++) { const ring = []; for (let i = 0; i < N; i++) { const k = (j * N + i) * 3; ring.push([m.v[k], m.v[k + 1], m.v[k + 2]]); } rings.push(ring); }
    if (reduce) draw(0.6, 1);
  }).catch(() => {});
  const stageEl = $('#heroStage'), LABELS = ['3D model', 'liner zone', 'pattern'];
  function draw(yaw, sweep) {
    const W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
    if (!rings) return;
    const s = H / 470, cx = W / 2, base = H * 0.93, c = Math.cos(yaw), si = Math.sin(yaw), tilt = 0.28;
    const P = ([x, y, z]) => { const xr = x * c - y * si, yr = x * si + y * c; return [cx + xr * s, base - z * s + yr * s * tilt, yr]; };
    const zTop = 420 * sweep;
    rings.forEach((ring, j) => {
      const z = ring[0][2]; if (z > zTop) return;
      const inZone = z >= zone[0] && z <= zone[1];
      if (!inZone && j % 3) return;
      for (let i = 0; i < ring.length; i++) {
        const a = P(ring[i]), b = P(ring[(i + 1) % ring.length]), front = (a[2] + b[2]) / 2 < 0;
        ctx.strokeStyle = inZone ? (front ? 'rgba(94,242,200,.95)' : 'rgba(94,242,200,.25)') : (front ? 'rgba(220,235,240,.55)' : 'rgba(220,235,240,.12)');
        ctx.lineWidth = (inZone ? 2.2 : 1.2) * DPR;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    });
    for (let i = 0; i < 48; i += 4) { // meridians
      ctx.beginPath(); let first = true;
      rings.forEach((ring, j) => { if (ring[0][2] > zTop || j % 2) return; const p = P(ring[i]); first ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); first = false; });
      ctx.strokeStyle = 'rgba(220,235,240,.18)'; ctx.lineWidth = DPR; ctx.stroke();
    }
    if (sweep < 1) { const y = base - zTop * s; ctx.fillStyle = 'rgba(255,180,84,.9)'; ctx.fillRect(cx - 120 * s, y - 1.5 * DPR, 240 * s, 3 * DPR); }
  }
  if (!reduce) {
    const t0 = performance.now();
    (function loop(t) {
      const el = (t - t0) / 1000, cyc = el % 9, sweep = Math.min(1, cyc / 2.2);
      draw(el * 0.6, sweep);
      const lab = cyc < 2.2 ? 'scanning' : cyc < 5 ? 'liner zone' : 'design ready';
      if (stageEl.textContent !== lab) stageEl.textContent = lab;
      requestAnimationFrame(loop);
    })(t0);
  }

  // ---------- thumbnails ----------
  const pathOf = (pts, fx, fy) => 'M' + pts.map(p => `${fx(p).toFixed(1)} ${fy(p).toFixed(1)}`).join('L');
  function fit(pts, w, h, pad = 8) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), k = Math.min((w - 2 * pad) / (x1 - x0 || 1), (h - 2 * pad) / (y1 - y0 || 1));
    const ox = (w - (x1 - x0) * k) / 2, oy = (h - (y1 - y0) * k) / 2;
    return { fx: p => ox + (p[0] - x0) * k, fy: p => h - (oy + (p[1] - y0) * k), k };
  }
  const svg = inner => `<svg viewBox="0 0 160 110" aria-hidden="true">${inner}</svg>`;
  function thumbs(c) {
    if (c.id === 'case1') {
      const half = c.profile.map(p => [-p.z, p.girth_mm / (2 * Math.PI)]), prof = half.concat(half.slice().reverse().map(([z, r]) => [z, -r])), f = fit(prof, 160, 110);
      const pat = c.pattern_outline, g = fit(pat.map(p => [p[0], -p[1]]), 160, 110);
      return [svg(`<path d="${pathOf(prof, f.fx, f.fy)}Z" fill="rgba(230,238,240,.08)" stroke="#e6eef0" stroke-width="1.5"/>`),
        svg(`<path d="${pathOf(pat.map(p => [p[0], -p[1]]), g.fx, g.fy)}Z" fill="rgba(94,242,200,.15)" stroke="#5ef2c8" stroke-width="2"/>`)];
    }
    if (c.id === 'case2') {
      const pts = c.outline.map(p => [p[1], -p[0]]), f = fit(pts, 160, 110), r = c.relief;
      return [svg(`<path d="${pathOf(pts, f.fx, f.fy)}Z" fill="none" stroke="#e6eef0" stroke-width="2"/>`),
        svg(`<path d="${pathOf(pts, f.fx, f.fy)}Z" fill="rgba(94,242,200,.15)" stroke="#5ef2c8" stroke-width="2"/><ellipse cx="${f.fx([r.cy, -r.cx]).toFixed(1)}" cy="${f.fy([r.cy, -r.cx]).toFixed(1)}" rx="${(r.ry * f.k).toFixed(1)}" ry="${(r.rx * f.k).toFixed(1)}" fill="#ffb454" opacity=".85"/>`)];
    }
    const tri = c.edges.map(t => t.map(p => [p[0] * 0.9 + p[2] * 0.5, p[1] + p[2] * 0.35])), f = fit(tri.flat(), 160, 110);
    const d = tri.map(t => pathOf(t, f.fx, f.fy) + 'Z').join('');
    return [svg(`<g fill="none" stroke="#e6eef0" stroke-width=".6" opacity=".8"><rect x="30" y="20" width="100" height="70" rx="8"/><path d="M30 55h100M80 20v70"/></g><text x="80" y="104" fill="#9fb0ba" font-size="10" text-anchor="middle">synthetic study</text>`),
      svg(`<path d="${d}" fill="none" stroke="#5ef2c8" stroke-width=".5"/>`)];
  }

  // ---------- cards + replay ----------
  let CASES = [], timers = [];
  fetch('cases/cases.json').then(r => r.json()).then(data => {
    CASES = data.cases;
    $('#cards').innerHTML = CASES.map((c, i) => {
      const [a, b] = thumbs(c);
      return `<button class="card" type="button" data-i="${i}" aria-label="Replay case ${i + 1}: ${esc(c.title)}">
        <span class="mode">Case ${i + 1} · design <b>${esc(c.modes.design)}</b></span>
        <h3>${esc(c.title)}</h3>
        <div class="io"><div><small>Input</small>${a}<small>${esc(c.input)}</small></div><div><small>Output</small>${b}<small>${esc(c.output)}</small></div></div>
        <dl>${c.numbers.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <span class="state">${esc(c.status)}</span>
        <span class="go">Replay the run →</span></button>`;
    }).join('');
    $('#hashes').innerHTML = CASES.map((c, i) => `<li>Case ${i + 1} record <b>${c.record_sha256.slice(0, 12)}</b></li>`).join('');
    document.querySelectorAll('.card').forEach(el => el.addEventListener('click', () => replay(+el.dataset.i)));
  });
  function replay(i) {
    const c = CASES[i]; if (!c) return;
    timers.forEach(clearTimeout); timers = [];
    const box = $('#replay'); box.hidden = false;
    $('#replayTitle').textContent = `Case ${i + 1} · ${c.title}`;
    $('#progress').innerHTML = c.replay.map(s => `<li><i></i>${esc(s.step)}<br><small>${esc(s.mode)}</small></li>`).join('');
    const stage = $('#stage'); stage.innerHTML = '';
    box.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    const lis = [...document.querySelectorAll('#progress li')];
    const SP = Math.max(1, +new URLSearchParams(location.search).get('speed') || 1), STEP_MS = reduce ? 0 : 1700 / SP, ROW_MS = reduce ? 0 : 380 / SP;
    let t = 300;
    c.replay.forEach((s, k) => {
      timers.push(setTimeout(() => { lis[k].classList.add('on'); stage.innerHTML = ''; }, t));
      s.rows.forEach(([kind, label, text], r) => timers.push(setTimeout(() => {
        const d = document.createElement('div'); d.className = 'row ' + (kind === 'tool' ? 'tool' : kind === 'bad' ? 'bad' : '');
        d.innerHTML = `<span class="lbl">${esc(label)}</span><span>${esc(text)}</span>`; stage.appendChild(d);
      }, t + 200 + r * ROW_MS)));
      t += Math.max(STEP_MS, 400 / SP + s.rows.length * ROW_MS);
      if (k === c.replay.length - 1) timers.push(setTimeout(() => {
        const d = document.createElement('p'); d.className = 'disc';
        d.innerHTML = 'Design demo. Not a medical device. Not for wearing on a person; not load-bearing. <a href="./liner.html?view=tech">Open the clinician approval gate</a>';
        stage.appendChild(d);
      }, t));
    });
  }
  $('#replayClose').addEventListener('click', () => { timers.forEach(clearTimeout); $('#replay').hidden = true; });
  $('#runBtn').addEventListener('click', () => { if (CASES.length) replay(0); else $('#cases').scrollIntoView(); });
  window.__home = { replay };
})();
