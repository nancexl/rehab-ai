// Engineering workbench (v8): Patient / Clinician / Manufacturer views per case, step tracker,
// Engineering Test Report and Manufacturer hand-off. Every value below is copied from the recorded
// build records in evidence/live/ (30 Oct 2026). Anything we do not compute is shown as "next".
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TRACK = ['Scan', 'Body model', 'Movement', 'Simulate', 'Design', 'Engineering tests', 'Clinician approve', 'Files', 'Follow-up / re-scan'];
  // status: done | wait | next | na
  const W = {
    case1: {
      name: 'Scenario A · Ankle fracture · iWALK calf liner', id: 'case1-liner',
      track: [['done', 'Sample leg scan (synthetic OBJ), 5/5 quality checks'], ['done', 'Girths 325.7 / 364.7 / 327.4 mm (code)'], ['next', 'Patient video of using the iWALK: not built'], ['next', 'No physics on this part; Newton ran on the test piece only'], ['done', 'Live Nemotron draft v1 (30 Oct 2026, 14:08 GMT)'], ['done', 'Compiler: 10/10 geometry checks pass · review list: 6 passed, 1 note, 1 out-of-range scan refused'], ['wait', 'Awaiting clinician approval'], ['wait', 'Locked until approval'], ['done', 'Re-scan → v2 drafted (−13 / −14.6 / −13.1 mm)']],
      tests: [
        ['pass', 'Scan quality', '5/5', 'code'],
        ['pass', 'Girth top / mid / bottom in range', '325.7 / 364.7 / 327.4 mm', 'code'],
        ['pass', 'Shin length, knee width in range', 'sample values', 'code'],
        ['pass', 'Liner fits shin, overlap sufficient', 'overlap 30 mm', 'code'],
        ['pass', 'Calibration, taper, crest channel plausible', '3/3', 'code'],
        ['pass', 'Claim audit, v1 prose', '12 numbers, all traced to tool results', 'code'],
        ['warn', 'Claim audit, v2 prose', 'rounded numbers 355 / 393 / 357 flagged', 'code'],
        ['fail', 'Out-of-range re-scan (guardrail)', 'calf 620 mm (allowed 260–480): refused, no pattern', 'code + agent'],
        ['next', 'Pressure map at the limb–device contact', 'not computed', 'body + device simulation'],
        ['next', 'Compensation in back / hip / other leg', 'not computed', 'movement capture + simulation'],
      ],
      files: ['pattern-v1-page1.svg … pattern-v1-page5.svg (1:1 cut pattern, 5 A4 tiles)'],
      material: 'Foam, 4 mm thick (compile_pattern default); 150 mm liner height; 30 mm overlap',
      draft: 'v1 · live Nemotron (nvidia/nemotron-3-super-120b-a12b) · 2026-10-30 14:08 GMT', spec: '8e7b7e34e14e038f…', record: '36cbf1fc92cc0e48…',
      patient: 'Your leg was measured from a scan (in this demo, a synthetic sample). The AI drafted a liner for your iWALK; a clinician must approve it before anything is made.'
    },
    case2: {
      name: 'Scenario B · Forefoot offloading insole (relief under a metatarsal head)', id: 'case2-insole',
      track: [['done', 'Sample foot outline (synthetic)'], ['done', 'Length 252 mm, forefoot 100 mm, heel 68.1 mm'], ['next', 'Patient video of walking in the insole: not built'], ['done', 'NVIDIA Newton XPBD, simplified flat-vs-relief comparison (30 Oct 2026)'], ['done', 'Compiled by code (agent not used)'], ['done', '6/6 geometry checks pass'], ['wait', 'Awaiting clinician approval'], ['wait', 'Locked until approval'], ['next', 'Re-scan at each review: next']],
      tests: [
        ['pass', 'Foot length in range', '252 mm (allowed 180–320)', 'code'],
        ['pass', 'Forefoot width in range', '100 mm (allowed 60–130)', 'code'],
        ['pass', 'Relief radius allowed', '14 mm (max 24)', 'code'],
        ['pass', 'Relief keeps border', '7.8 mm (min 6)', 'code'],
        ['pass', 'Calibration plausible', 'scale 1.000 × 1.000', 'code'],
        ['pass', 'Relief window inside outline', '7.7 mm minimum border', 'code'],
        ['next', 'Peak plantar pressure vs target', 'not computed', 'body + device simulation'],
        ['next', 'Change since last review (re-scan delta)', 'not computed', 'data loop'],
      ],
      files: ['insert-layer1-base.svg (1:1, A4)', 'insert-layer2-relief.svg (1:1, A4)'],
      material: 'EVA, 3 mm base + 3 mm relief layer',
      draft: 'Compiled by code (agent not used) · record 2026-10-30 14:28 GMT', spec: '42ecfb418ae8f053…', record: '3b050f72b35bbe48…',
      patient: 'Your foot outline (in this demo, a synthetic sample) gives an insole with a relief window under a metatarsal head, the kind of relief used in diabetic foot care. Diabetic-foot-specific parameters and clinical tuning are next. A clinician approves it.'
    },
    case3: {
      name: 'Simulation step · NVIDIA Newton test piece', id: 'case3-coupon',
      track: [['done', 'Synthetic geometry study, not a scan'], ['na', 'Nonhuman test piece'], ['na', 'Not applicable'], ['done', 'NVIDIA Newton 1.6.1 / Warp 1.18.0, recorded 14 Oct 2026'], ['done', 'Shape by code (agent not used)'], ['done', '5/5 sanity checks pass'], ['wait', 'Review draft · manufacturing not approved'], ['wait', 'STL locked until review'], ['na', 'Not applicable']],
      tests: [
        ['pass', 'Resting, friction 0.8', '−0.03 mm travel (at rest) · 27 contacts', 'Newton (recorded)'],
        ['pass', 'Sliding, friction 0.05', '40.9 mm travel · 27 contacts', 'Newton (recorded)'],
        ['pass', 'Sliding, friction 0.8', '8.4 mm travel · 27 contacts', 'Newton (recorded)'],
        ['pass', 'Sanity checks, source STL hash matches', '5/5', 'code'],
        ['next', 'Load case on a real limb + device', 'not computed', 'body + device simulation'],
        ['next', 'Printability (overhangs, bed fit, slicer)', 'not computed', 'manufacturing'],
      ],
      files: ['nonhuman-contact-coupon.stl (196 vertices, 388 triangles)'],
      material: 'Not specified (test piece)',
      draft: 'Shape by code (agent not used) · record 2026-10-30 14:28 GMT', spec: '5c7774c0649bb1a1… (STL)', record: 'f897a1fc0e38bbf4…',
      patient: 'This is a nonhuman test piece used to check the simulation step. It is not for a patient.'
    }
  };
  const ORDER = ['case1', 'case2', 'case3'];
  const ICON = { pass: '✓ pass', warn: '! warn', fail: '✕ fail', next: 'next', done: '✓', wait: '…', na: '–' };
  const TI = { done: '✓', wait: '…', next: '○', na: '–' };
  let cur = 0, view = 'clinician';
  const tests = c => `<h4>Engineering Test Report</h4><p class="wb-note">Real checks from the recorded build record. Anything not computed is marked <b>next</b>. Limits are demo bounds, not clinically validated.</p>
    <table class="wb-tests"><thead><tr><th>Result</th><th>Check</th><th>Value / limit</th><th>Method</th></tr></thead><tbody>${c.tests.map(t => `<tr class="r-${t[0]}"><td><span class="pill p-${t[0]}">${ICON[t[0]]}</span></td><td>${esc(t[1])}</td><td>${esc(t[2])}</td><td>${esc(t[3])}</td></tr>`).join('')}</tbody></table>`;
  const handoff = c => `<h4>Manufacturer hand-off</h4><div class="wb-hand"><dl>
    <dt>Files</dt><dd>${c.files.map(esc).join('<br>')}</dd>
    <dt>Material</dt><dd>${esc(c.material)}</dd>
    <dt>Case ID</dt><dd><code>${esc(c.id)}</code></dd>
    <dt>AI draft version</dt><dd>${esc(c.draft)}</dd>
    <dt>Spec hash</dt><dd><code>${esc(c.spec)}</code></dd>
    <dt>Build record</dt><dd><code>${esc(c.record)}</code> (SHA-256)</dd>
    <dt>Approver</dt><dd>— not approved yet</dd>
    <dt>Approval time</dt><dd>—</dd></dl>
    <p class="wb-lock">🔒 Files unlock only after a clinician approves this exact version. Any edit revokes approval. Liner and insole are cut-ready (SVG); only the test piece is an STL.</p></div>`;
  const PART = { case1: [[1, 2, 3, 4, 5].map(i => `./parts/case1-p${i}.svg`), 'Liner cut pattern: 4 liner tiles + crest relief pad, all 5 pages (generated 1:1 SVG)'], case2: ['./parts/case2.svg', 'Insole relief layer (generated 1:1 SVG)'] };
  function status(c, id) {
    const n = k => c.tests.filter(t => t[0] === k).length, pass = n('pass'), warn = n('warn'), fail = n('fail');
    // Honest summary: a fail row here is the out-of-range guardrail refusing a bad scan, shown as such.
    if (!warn && !fail) return ['ok', 'All engineering checks passed', `${pass} of ${pass} checks · ${id === 'case2' ? 'simplified Newton comparison below · validated pressure: next' : 'physics and pressure: next'}`];
    const extra = [warn ? `${warn} note to review` : '', fail ? `${fail} out-of-range scan refused` : ''].filter(Boolean).join(' · ');
    return ['note', 'Engineering checks passed', `${pass} passed · ${extra}`];
  }
  function render() {
    const id = ORDER[cur], c = W[id]; if (!c) return;
    $('#wbCase').textContent = c.name;
    document.querySelectorAll('.wb-views button').forEach(b => b.setAttribute('aria-selected', b.dataset.v === view));
    $('#wbTrack').innerHTML = TRACK.map((s, k) => `<li class="s-${c.track[k][0]}"><span class="ic">${TI[c.track[k][0]]}</span><b>${esc(s)}${c.track[k][0] === 'next' ? ' <em>next</em>' : ''}</b><small>${esc(c.track[k][1])}</small></li>`).join('');
    const [st, head, sub] = status(c, id), part = PART[id];
    const vis = part ? `<figure class="wb-part">${[].concat(part[0]).map((src, k, a) => `<img src="${src}" alt="${esc(part[1])}${a.length > 1 ? `, page ${k + 1} of ${a.length}` : ''}" loading="lazy">`).join('')}<figcaption>${esc(part[1])}</figcaption></figure>`
      : `<figure class="wb-part wb-part-ph"><span>NVIDIA Newton test piece · STL</span><figcaption>Nonhuman test piece, recorded 14 Oct 2026</figcaption></figure>`;
    const sim = id === 'case2' ? `<figure class="wb-sim"><img src="./sim/newton-insole-heatmap.png" alt="Top-surface compression, flat insole vs insole with relief window" loading="lazy"><figcaption>NVIDIA Newton 1.6.1 XPBD (CPU), simplified: relative flat-vs-relief comparison; assumed, scaled EVA stiffness; not a validated plantar-pressure simulation.</figcaption></figure>` : '';
    const hero = `<div class="wb-hero">${vis}<div class="wb-status s-${st}"><span class="wb-big">${st === 'ok' ? '✓' : '✓'}</span><div><b>${esc(head)}</b><small>${esc(sub)}</small><small class="wb-gate-s">${esc(c.track[6][1])}</small></div></div></div>`;
    let body = '';
    if (view === 'patient') body = `<h4>Your progress</h4><p>${esc(c.patient)}</p><p class="wb-task"><b>Next (not built yet):</b> film yourself taking 10 steps with your device so your physio can see how you move. Movement capture and body + device simulation are on the roadmap.</p><p class="wb-note">Patients never see an approve button.</p>`;
    else if (view === 'clinician') body = `<details class="wb-more"><summary>Engineering Test Report · ${c.tests.length} rows</summary>${tests(c)}</details><p class="wb-gate">The AI only drafts. Approve or reject in the <a href="./liner.html?view=tech">clinician approval gate</a>.</p>`;
    else body = `<p class="wb-gate">🔒 Files unlock only after a clinician approves this exact version.</p><details class="wb-more"><summary>Files, material and traceability</summary>${handoff(c)}</details>`;
    $('#wbBody').innerHTML = hero + sim + body;
  }
  function init() {
    if (!$('#workbench')) return;
    $('#wbViews').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) { view = b.dataset.v; render(); } });
    document.addEventListener('case:change', e => { cur = +e.detail || 0; render(); });
    render();
  }
  window.__workbench = { W, TRACK };
  init();
})();
