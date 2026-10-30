// Judge demo: 30-second, offline, skippable walkthrough of Case 1 using recorded evidence (window.DEMO_DATA).
// Open with ?demo=1 or the "30-second demo" button. Esc closes, → skips, R replays.
(function () {
  'use strict';
  const D = window.DEMO_DATA;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SP = Math.max(1, +new URLSearchParams(location.search).get('speed') || 1);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CH = [['Scan', 4000], ['Design', 7500], ['Check', 4000], ['File', 3500], ['Newton', 4000], ['Approve', 6000]];
  const TOTAL = CH.reduce((a, c) => a + c[1], 0);
  let root, body, bar, chapEl, timers = [], idx = -1, t0 = 0, raf = 0, auto = true, gate = null;

  function build() {
    root = document.createElement('div'); root.className = 'dm'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '30-second demo');
    root.innerHTML = `<div class="dm-top"><b>Rehab AI · demo</b><ol class="dm-chap">${CH.map(c => `<li>${c[0]}</li>`).join('')}</ol>
      <button class="dm-btn" type="button" data-a="skip">Skip</button><button class="dm-btn" type="button" data-a="replay">Replay</button><button class="dm-btn" type="button" data-a="close" aria-label="Close demo">Close</button></div>
      <div class="dm-bar"><i></i></div><div class="dm-body" aria-live="polite"></div>
      <div class="dm-foot">Sample scan · recorded runs · design-support prototype, not a medical device; not used on patients. A clinician prescribes and approves every design.</div>`;
    document.body.appendChild(root);
    body = root.querySelector('.dm-body'); bar = root.querySelector('.dm-bar i'); chapEl = [...root.querySelectorAll('.dm-chap li')];
    root.addEventListener('click', e => { const a = e.target.closest('[data-a]'); if (!a) return; ({ skip, replay: start, close })[a.dataset.a](); });
    addEventListener('keydown', e => {
      if (root.hidden) return;
      if (e.key === 'Tab') { const f = [...root.querySelectorAll('button:not([disabled]),a[href]')]; if (!f.length) return; const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } return; }
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') skip(); else if (e.key === 'r' || e.key === 'R') start(); });
  }
  const later = (fn, ms) => timers.push(setTimeout(fn, reduce ? 0 : ms / SP));
  function clear() { timers.forEach(clearTimeout); timers = []; }
  function countUp(el, to, dec = 0, ms = 900) {
    if (reduce) { el.textContent = to.toFixed(dec); return; }
    const s = performance.now(), d = ms / SP;
    (function f(t) { const k = Math.min(1, (t - s) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = (to * e).toFixed(dec); if (k < 1) requestAnimationFrame(f); })(s);
  }

  // ---------- scenes ----------
  function legCanvas(cv) {
    const ctx = cv.getContext('2d'), DPR = Math.min(2, devicePixelRatio || 1), W = cv.width = 460 * DPR, H = cv.height = 420 * DPR;
    const prof = D.profile, zMax = Math.max(...prof.map(p => p[0])), rMax = Math.max(...prof.map(p => p[1])) / (2 * Math.PI);
    const s = (H * 0.86) / zMax, cx = W / 2, base = H * 0.94, start = performance.now();
    (function f(t) {
      if (!cv.isConnected) return;
      const el = reduce ? 9 : (t - start) / 1000 * SP, sweep = Math.min(1, el / 2.4);
      ctx.clearRect(0, 0, W, H);
      const g = ctx.createRadialGradient(cx, base, 4, cx, base, rMax * s * 1.8); g.addColorStop(0, 'rgba(14,20,24,.16)'); g.addColorStop(1, 'rgba(14,20,24,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, base, rMax * s * 1.6, rMax * s * 0.35, 0, 0, 7); ctx.fill();
      const zTop = zMax * sweep;
      prof.slice().reverse().forEach(([z, girth], j) => {
        if (z > zTop) return; const r = girth / (2 * Math.PI) * s, y = base - z * s, inZone = z >= 225 && z <= 375;
        ctx.strokeStyle = inZone ? 'rgba(11,138,104,.9)' : 'rgba(14,20,24,.35)'; ctx.lineWidth = (inZone ? 1.6 : 1) * DPR;
        ctx.beginPath(); ctx.ellipse(cx, y, r, r * 0.22, 0, 0, Math.PI); ctx.stroke();
        ctx.strokeStyle = inZone ? 'rgba(11,138,104,.25)' : 'rgba(14,20,24,.08)';
        ctx.beginPath(); ctx.ellipse(cx, y, r, r * 0.22, 0, Math.PI, 2 * Math.PI); ctx.stroke();
      });
      if (sweep < 1) { const y = base - zTop * s; ctx.fillStyle = 'rgba(11,138,104,.95)'; ctx.fillRect(cx - rMax * s * 1.5, y - DPR, rMax * s * 3, 2 * DPR); }
      if (!reduce) raf = requestAnimationFrame(f);
    })(start);
  }
  const SCENES = {
    Scan() {
      body.innerHTML = `<div class="dm-scene"><div><p class="src">Step 1 · Sample scan (synthetic leg, OBJ)</p><h2>Nobody fits the part that touches you. We start with one scan.</h2>
        <div class="dm-big"><span data-n="0">0</span> · <span data-n="1">0</span> · <span data-n="2">0</span> <small style="font-size:.4em">mm</small></div>
        <p class="src">Top · middle · bottom of the liner zone, measured by code</p></div><div class="dm-card"><canvas aria-label="Sample leg scan being measured"></canvas></div></div>`;
      legCanvas(body.querySelector('canvas'));
      body.querySelectorAll('[data-n]').forEach((el, i) => later(() => countUp(el, D.girths_mm[i], 1), 900 + i * 400));
    },
    Design() {
      const r = D.run, when = new Date(r.timestamp).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
      body.innerHTML = `<div class="dm-scene"><div><p class="src">Step 2 · Recorded live run · ${esc(r.provider)} · ${esc(when)}</p><h2>Nemotron picks the tools. Code does the maths.</h2>
        <p class="src">${esc(r.model)} · ${r.totals.model_calls} calls · ${r.totals.total_tokens} tokens · claim audit: ${r.claim_audit.numbers_quoted} numbers, ${r.claim_audit.unsupported_numbers.length} unsupported</p></div>
        <div class="dm-card"><ul class="dm-list"></ul></div></div>`;
      const ul = body.querySelector('ul');
      D.trace.forEach(([kind, k, v], i) => later(() => {
        const li = document.createElement('li');
        if (kind === 'say') { li.className = 'say'; li.innerHTML = `<b>Nemotron says</b> “${esc(v.length > 230 ? v.slice(0, 230) + '…' : v)}”`; }
        else li.innerHTML = `<span class="k">${esc(k)}</span><span class="v">${esc(v)}</span>`;
        ul.appendChild(li);
      }, 300 + i * 680));
    },
    Check() {
      body.innerHTML = `<div class="dm-scene"><div><p class="src">Step 3 · Geometry checks (code)</p><h2><span class="cnt">0</span>/${D.checks.length} checks pass.</h2>
        <p class="src">No physics on this part. NVIDIA Newton ran on a test piece only (recorded ${esc(D.newton.recorded)}).</p></div><div class="dm-card"><ul class="dm-list"></ul></div></div>`;
      const ul = body.querySelector('ul'), cnt = body.querySelector('.cnt'); let n = 0;
      D.checks.forEach(([id, ok], i) => later(() => {
        const li = document.createElement('li'); li.innerHTML = `<span class="tick" aria-hidden="true">${ok ? '✓' : '!'}</span><span class="k">${esc(id)}</span><span class="v">${ok ? 'pass' : 'fail'}</span>`;
        ul.appendChild(li); if (ok) cnt.textContent = ++n;
      }, 250 + i * 320));
    },
    File() {
      const pts = D.pattern_outline, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
      const d = 'M' + pts.map(p => `${(p[0] - x0 + 10).toFixed(1)} ${(p[1] - y0 + 10).toFixed(1)}`).join('L') + 'Z';
      const c = D.outcome.cut_lengths_mm;
      body.innerHTML = `<div class="dm-scene"><div><p class="src">Step 4 · Cut-ready file (code)</p><h2>A 1:1 cut pattern on ${D.outcome.tiles} A4 tiles.</h2>
        <div class="dm-big">${c.map(v => `<span data-v="${v}">0</span>`).join(' · ')} <small style="font-size:.4em">mm</small></div><p class="src">Cut lengths top · middle · bottom. SVG, print at 100% and cut.</p></div>
        <div class="dm-card"><svg class="dm-pat" viewBox="0 0 ${(w + 20).toFixed(0)} ${(h + 20).toFixed(0)}" aria-label="Cut pattern outline"><path d="${d}"/></svg></div></div>`;
      const p = body.querySelector('path'); p.style.setProperty('--len', Math.ceil(p.getTotalLength()));
      body.querySelectorAll('[data-v]').forEach(el => countUp(el, +el.dataset.v, 1, 1400));
    },
    Newton() {
      const cs = D.newton.cases, mx = Math.max(...cs.map(c => Math.abs(c.travel_mm)));
      body.innerHTML = `<div class="dm-scene"><div><p class="src">Recorded run · ${esc(D.newton.recorded)} · test piece only, not live, not a limb</p><h2>NVIDIA Newton: does the test piece hold or slide?</h2>
        <p class="src">${esc(D.newton.engine)} · ${D.newton.mesh.triangles} triangles</p></div>
        <div class="dm-card dm-bars">${cs.map(c => `<div class="b"><span class="l">${esc(c.name)}</span><span class="t"><i data-w="${Math.max(1.5, Math.abs(c.travel_mm) / mx * 100)}"></i></span><span class="n">${c.travel_mm} mm</span></div>`).join('')}
        <p class="src" style="margin:0">Travel after 240 steps · ${cs[0].contacts} contacts in each run</p></div></div>`;
      body.querySelectorAll('[data-w]').forEach((el, i) => later(() => { el.style.width = el.dataset.w + '%'; }, 300 + i * 450));
    },
    Approve() {
      gate = { approved: false, foam: D.outcome.foam_thickness_mm, approvedFoam: null };
      body.innerHTML = `<div class="dm-scene"><div><p class="src">Step 5 · Clinician approval gate (preview; the real gate is in the <a href="./liner.html?view=tech">clinician view</a>)</p>
        <h2>Unlike a towel, it is checked and signed off.</h2><p class="src">Nothing ships until a clinician approves. The AI prepared a draft. It cannot approve. Any edit revokes approval.</p></div>
        <div class="dm-card dm-gate"><div class="src" style="margin:0">Spec ${esc(D.outcome.spec_sha256.slice(0, 12))}…</div><div class="state" aria-live="assertive">Awaiting clinician approval</div>
        <div class="row">Foam thickness <span class="stepper-in"><button type="button" data-f="-1" aria-label="Thinner">−</button><span class="foam">${gate.foam} mm</span><button type="button" data-f="1" aria-label="Thicker">+</button></span></div>
        <div class="row"><button type="button" class="dm-btn pri appr">Approve as clinician</button></div>
        <p class="disc">Design-support prototype, not a medical device; not used on patients. A clinician prescribes and approves every design.</p></div></div>`;
      const st = body.querySelector('.state'), ap = body.querySelector('.appr'), fo = body.querySelector('.foam');
      const render = () => {
        fo.textContent = gate.foam + ' mm';
        if (gate.approved) { st.textContent = 'Approved by clinician'; st.className = 'state ok'; ap.disabled = true; ap.textContent = 'Approved'; }
        else if (gate.approvedFoam != null) { st.textContent = 'Approval revoked: design edited. Re-check, then re-approve.'; st.className = 'state rev'; ap.disabled = false; ap.textContent = 'Re-approve as clinician'; }
        else { st.textContent = 'Awaiting clinician approval'; st.className = 'state'; ap.disabled = false; }
      };
      const approve = () => { gate.approved = true; gate.approvedFoam = gate.foam; render(); };
      const edit = d => { const f = Math.min(8, Math.max(2, gate.foam + d)); if (f === gate.foam) return; gate.foam = f; if (gate.approved) gate.approved = false; render(); };
      ap.addEventListener('click', () => { auto = false; approve(); });
      body.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { auto = false; edit(+b.dataset.f); }));
      later(() => { if (auto) { ap.classList.add('dm-pulse'); } }, 800);
      later(() => { if (auto) approve(); }, 1900);
      later(() => { if (auto) { body.querySelector('[data-f="1"]').classList.add('dm-pulse'); edit(1); } }, 3900);
    },
  };

  function show(i) {
    cancelAnimationFrame(raf); clear(); idx = i;
    chapEl.forEach((li, k) => { li.className = k === i ? 'on' : k < i ? 'done' : ''; });
    if (i >= CH.length) { end(); return; }
    try { SCENES[CH[i][0]](); } catch (e) { body.innerHTML = `<p>Could not show this step (${esc(e.message)}). <button class="dm-btn" data-a="skip">Next</button></p>`; }
    const before = CH.slice(0, i).reduce((a, c) => a + c[1], 0);
    bar.style.width = (before / TOTAL * 100) + '%';
    if (i < CH.length - 1) later(() => show(i + 1), CH[i][1]);
    else later(() => { bar.style.width = '100%'; }, CH[i][1]);
    later(() => { bar.style.width = ((before + CH[i][1]) / TOTAL * 100) + '%'; }, 60);
  }
  function end() { bar.style.width = '100%'; }
  function start() { if (!D) { alert('Demo data missing (demo-data.js).'); return; } if (!root) build(); auto = true; root.hidden = false; document.body.style.overflow = 'hidden'; root.querySelector('[data-a="skip"]').focus({ preventScroll: true }); show(0); }
  function skip() { if (idx < CH.length - 1) show(idx + 1); }
  function close() { clear(); cancelAnimationFrame(raf); if (root) root.hidden = true; document.body.style.overflow = ''; const b = document.getElementById('demoBtn'); if (b) b.focus({ preventScroll: true }); }
  window.__demo = { start, skip, close };
  const btn = document.getElementById('demoBtn'); if (btn) btn.addEventListener('click', start);
  if (new URLSearchParams(location.search).get('demo') === '1') start();
})();
