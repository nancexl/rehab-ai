// Hands-free mobility compiler page: intake → task plan → liner spec → compile → approve → measure → learn.
(() => {
  const K = window.LinerCore, $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const S = { persona: K.PERSONAS.P1, intake: null, leg: null, plan: null, spec: null, compiled: null, previous: null, calibration: null, version: 0, approved: false, review: null, measurement: null, measurementKind: 'operator_entered_unverified', options: {}, lastAgent: null, userActed: false };

  function setStage(i) { document.querySelectorAll('#stages li').forEach((li, k) => { li.classList.toggle('done', k < i); li.classList.toggle('current', k === i); }); }

  // ---------- intake ----------
  const FIELDS = [
    ['side', 'Injured side', ['right', 'left']],
    ['weight_bearing', 'Weight-bearing', ['non_weight_bearing', 'partial', 'full']],
    ['age_band', 'Age band', ['18-49', '50-69', '70+']],
    ['shower', 'Shower', ['tub', 'walk_in']],
    ['work', 'Daytime', ['desk', 'standing', 'retired']]
  ];
  const BOOLS = [['balance_concern', 'Balance concern'], ['knee_problem', 'Knee problem (injured side)'], ['lives_alone', 'Lives alone'],
    ['stairs_at_home', 'Stairs at home'], ['outdoor_commute', 'Commutes outdoors']];
  const LEG = [['circ_top_mm', 'Calf below knee (mm)'], ['circ_mid_mm', '75 mm lower (mm)'], ['circ_bottom_mm', '150 mm lower (mm)'],
    ['shin_length_mm', 'Shin length (mm)'], ['knee_width_mm', 'Knee width (mm)']];

  function renderPersonas() {
    $('personas').innerHTML = Object.values(K.PERSONAS).map(p =>
      `<button class="scenario" role="radio" type="button" data-id="${p.id}" aria-checked="${p.id === S.persona.id}"><b>${p.id} · ${esc(p.title)}</b><small>${esc(p.note)}</small></button>`).join('');
    $('personas').querySelectorAll('.scenario').forEach(b => b.onclick = () => { S.userActed = true; loadPersona(K.PERSONAS[b.dataset.id]); run(); });
  }
  function loadPersona(p) {
    S.persona = p; S.intake = { ...p.intake }; S.leg = { ...p.leg }; S.calibration = null; S.previous = null; S.version = 0; S.measurement = null; S.review = null; S.approved = false;
    renderPersonas();
    $('intake').innerHTML = FIELDS.map(([k, label, opts]) => `<label>${label}<select data-k="${k}">${opts.map(o => `<option ${o === S.intake[k] ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`).join('') +
      BOOLS.map(([k, label]) => `<label><input type="checkbox" data-k="${k}" ${S.intake[k] ? 'checked' : ''}>${label}</label>`).join('');
    $('intake').querySelectorAll('select,input').forEach(el => el.onchange = () => { S.intake[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; resetVersions(); });
    $('legForm').innerHTML = LEG.map(([k, label]) => `<label>${label}<input type="number" data-k="${k}" value="${S.leg[k]}"></label>`).join('');
    $('legForm').querySelectorAll('input').forEach(el => el.oninput = () => { S.leg[el.dataset.k] = Number(el.value); S.leg.source = 'entered_by_user'; $('legSource').textContent = 'entered'; resetVersions(); });
    $('legSource').textContent = p.leg.source === 'example_values' ? 'example values · replace with yours' : p.leg.source;
    $('measureBox').hidden = true; $('learnOut').innerHTML = '';
  }
  function resetVersions() {
    S.calibration = null; S.previous = null; S.version = 0; S.approved = false; S.compiled = null; S.spec = null;
    S.measurement = null; S.review = null; S.options = {};
    $('approveBtn').disabled = $('downloadBtn').disabled = $('printBtn').disabled = $('recordBtn').disabled = true;
    $('versionTag').textContent = 'Inputs changed · compile again';
    S.userActed = false; updateApproveUi();
    $('measureBox').hidden = true; $('learnOut').innerHTML = '';
  }

  // ---------- plan ----------
  function renderPlan() {
    const p = S.plan;
    $('plan').innerHTML = (p.hands_free_recommended ? '' :
      `<div class="refusal"><b>Study stopped for review.</b> Declared concerns: ${esc(p.refusal_reasons.join('; '))}. No pattern is compiled for this intake.</div>`) +
      `<table class="plan-table"><tr><th>Study input</th><th>Engineering meaning</th></tr>` +
      [['Output', 'A contact-liner pattern for a nonhuman fit specimen.'],
       ['Dimension source', S.leg.source || 'Unknown; confirm before a build.'],
       ['Body inputs', 'Three circumference inputs, shin length and knee width. These do not establish device suitability.'],
       ['Next evidence', 'Actual print scale, closure errors, material and device compatibility.']].map(([label, value]) => `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`).join('') +
      `</table><p class="hint">Local screening does not select a medical aid or establish fit, comfort or safety. Review the pattern and its assumptions before a specimen build.</p>`;
  }

  // ---------- compile ----------
  function run() {
    S.approved = false; S.review = null; $('recordBtn').disabled = true; $('measureBox').hidden = true;
    S.plan = K.planMobility(S.intake); renderPlan(); setStage(1);
    if (!S.plan.hands_free_recommended) {
      S.compiled = null; $('preview').innerHTML = '<p class="empty">Compilation stopped: the plan does not recommend a hands-free device for this person.</p>';
      $('specSummary').innerHTML = '<dt>Status</dt><dd>blocked by plan</dd>'; $('checks').innerHTML = ''; $('irJson').textContent = '';
      $('approveBtn').disabled = $('downloadBtn').disabled = $('printBtn').disabled = true; $('versionTag').textContent = '';
      $('approveBtn').textContent = 'Nothing to approve'; updateApproveUi(); $('approveHint').textContent = 'The plan stopped this intake, so no pattern was compiled.';
      return;
    }
    S.spec = K.makeLinerSpec({ persona: { ...S.persona, intake: S.intake }, leg: S.leg, calibration: S.calibration, options: S.options });
    S.compiled = K.compileLiner(S.spec); S.version = S.version || 1;
    renderSpec(); renderPreview();
    $('approveBtn').textContent = `Approve v${S.version} for nonhuman fit sample`; updateApproveUi();
    $('downloadBtn').disabled = $('printBtn').disabled = true;
    setStage(S.compiled.ok ? 2 : 1);
  }
  $('runBtn').onclick = () => { S.userActed = true; run(); };

  // Approval needs an explicit user action (Plan & compile, a profile pick, a scan import, or loading an agent result),
  // so the auto-compiled example on page load can be previewed but not approved.
  function updateApproveUi() {
    const ok = !!(S.compiled && S.compiled.ok), example = (S.leg && S.leg.source) === 'example_values';
    if (!S.approved) $('approveBtn').disabled = !(ok && S.userActed);
    $('approveHint').textContent = S.approved ? '' : !ok ? (S.compiled ? 'Fix the failed checks before approval.' : 'Inputs changed. Press Plan & compile, then review.')
      : !S.userActed ? 'Preview only. Press Plan & compile (or pick a profile) to review, then approve.' : 'Review the pattern and checks, then approve.';
    $('exampleBanner').hidden = !example; $('specExampleBanner').hidden = !(example && ok);
  }

  function renderSpec() {
    const sp = S.spec, c = S.compiled;
    const rows = [['Device', 'Liner for a hands-free knee crutch'], ['Side', sp.side],
      ['Calf', `${sp.leg.circ_top_mm} / ${sp.leg.circ_mid_mm} / ${sp.leg.circ_bottom_mm} mm`],
      ['Liner', `${sp.liner.height_mm} mm tall · ${sp.liner.foam_thickness_mm} mm foam · ${sp.liner.overlap_mm} mm overlap`],
      ['Cut lengths', `${c.cut_lengths_mm.join(' / ')} mm`], ['Crest relief', `${sp.liner.crest_channel_mm} mm channel`],
      ['Calibration', sp.calibration.source === 'default' ? 'none yet (v1)' : `${sp.calibration.length_add_mm.join(' / ')} mm`]];
    $('specSummary').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    $('checks').innerHTML = c.checks.map(x => `<li class="${x.ok ? 'ok' : 'bad'}"><b>${x.ok ? '✓' : '✗'}</b>${esc(x.id.replace(/_in_range$/, x.ok ? ' within compiler range (fit not assessed)' : ' outside compiler range').replace(/_/g, ' '))}: ${esc(x.detail)}</li>`).join('');
    $('checksHead').hidden = !c.checks.length;
    $('irJson').textContent = JSON.stringify(sp, null, 2);
    $('versionTag').textContent = `v${S.version}${c.ok ? '' : ' · blocked'}`;
  }

  function renderPreview() {
    const c = S.compiled, g = S.previous, all = [c, g].filter(Boolean);
    const x0 = Math.min(...all.map(v => v.bounds.x0)) - 10, x1 = Math.max(...all.map(v => v.bounds.x1)) + 10;
    const y0 = -18, y1 = Math.max(...all.map(v => v.bounds.y1)) + 14, W = x1 - x0, H = y1 - y0;
    const path = v => 'M' + v.outline.map(p => p.map(n => n.toFixed(1)).join(' ')).join('L') + 'Z';
    let svg = `<svg viewBox="${x0} ${y0} ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    for (let x = Math.ceil(x0 / 10) * 10; x < x1; x += 10) svg += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="#16202a" stroke-width=".5"/>`;
    for (let y = Math.ceil(y0 / 10) * 10; y < y1; y += 10) svg += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#16202a" stroke-width=".5"/>`;
    if (g) svg += `<path d="${path(g)}" fill="none" stroke="#b4c1c9" stroke-dasharray="4 3" stroke-width="1"/>`;
    svg += `<path d="${path(c)}" fill="#2c3b45" stroke="#7ce7da" stroke-width="1.4"/>`;
    svg += `<rect x="${c.bounds.x1 - c.overlap_mm}" y="0" width="${c.overlap_mm}" height="${c.height_mm}" fill="#7ce7da" opacity=".08"/>`;
    svg += `<rect x="${c.channel.x}" y="${c.channel.y0}" width="${c.channel.w}" height="${c.channel.y1 - c.channel.y0}" rx="3" fill="#ff7849" opacity=".85"/>`;
    for (const s of c.straps) svg += `<rect x="${s.x - s.w / 2}" y="${s.y - s.h / 2}" width="${s.w}" height="${s.h}" rx="2" fill="#d9ed83"/>`;
    svg += `<text x="0" y="-4" fill="#b4c1c9" font-size="10" text-anchor="middle">front of shin</text>`;
    svg += `<text x="${c.bounds.x1 - c.overlap_mm / 2}" y="-4" fill="#b4c1c9" font-size="10" text-anchor="middle">closure</text>`;
    svg += `<text x="${x0 + 3}" y="${y1 - 3}" fill="#8995a3" font-size="6">10 mm grid · flat pattern · ${c.height_mm} mm tall</text></svg>`;
    $('preview').innerHTML = svg;
  }

  // ---------- build ----------
  $('approveBtn').onclick = () => { if (!S.compiled?.ok) return; S.approved = true; S.review = { decision: 'approved_for_nonhuman_specimen', timestamp: new Date().toISOString() }; $('downloadBtn').disabled = $('printBtn').disabled = $('recordBtn').disabled = false; $('approveBtn').textContent = `Approved v${S.version} ✓`; $('approveBtn').disabled = true; $('approveHint').textContent = ''; $('measureBox').hidden = false; setStage(3); };
  const pages = () => ['liner', 'crest'].flatMap(layer => K.linerPages(S.compiled, { title: `Rehab AI liner · ${S.persona.id} · v${S.version}`, layer }));
  $('downloadBtn').onclick = () => { if (!S.approved || !S.compiled?.ok) return; pages().forEach((svg, i) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = `liner-${S.persona.id}-v${S.version}-page${i + 1}.svg`; a.click(); URL.revokeObjectURL(a.href);
  }); };
  $('printBtn').onclick = () => {
    if (!S.approved || !S.compiled?.ok) return;
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!doctype html><title>Templates</title><style>@page{size:A4 landscape;margin:0}body{margin:0}svg{display:block;page-break-after:always}</style>${pages().join('')}`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  $('recordBtn').onclick = async () => {
    if (!S.approved || !S.compiled?.ok) return;
    const record = await window.LinerRecord.create({ spec: S.spec, version: S.version,
      title: `Rehab AI liner · ${S.persona.id} · v${S.version}`, review: S.review, measurement: S.measurement });
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `liner-v${record.version}-reviewed-build.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ---------- measure → learn ----------
  ['mRuler', 'mTop', 'mMid', 'mBot'].forEach(id => $(id).addEventListener('input', () => { S.measurementKind = S.measurementKind.includes('example') ? 'mixed_example_and_operator_input' : 'operator_entered_unverified'; }));
  $('exampleBtn').onclick = () => { S.measurementKind = 'example_values'; $('mRuler').value = 99; $('mTop').value = 41; $('mMid').value = 33; $('mBot').value = 19; $('learnOut').innerHTML = '<p class="hint">Invented values to preview the flow. Replace them with real measurements.</p>'; };
  $('learnBtn').onclick = () => {
    if (!S.approved || !S.compiled?.ok) return;
    const v = id => parseFloat($(id).value), m = { ruler_mm: v('mRuler'), overlap_mm: [v('mTop'), v('mMid'), v('mBot')] };
    if (!(m.ruler_mm > 0) || m.overlap_mm.some(Number.isNaN)) { $('learnOut').innerHTML = '<p class="hint">Enter the ruler and three overlaps first.</p>'; return; }
    setStage(4);
    const r = K.calibrateLiner(S.spec, m);
    S.measurement = { source: S.measurementKind, values: m, source_version: S.version };
    S.previous = S.compiled; S.calibration = r.calibration; S.version += 1; run(); setStage(5);
    $('learnOut').innerHTML = `<p>${r.explain.map(esc).join('<br>')}</p><p class="hint">${S.measurement.source.includes('example') ? 'Inputs contain example values, not verified physical measurements. ' : 'Operator-entered inputs; measurements are not independently verified. '}v${S.version} compiled (dashed outline = v${S.version - 1}). Approve and measure a new specimen before claiming improvement.</p>`;
    $('measureBox').hidden = true;
  };

  // ---------- phone scan import ----------
  $('scanFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    $('scanOut').innerHTML = '<p class="hint">Reading scan…</p>';
    try {
      const r = window.ScanCore.measureLeg(window.ScanCore.parseScan(f.name, await f.arrayBuffer()), { linerHeightMm: 150 });
      const q = r.quality.map(x => `<li class="${x.ok ? 'ok' : 'bad'}"><b>${x.ok ? '✓' : '✗'}</b>${esc(x.id.replace(/_/g, ' '))}: ${esc(x.detail)}</li>`).join('');
      $('scanOut').innerHTML = `<ul class="checks">${q}</ul>` + profileSvg(r);
      if (!r.ok) { $('scanOut').insertAdjacentHTML('afterbegin', '<p class="refusal">Scan not used: fix the issues below (rescan slowly, include knee to ankle) or enter tape measurements.</p>'); return; }
      ['circ_top_mm', 'circ_mid_mm', 'circ_bottom_mm'].forEach((k, i) => { S.leg[k] = Math.round(r.circ_mm[i]); });
      S.leg.source = 'phone_scan';
      $('legForm').querySelectorAll('input').forEach(el => { el.value = S.leg[el.dataset.k]; });
      $('legSource').textContent = 'from phone scan · check shin length & knee width';
      resetVersions(); S.userActed = true; run();
    } catch (err) { $('scanOut').innerHTML = `<p class="refusal">${esc(err.message)}</p>`; }
  };
  function profileSvg(r) {
    const W = 300, H = 90, p = r.profile, zmax = Math.max(...p.map(x => x.z)), gmin = Math.min(...p.map(x => x.girth_mm)) - 10, gmax = Math.max(...p.map(x => x.girth_mm)) + 10;
    const X = z => 8 + (W - 16) * z / zmax, Y = g => H - 12 - (H - 24) * (g - gmin) / (gmax - gmin);
    const line = p.map((x, i) => `${i ? 'L' : 'M'}${X(x.z).toFixed(1)} ${Y(x.girth_mm).toFixed(1)}`).join('');
    const marks = r.circ_mm.map((g, i) => { if (g == null) return ''; const near = p.reduce((a, b) => Math.abs(b.girth_mm - g) < Math.abs(a.girth_mm - g) ? b : a);
      return `<circle cx="${X(near.z)}" cy="${Y(g)}" r="3.5" fill="#ff7849"/><text x="${X(near.z)}" y="${Y(g) - 6}" fill="#edf4f3" font-size="9" text-anchor="middle">${Math.round(g)}</text>`; }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="profile"><path d="${line}" fill="none" stroke="#7ce7da" stroke-width="1.6"/>${marks}` +
      `<text x="8" y="${H - 2}" fill="#8995a3" font-size="8">knee</text><text x="${W - 8}" y="${H - 2}" fill="#8995a3" font-size="8" text-anchor="end">ankle · girth profile (mm)</text></svg>`;
  }

  // ---------- bridge for the Nemotron agent panel (liner-agent-ui.js) ----------
  window.LinerApp = {
    state: () => S,
    fillLeg(leg) { Object.assign(S.leg, leg); $('legForm').querySelectorAll('input').forEach(el => { el.value = S.leg[el.dataset.k]; }); $('legSource').textContent = S.leg.source || 'entered'; resetVersions(); },
    applyAgent(result) {
      // Loads the agent's code-computed spec into the compiler. Approval is NOT carried over: the operator must approve this version.
      const sp = result.spec; if (!sp) return false;
      const prev = S.compiled && S.compiled.ok ? S.compiled : null;
      S.leg = { ...result.input.leg }; S.intake = { ...result.input.intake };
      $('legForm').querySelectorAll('input').forEach(el => { el.value = S.leg[el.dataset.k]; });
      $('legSource').textContent = (S.leg.source || 'entered') + ' · via Nemotron agent';
      S.options = { height_mm: sp.liner.height_mm, foam_thickness_mm: sp.liner.foam_thickness_mm, overlap_mm: sp.liner.overlap_mm };
      S.calibration = null; S.measurement = null; S.review = null; S.approved = false; S.userActed = true;
      S.version = result.outcome.version || 1; S.previous = result.input.baseline ? prev : null;
      run();
      S.lastAgent = { version: S.version, leg: { ...S.leg }, options: { ...S.options } };
      return true;
    }
  };
  loadPersona(K.PERSONAS.P1); run();
})();
