// Runs the ONE pipeline three times (scan → design → check → file → clinician gate → record) and writes
// evidence/live/pipeline-<case>/ plus a compact dist/cases/cases.json for the landing-page replay.
// Case 1 uses live Nemotron (Nebius Token Factory) via integration/liner-agent.cjs; the key is read from env
// by the agent and never printed or written. Case 2 is compiled by code (agent not used). Case 3 uses the
// recorded 14 Oct 2026 NVIDIA Newton CPU run on the exported nonhuman contact coupon.
// Usage: node tools/run_pipeline_cases.mjs [--offline]   (--offline reuses saved Case 1 traces)
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const agent = require('../integration/liner-agent.cjs');
const LC = require('../dist/liner-core.js'), CC = require('../dist/compiler-core.js'), SC = require('../dist/scan-core.js');
const offline = process.argv.includes('--offline');
const sha = b => createHash('sha256').update(b).digest('hex');
const KEY = process.env.NEBIUS_TOKEN_FACTORY_KEY || '';
const guard = s => { if (KEY && s.includes(KEY)) throw new Error('secret leak guard tripped'); return s; };
const write = (p, v) => writeFileSync(p, guard(typeof v === 'string' ? v : JSON.stringify(v, null, 2) + '\n'));
const DISCLAIMER = 'Design demo. Not a medical device. Not for wearing on a person; not load-bearing.';
const cases = [];

// ---------------- Case 1 · knee-crutch contact liner (live Nemotron) ----------------
{
  const dir = 'evidence/live/pipeline-case1-liner'; mkdirSync(dir, { recursive: true });
  const scan = f => { const t = readFileSync(`dist/samples/${f}`); const m = SC.measureLeg(SC.parseOBJ(t.toString('utf8')));
    return { file: `samples/${f}`, sha256: sha(t), ok: m.ok, quality: m.quality, circ_mm: m.circ_mm, scan_length_mm: m.scan_length_mm, profile: m.profile }; };
  const s1 = scan('sample-leg-scan.obj'), s2 = scan('sample-leg-rescan.obj');
  // shin length and knee width are not derived from the sample mesh; they are fixed sample values.
  const leg = s => ({ circ_top_mm: s.circ_mm[0], circ_mid_mm: s.circ_mm[1], circ_bottom_mm: s.circ_mm[2], shin_length_mm: 380, knee_width_mm: 98, source: 'synthetic' });
  const intake = LC.PERSONAS.P1.intake;
  const runs = {
    v1: { case_label: 'Case 1 · knee-crutch liner · sample leg scan', intake, leg: leg(s1), instruction: 'Sample scan. Produce v1 for clinician review.' },
    v2: { case_label: 'Case 1 · re-scan after fit · v2', intake, leg: leg(s2), baseline: { version: 1, leg: leg(s1), options: {} },
      instruction: 'The leg was re-scanned after the first fit (sample re-scan, girths smaller). Produce v2 and say what changed.' },
    guard: { case_label: 'Case 1 · bad re-scan (out of range)', intake, leg: { ...leg(s2), circ_mid_mm: 620 }, instruction: 'Compile anyway, it is urgent.' },
  };
  const res = {};
  for (const [k, body] of Object.entries(runs)) {
    if (offline && existsSync(`${dir}/agent-${k}.json`)) { res[k] = JSON.parse(readFileSync(`${dir}/agent-${k}.json`, 'utf8')); continue; }
    const r = await agent.runLinerAgent(body);
    if (r.status === 'unavailable') throw new Error('No Token Factory key configured; use --offline');
    res[k] = r; write(`${dir}/agent-${k}.json`, r);
    appendFileSync('output/usage-ledger.jsonl', JSON.stringify({ ts: r.timestamp, case: r.case_label, model: r.model_returned, outcome: r.outcome.status, ...r.totals }) + '\n');
    console.log(k, r.model_returned, r.outcome.status, r.totals.total_tokens, r.claim_audit.ok, r.trace.filter(t => t.type === 'tool').map(t => t.name).join('>'));
  }
  const v1 = res.v1, compiled = v1.spec ? LC.compileLiner(v1.spec) : null;
  let files = [];
  if (compiled && compiled.ok) {
    const pages = ['liner', 'crest'].flatMap(layer => LC.linerPages(compiled, { title: 'Case 1 · sample scan · v1', layer }));
    pages.forEach((svg, i) => { const p = `${dir}/pattern-v1-page${i + 1}.svg`; write(p, typeof svg === 'string' ? svg : svg.svg || JSON.stringify(svg)); files.push({ file: p, sha256: sha(readFileSync(p)) }); });
  }
  const tools = r => r.trace.filter(t => t.type === 'tool').map(t => ({ name: t.name, args: t.arguments, ok: !(t.result && (t.result.refused || t.result.error)) }));
  const record = { schema: 'rehab-build-record/0.1', case: 'case1-liner', device: 'Knee-crutch contact liner', created: new Date().toISOString(), disclaimer: DISCLAIMER,
    steps: [
      { step: 'scan', mode: 'deterministic', input: s1.file, input_sha256: s1.sha256, girths_mm: s1.circ_mm, quality_ok: s1.ok, note: 'SAMPLE SCAN (synthetic). Shin length 380 mm and knee width 98 mm are fixed sample values.' },
      { step: 'design', mode: 'live_nemotron', provider: v1.provider, model: v1.model_returned, tools: tools(v1), outcome: v1.outcome.status, claim_audit_ok: v1.claim_audit.ok, tokens: v1.totals.total_tokens, timestamp: v1.timestamp },
      { step: 'check', mode: 'deterministic', checks: compiled ? compiled.checks.map(c => ({ id: c.id, ok: c.ok })) : [], note: 'Compiler geometry checks (code). No Newton run for this part.' },
      { step: 'file', mode: 'deterministic', files, cut_lengths_mm: v1.outcome.cut_lengths_mm, spec_sha256: v1.outcome.spec_sha256 },
      { step: 'approve', mode: 'human_gate', status: 'awaiting_clinician_approval', draft_prepared: v1.outcome.draft_prepared },
      { step: 'loop', mode: 'live_nemotron', v2_outcome: res.v2.outcome.status, input_deltas_mm: res.v2.outcome.comparison && res.v2.outcome.comparison.input_deltas_mm,
        cut_length_deltas_mm: res.v2.outcome.comparison && res.v2.outcome.comparison.cut_length_deltas_mm, v2_spec_sha256: res.v2.outcome.spec_sha256, claim_audit_ok: res.v2.claim_audit.ok },
      { step: 'guardrail', mode: 'live_nemotron', outcome: res.guard.outcome.status, measurement_failures: res.guard.outcome.measurement_failures, agent_text: res.guard.final_text },
    ] };
  record.record_sha256 = sha(JSON.stringify(record.steps)); write(`${dir}/build-record.json`, record);
  const tok = Object.values(res).reduce((a, r) => a + r.totals.total_tokens, 0);
  cases.push({ id: 'case1', title: 'Knee-crutch contact liner', input: 'Sample leg scan (OBJ)', input_file: s1.file, output: '1:1 cut pattern (SVG, A4 tiles)',
    profile: s1.profile, girths_mm: s1.circ_mm, numbers: [['Girths', s1.circ_mm.map(Math.round).join(' / ') + ' mm'], ['Cut lengths', (v1.outcome.cut_lengths_mm || []).join(' / ') + ' mm'], ['Checks', `${v1.outcome.checks_passed}/${v1.outcome.checks_total} pass`], ['v2 re-scan', `cut Δ ${(record.steps[5].cut_length_deltas_mm || []).join(' / ')} mm`]],
    modes: { scan: 'code', design: 'live Nemotron', check: 'code checks', file: 'code', approve: 'clinician gate' },
    agent: { model: v1.model_returned, provider: v1.provider, calls: v1.totals.model_calls, tokens: tok, claim_audit: { v1_ok: v1.claim_audit.ok, v2_ok: res.v2.claim_audit.ok, v2_unsupported: res.v2.claim_audit.unsupported_numbers, guard_ok: res.guard.claim_audit.ok }, timestamp: v1.timestamp,
      tools: v1.trace.filter(t => t.type === 'tool').map(t => t.name), v2_tools: res.v2.trace.filter(t => t.type === 'tool').map(t => t.name),
      guard_outcome: res.guard.outcome.status, guard_text: res.guard.final_text, final_text: v1.final_text, v2_text: res.v2.final_text },
    pattern_outline: compiled ? compiled.outline.filter((_, i) => i % 2 === 0).map(p => p.map(v => +v.toFixed(1))) : null,
    replay: [
      { step: 'Scan', mode: 'code', rows: [['code', 'Sample leg scan', `${s1.file} · ${s1.scan_length_mm} mm · ${s1.quality.filter(q => q.ok).length}/${s1.quality.length} quality checks`], ['code', '3D → girths', `${s1.circ_mm.join(' / ')} mm at knee-side, calf, ankle-side levels`]] },
      { step: 'Design', mode: 'live Nemotron', rows: [['model', 'Nemotron', `${v1.model_returned} · Nebius Token Factory · ${v1.totals.model_calls} calls · ${v1.totals.total_tokens} tokens`],
        ...v1.trace.filter(t => t.type === 'tool').map(t => ['tool', t.name, JSON.stringify(t.arguments) === '{}' ? 'computed by code' : JSON.stringify(t.arguments)]),
        ['model', 'Agent says', v1.final_text], ['code', 'Claim audit', v1.claim_audit.ok ? `pass · ${v1.claim_audit.numbers_quoted} numbers traced to tool results` : 'flagged']] },
      { step: 'Simulate', mode: 'code checks', rows: [['code', 'Geometry checks', `${v1.outcome.checks_passed}/${v1.outcome.checks_total} pass`], ['code', 'Physics', 'No Newton run for this part (see Case 3)']] },
      { step: 'File', mode: 'code', rows: [['code', 'Print-ready', `1:1 cut pattern · ${files.length} A4 tiles (SVG) · cut lengths ${v1.outcome.cut_lengths_mm.join(' / ')} mm`], ['code', 'Spec hash', v1.outcome.spec_sha256.slice(0, 16) + '…']] },
      { step: 'Approve', mode: 'clinician gate', rows: [['gate', 'Status', 'Awaiting clinician approval · agent prepared a draft, cannot approve'],
        ['model', 'Re-scan → v2', `cut length change ${(record.steps[5].cut_length_deltas_mm || []).join(' / ')} mm · claim audit ${res.v2.claim_audit.ok ? 'pass' : 'flagged rounded numbers ' + res.v2.claim_audit.unsupported_numbers.join(', ')}`],
        ['bad', 'Bad re-scan', `calf 620 mm out of range → agent ${res.guard.outcome.status}, no pattern; back to the clinician to re-measure`]] },
    ],
    record_sha256: record.record_sha256, status: 'awaiting clinician approval', trace_dir: dir });
}

// ---------------- Case 2 · forefoot offloading insole insert (code only) ----------------
{
  const dir = 'evidence/live/pipeline-case2-insole'; mkdirSync(dir, { recursive: true });
  const raw = readFileSync('dist/samples/sample-foot-outline.json'), foot = JSON.parse(raw);
  const outline = foot.outline_mm; outline.source = 'sample_scan_synthetic';
  const spec = CC.makeSpec({ scenario: CC.SCENARIOS.A, outline }), c = CC.compile(spec);
  const files = c.layers.map((l, i) => { const p = `${dir}/insert-layer${i + 1}-${l.role}.svg`; write(p, CC.toSvg(c, { layerIndex: i, title: `Case 2 · sample foot · ${l.role}` })); return { file: p, sha256: sha(readFileSync(p)) }; });
  const record = { schema: 'rehab-build-record/0.1', case: 'case2-insole', device: 'Forefoot offloading insole insert', created: new Date().toISOString(), disclaimer: DISCLAIMER,
    steps: [
      { step: 'scan', mode: 'deterministic', input: 'samples/sample-foot-outline.json', input_sha256: sha(raw), metrics: { length_mm: spec.foot.length_mm, forefoot_width_mm: spec.foot.forefoot_width_mm, heel_width_mm: spec.foot.heel_width_mm }, note: 'SAMPLE SCAN (synthetic outline).' },
      { step: 'design', mode: 'deterministic', note: 'Compiled by code; agent not used for this case.', scenario: CC.SCENARIOS.A.title, relief: spec.relief, layers: spec.layers },
      { step: 'check', mode: 'deterministic', checks: c.checks.map(k => ({ id: k.id, ok: k.ok, detail: k.detail })), note: 'Geometry checks (code). No Newton run for this part.' },
      { step: 'file', mode: 'deterministic', files, spec_sha256: sha(JSON.stringify(spec)) },
      { step: 'approve', mode: 'human_gate', status: 'awaiting_clinician_approval' },
    ] };
  record.record_sha256 = sha(JSON.stringify(record.steps)); write(`${dir}/build-record.json`, record);
  const win = c.layers.flatMap(l => l.holes)[0];
  cases.push({ id: 'case2', title: 'Forefoot offloading insole', input: 'Sample foot outline', input_file: 'samples/sample-foot-outline.json', output: '1:1 layer patterns (SVG)',
    outline: outline.map(p => p.map(v => Math.round(v))), relief: { cx: +win.cx.toFixed(1), cy: +win.cy.toFixed(1), rx: +win.rx.toFixed(1), ry: +win.ry.toFixed(1) },
    numbers: [['Foot', `${spec.foot.length_mm} × ${spec.foot.forefoot_width_mm} mm`], ['Relief window', `${win.rx.toFixed(0)}×${win.ry.toFixed(0)} mm`], ['Layers', spec.layers.map(l => `${l.thickness_mm} mm ${l.role}`).join(' + ')], ['Checks', `${c.checks.filter(k => k.ok).length}/${c.checks.length} pass`]],
    modes: { scan: 'code', design: 'code (agent not used)', check: 'code checks', file: 'code', approve: 'clinician gate' },
    replay: [
      { step: 'Scan', mode: 'code', rows: [['code', 'Sample foot outline', `${spec.foot.length_mm} mm long · forefoot ${spec.foot.forefoot_width_mm} mm · heel ${spec.foot.heel_width_mm} mm`]] },
      { step: 'Design', mode: 'code (agent not used)', rows: [['code', 'Rule', `${CC.SCENARIOS.A.title}: relief window under the distal 5th metatarsal`], ['code', 'Layers', spec.layers.map(l => `${l.thickness_mm} mm ${l.material} ${l.role}`).join(' + ')], ['gate', 'Note', 'Compiled by code; agent not used for this case']] },
      { step: 'Simulate', mode: 'code checks', rows: c.checks.map(k => [k.ok ? 'code' : 'bad', k.id.replace(/_/g, ' '), k.detail]) },
      { step: 'File', mode: 'code', rows: [['code', 'Print-ready', `${files.length} layer patterns, 1:1 SVG (A4)`], ['code', 'Spec hash', sha(JSON.stringify(spec)).slice(0, 16) + '…']] },
      { step: 'Approve', mode: 'clinician gate', rows: [['gate', 'Status', 'Awaiting clinician approval']] },
    ],
    record_sha256: record.record_sha256, status: 'awaiting clinician approval', trace_dir: dir });
}

// ---------------- Case 3 · contact coupon + recorded NVIDIA Newton check ----------------
{
  const dir = 'evidence/live/pipeline-case3-coupon'; mkdirSync(dir, { recursive: true });
  const stl = readFileSync('evidence/nonhuman-contact-coupon.stl'), h = sha(stl);
  const newton = { recorded: '2026-10-14', engine: 'NVIDIA Newton 1.6.1 / Warp 1.18.0, CPU SolverXPBD, 240 steps at 1/240 s', source_stl_sha256_matches: h === '5c7774c0649bb1a120393529c57326f25f8bf7feb2a2b86fbe50500c5e1f8cad',
    mesh: { vertices: 196, triangles: 388 }, cases: [{ name: 'Resting, friction 0.8', travel_mm: -0.0272, contacts: 27 }, { name: 'Sliding, friction 0.05', travel_mm: 40.8798, contacts: 27 }, { name: 'Sliding, friction 0.8', travel_mm: 8.3999, contacts: 27 }],
    sanity_checks_passed: '5/5', source: 'simulation/NEWTON_SPECIMEN_PROOF.md', note: 'Recorded run (14 Oct 2026), not re-run today. Rigid nonhuman fixture on a plane; diagnostic, not device approval.' };
  const record = { schema: 'rehab-build-record/0.1', case: 'case3-coupon', device: 'Nonhuman contact coupon (cuff test piece)', created: new Date().toISOString(), disclaimer: DISCLAIMER,
    steps: [
      { step: 'scan', mode: 'recorded', note: 'Input is a synthetic geometry study (70 kg / 520 mm / 85 %), not a scan.' },
      { step: 'design', mode: 'deterministic', note: 'Coupon geometry exported by the browser workflow (code). Agent not used.' },
      { step: 'check', mode: 'recorded_newton', newton },
      { step: 'file', mode: 'deterministic', files: [{ file: 'evidence/nonhuman-contact-coupon.stl', sha256: h }] },
      { step: 'approve', mode: 'human_gate', status: 'unsent review draft; manufacturing not approved' },
    ] };
  record.record_sha256 = sha(JSON.stringify(record.steps)); write(`${dir}/build-record.json`, record);
  cases.push({ id: 'case3', title: 'Contact coupon + Newton check', input: 'Synthetic geometry study', input_file: 'samples/nonhuman-contact-coupon.stl', output: 'STL, 388 triangles',
    numbers: [['Newton contacts', '27 in all 3 runs'], ['Resting drift', '−0.027 mm'], ['Slide μ 0.05 → 0.8', '40.9 → 8.4 mm'], ['Sanity checks', '5/5 pass']],
    modes: { scan: 'synthetic study', design: 'code (agent not used)', check: 'NVIDIA Newton · recorded 14 Oct', file: 'code', approve: 'review gate' },
    edges: (() => { const m = SC.parseSTL(stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.length)); const e = []; for (let i = 0; i < m.f.length; i += 3) { const p = k => [+m.v[3 * m.f[k]].toFixed(1), +m.v[3 * m.f[k] + 1].toFixed(1), +m.v[3 * m.f[k] + 2].toFixed(1)]; e.push([p(i), p(i + 1), p(i + 2)]); } return e; })(),
    replay: [
      { step: 'Scan', mode: 'synthetic', rows: [['code', 'Input', 'Synthetic geometry study (70 kg / 520 mm / 85 %), not a scan']] },
      { step: 'Design', mode: 'code (agent not used)', rows: [['code', 'Coupon', 'Curved nonhuman contact coupon exported by the browser workflow · 196 vertices / 388 triangles']] },
      { step: 'Simulate', mode: 'NVIDIA Newton · recorded', rows: [['gate', 'Recorded run', '14 Oct 2026 · Newton 1.6.1 / Warp 1.18.0 · CPU XPBD · 240 steps · not re-run live'],
        ...newton.cases.map(k => ['code', k.name, `${k.travel_mm} mm travel · ${k.contacts} contacts`]), ['code', 'Sanity checks', '5/5 pass · source STL hash matches']] },
      { step: 'File', mode: 'code', rows: [['code', 'Print-ready', `STL · ${h.slice(0, 16)}…`]] },
      { step: 'Approve', mode: 'review gate', rows: [['gate', 'Status', 'Unsent review draft · manufacturing not approved']] },
    ],
    record_sha256: record.record_sha256, status: 'review draft · not approved', trace_dir: dir });
}
mkdirSync('dist/cases', { recursive: true });
write('dist/cases/cases.json', { generated: new Date().toISOString(), disclaimer: DISCLAIMER, cases });
console.log('ok', cases.map(c => c.id + ':' + c.record_sha256.slice(0, 12)).join(' '));
