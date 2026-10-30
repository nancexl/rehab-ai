'use strict';
// Nemotron (via Nebius Token Factory) agent that drives the deterministic liner compiler.
// Authority split: the model only chooses which bounded tool to call next, picks option values
// inside fixed bounds, and explains. Every number (bounds checks, cut lengths, hashes, outcome)
// comes from dist/liner-core.js. Human approval is never granted here: the agent can at most
// prepare a draft that waits for an operator to approve it in the browser.
// The API key is read from process.env on the server only and never enters a trace.
const crypto = require('node:crypto');
const path = require('node:path');
const core = require(path.join(__dirname, '..', 'dist', 'liner-core.js'));

const BASE_URL = 'https://api.tokenfactory.nebius.com/v1';
const DEFAULT_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
const FALLBACK_MODEL = 'nvidia/Nemotron-3_5-Lightning';
const LIMITS = { maxTurns: 8, maxToolCallsPerTurn: 3, maxTokens: 900, requestTimeoutMs: 30000, workflowTimeoutMs: 120000 };
const OPTION_BOUNDS = { height_mm: [100, 200], foam_thickness_mm: [3, 4, 5, 6], overlap_mm: [20, 50] };
const LEG_KEYS = ['circ_top_mm', 'circ_mid_mm', 'circ_bottom_mm', 'shin_length_mm', 'knee_width_mm'];
const SOURCES = ['example_values', 'synthetic', 'entered_by_user', 'phone_scan', 'operator_entered_unverified'];
const INTAKE_ENUMS = { side: ['right', 'left'], weight_bearing: ['non_weight_bearing', 'partial', 'full'], age_band: ['18-49', '50-69', '70+'],
  shower: ['tub', 'walk_in'], work: ['desk', 'standing', 'retired'] };
const INTAKE_BOOLS = ['balance_concern', 'knee_problem', 'lives_alone', 'stairs_at_home', 'outdoor_commute'];

const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const clone = v => JSON.parse(JSON.stringify(v));

// ---------- request sanitising (server boundary) ----------
function sanitizeLeg(leg) {
  if (!leg || typeof leg !== 'object') throw new Error('leg measurements are required');
  const out = {};
  for (const k of LEG_KEYS) {
    const v = leg[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 100000) throw new Error(`${k} must be a finite number`);
    out[k] = Math.round(v * 10) / 10;
  }
  out.source = SOURCES.includes(leg.source) ? leg.source : 'operator_entered_unverified';
  return out;
}
function sanitizeOptions(o = {}) {
  const out = {};
  if (o.height_mm !== undefined) out.height_mm = Number(o.height_mm);
  if (o.foam_thickness_mm !== undefined) out.foam_thickness_mm = Number(o.foam_thickness_mm);
  if (o.overlap_mm !== undefined) out.overlap_mm = Number(o.overlap_mm);
  const err = optionError(out);
  if (err) throw new Error('baseline options: ' + err);
  return out;
}
function sanitizeRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected a JSON object');
  const intakeIn = body.intake || {}, intake = {};
  for (const [k, allowed] of Object.entries(INTAKE_ENUMS)) intake[k] = allowed.includes(intakeIn[k]) ? intakeIn[k] : allowed[0];
  for (const k of INTAKE_BOOLS) intake[k] = intakeIn[k] === true;
  const req = { case_label: String(body.case_label || 'operator case').slice(0, 80), intake, leg: sanitizeLeg(body.leg), baseline: null,
    instruction: String(body.instruction || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 300) };
  if (body.baseline) {
    const b = body.baseline, version = Number(b.version);
    if (!Number.isInteger(version) || version < 1 || version > 99) throw new Error('baseline.version must be an integer 1–99');
    req.baseline = { version, leg: sanitizeLeg(b.leg), options: sanitizeOptions(b.options || {}) };
  }
  return req;
}

function optionError(o) {
  const [h0, h1] = OPTION_BOUNDS.height_mm, [v0, v1] = OPTION_BOUNDS.overlap_mm;
  if (o.height_mm !== undefined && !(Number.isInteger(o.height_mm) && o.height_mm >= h0 && o.height_mm <= h1)) return `height_mm must be an integer ${h0}–${h1}`;
  if (o.foam_thickness_mm !== undefined && !OPTION_BOUNDS.foam_thickness_mm.includes(o.foam_thickness_mm)) return `foam_thickness_mm must be one of ${OPTION_BOUNDS.foam_thickness_mm.join(', ')}`;
  if (o.overlap_mm !== undefined && !(Number.isInteger(o.overlap_mm) && o.overlap_mm >= v0 && o.overlap_mm <= v1)) return `overlap_mm must be an integer ${v0}–${v1}`;
  return null;
}

// ---------- tools ----------
const TOOLS = [
  ['read_case', 'Read the submitted case: intake answers, leg measurements with their provenance label, whether a previous version (baseline) exists, and the allowed option bounds. Call this first.', { type: 'object', properties: {}, additionalProperties: false }],
  ['validate_measurements', 'Deterministically check the leg measurements against the compiler bounds and the intake against the hands-free scope rules. Compilation is impossible until this passes.', { type: 'object', properties: {}, additionalProperties: false }],
  ['compile_pattern', 'Compile the contact-liner pattern (exact frustum development) from the validated measurements. You may choose liner options within bounds; omit them to use defaults (150 mm tall, 4 mm foam, 30 mm overlap). Returns cut lengths and engineering checks computed by code.',
    { type: 'object', properties: { height_mm: { type: 'integer', minimum: 100, maximum: 200 }, foam_thickness_mm: { type: 'integer', enum: [3, 4, 5, 6] }, overlap_mm: { type: 'integer', minimum: 20, maximum: 50 } }, additionalProperties: false }],
  ['compare_with_baseline', 'After compiling, compare the new pattern with the previous version (baseline): input deltas and cut-length deltas at top/middle/bottom, computed by code.', { type: 'object', properties: {}, additionalProperties: false }],
  ['prepare_build_record', 'Prepare an export draft for the compiled pattern. The draft is NOT approved: a human operator must review and approve this exact version in the browser before any template or record is exported.', { type: 'object', properties: {}, additionalProperties: false }],
].map(([name, description, parameters]) => ({ type: 'function', function: { name, description, parameters } }));
const TOOL_NAMES = TOOLS.map(t => t.function.name);

function legChecks(leg) {
  const B = core.BOUNDS, fails = [];
  const range = (k, [a, b]) => { if (!(leg[k] >= a && leg[k] <= b)) fails.push({ field: k, value: leg[k], allowed: [a, b] }); };
  range('circ_top_mm', B.circumferenceMm); range('circ_mid_mm', B.circumferenceMm); range('circ_bottom_mm', B.circumferenceMm);
  range('shin_length_mm', B.shinLengthMm); range('knee_width_mm', B.kneeWidthMm);
  const c = [leg.circ_top_mm, leg.circ_mid_mm, leg.circ_bottom_mm], taper = Math.max(...c) - Math.min(...c);
  if (taper > 90) fails.push({ field: 'taper', value: taper, allowed: [0, 90] });
  return fails;
}

function summarizeCompiled(compiled, spec) {
  return { ok: compiled.ok, height_mm: compiled.height_mm, cut_lengths_mm: compiled.cut_lengths_mm,
    pattern_width_mm: +(compiled.bounds.x1 - compiled.bounds.x0).toFixed(1), overlap_mm: compiled.overlap_mm,
    failed_checks: compiled.checks.filter(c => !c.ok).map(c => ({ id: c.id, detail: c.detail })),
    checks_passed: compiled.checks.filter(c => c.ok).length, checks_total: compiled.checks.length,
    options: { height_mm: spec.liner.height_mm, foam_thickness_mm: spec.liner.foam_thickness_mm, overlap_mm: spec.liner.overlap_mm },
    spec_sha256: sha256(JSON.stringify(spec)) };
}

function buildSpec(req, leg, options) {
  return core.makeLinerSpec({ persona: { intake: req.intake, leg }, leg: clone(leg), options: clone(options) });
}

function createSession(req) {
  return { req, validated: null, spec: null, compiled: null, options: null, draft: null, compare: null };
}

function runTool(session, name, args) {
  const req = session.req;
  if (!TOOL_NAMES.includes(name)) return { error: `unknown tool ${name}` };
  if (name === 'read_case') {
    return { case_label: req.case_label, intake: req.intake, leg: req.leg, measurement_provenance: req.leg.source,
      operator_instruction: req.instruction || null,
      baseline: req.baseline ? { version: req.baseline.version, leg: req.baseline.leg, options: req.baseline.options } : null,
      next_version: req.baseline ? req.baseline.version + 1 : 1, option_bounds: OPTION_BOUNDS,
      scope: 'Nonhuman fit-specimen contact liner for a commercial hands-free knee crutch. Not load-bearing. Not for patient use.' };
  }
  if (name === 'validate_measurements') {
    const failures = legChecks(req.leg), plan = core.planMobility(req.intake);
    session.validated = { ok: failures.length === 0 && plan.hands_free_recommended, measurement_failures: failures,
      scope_refusal_reasons: plan.refusal_reasons };
    return session.validated;
  }
  if (name === 'compile_pattern') {
    if (!session.validated) return { refused: true, reason: 'validate_measurements has not been run' };
    if (!session.validated.ok) return { refused: true, reason: 'validation failed; the compiler will not produce a pattern for this input', validation: session.validated };
    const err = optionError(args);
    if (err) return { refused: true, reason: err };
    session.options = clone(args);
    session.spec = buildSpec(req, req.leg, args);
    session.compiled = core.compileLiner(session.spec);
    session.draft = null; // any recompile invalidates an earlier draft
    return { version: req.baseline ? req.baseline.version + 1 : 1, ...summarizeCompiled(session.compiled, session.spec) };
  }
  if (name === 'compare_with_baseline') {
    if (!req.baseline) return { refused: true, reason: 'no baseline version was supplied' };
    if (!session.compiled) return { refused: true, reason: 'compile_pattern first' };
    const bSpec = buildSpec(req, req.baseline.leg, req.baseline.options), bComp = core.compileLiner(bSpec);
    const inputDeltas = {};
    for (const k of LEG_KEYS) if (req.leg[k] !== req.baseline.leg[k]) inputDeltas[k] = +(req.leg[k] - req.baseline.leg[k]).toFixed(1);
    const cutDeltas = session.compiled.cut_lengths_mm.map((v, i) => +(v - bComp.cut_lengths_mm[i]).toFixed(1));
    session.compare = { baseline_version: req.baseline.version, new_version: req.baseline.version + 1,
      input_deltas_mm: inputDeltas, baseline_cut_lengths_mm: bComp.cut_lengths_mm, new_cut_lengths_mm: session.compiled.cut_lengths_mm,
      cut_length_deltas_mm: cutDeltas, height_delta_mm: +(session.compiled.height_mm - bComp.height_mm).toFixed(1),
      baseline_spec_sha256: sha256(JSON.stringify(bSpec)), new_spec_sha256: sha256(JSON.stringify(session.spec)),
      geometry_differs: cutDeltas.some(d => d !== 0) || session.compiled.height_mm !== bComp.height_mm };
    return session.compare;
  }
  if (name === 'prepare_build_record') {
    if (!session.compiled) return { refused: true, reason: 'compile_pattern first' };
    if (!session.compiled.ok) return { refused: true, reason: 'compile checks failed; no export draft for a failing pattern' };
    const pages = ['liner', 'crest'].flatMap(layer => core.linerPages(session.compiled, { title: req.case_label, layer }));
    session.draft = { status: 'awaiting_human_approval', version: req.baseline ? req.baseline.version + 1 : 1,
      spec_sha256: sha256(JSON.stringify(session.spec)), template_pages: pages.length, template_scale: '1:1 mm, A4 landscape tiles with 100 mm ruler',
      approval_required: 'An operator must approve this exact version in the browser; editing or recompiling revokes approval.' };
    return session.draft;
  }
}

function validateArgs(name, args) {
  const tool = TOOLS.find(t => t.function.name === name);
  if (!tool) return `unknown tool ${name}`;
  const props = tool.function.parameters.properties;
  for (const k of Object.keys(args)) if (!(k in props)) return `unexpected argument ${k}`;
  return null;
}

function outcomeOf(session) {
  const v = session.validated;
  if (!v) return { status: 'incomplete', detail: 'validation never ran' };
  if (!v.ok) return { status: 'refused', detail: 'Input outside compiler bounds or hands-free scope; no pattern compiled.', measurement_failures: v.measurement_failures, scope_refusal_reasons: v.scope_refusal_reasons };
  if (!session.compiled) return { status: 'incomplete', detail: 'validated but not compiled' };
  if (!session.compiled.ok) return { status: 'blocked', detail: 'compiled but checks failed', ...summarizeCompiled(session.compiled, session.spec) };
  const base = { version: session.req.baseline ? session.req.baseline.version + 1 : 1, ...summarizeCompiled(session.compiled, session.spec),
    human_approval: 'pending', draft_prepared: !!session.draft };
  if (session.req.baseline) return { status: 'revised', ...base, comparison: session.compare };
  return { status: 'compiled', ...base };
}

const SYSTEM = [
  'You are the Rehab AI liner-compiler agent. You operate a deterministic compiler for a personalised contact liner (cuff) used with a commercial hands-free knee crutch, producing a full-scale pattern for a NONHUMAN fit specimen.',
  'Rules: (1) Call read_case first, then validate_measurements. (2) If validation fails, do NOT try to compile or alter the numbers; explain the refusal using the exact failing fields and bounds returned by the tool. (3) If it passes, call compile_pattern. Keep defaults unless the operator instruction or the measurements give a concrete reason; liner height plus 60 mm must fit the shin length. (4) If a baseline exists, call compare_with_baseline after compiling. (5) If the compiled pattern passes all checks, ALWAYS call prepare_build_record (for v1 and for revisions) before finishing; never say a draft exists unless that tool returned it. (6) Finish with a short plain-English summary (max 120 words) for an engineer.',
  'Never invent measurements, numbers, clinical claims or approval. Only quote numbers returned by tools. You cannot approve anything; a human must approve the exact version. Not medical advice, not load-bearing, not for patient use.',
].join('\n');

// Deterministic audit of the model's final text: every number it quotes must appear in a tool
// result or the case input, and it may only claim a draft/approval that the code actually produced.
function auditClaims(text, trace, session) {
  const known = new Set();
  const walk = v => { if (typeof v === 'number') { known.add(String(Math.abs(v))); known.add(String(Math.abs(+v.toFixed(1)))); }
    else if (typeof v === 'string') (v.match(/-?\d+(?:\.\d+)?/g) || []).forEach(n => known.add(String(Math.abs(+n))));
    else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  trace.filter(t => t.type === 'tool').forEach(t => walk(t.result));
  walk(session.req);
  const quoted = (String(text).replace(/sha\W?256/gi, ' ').replace(/[0-9a-f]{16,}/gi, ' ').replace(/\bv(\d+)\b/gi, ' ').match(/\d+(?:\.\d+)?/g) || []).map(n => String(+n));
  const unsupported = [...new Set(quoted.filter(n => !known.has(n) && !['1', '2', '3', '100', '120'].includes(n)))];
  const flags = [];
  if (/draft|build[ -]record/i.test(text) && /ready|prepared|created/i.test(text) && !session.draft) flags.push('claims an export draft that was never prepared');
  if (/\bapproved\b/i.test(text) && !/not (been )?approved|until|must|requires?|awaiting|pending/i.test(text)) flags.push('mentions approval; only a human can approve');
  return { numbers_quoted: quoted.length, unsupported_numbers: unsupported, flags, ok: unsupported.length === 0 && flags.length === 0 };
}

function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim().slice(0, 2000);
}

async function callModel({ key, model, messages, fetchImpl, deadline }) {
  const controller = new AbortController();
  const timeout = Math.max(1000, Math.min(LIMITS.requestTimeoutMs, deadline - Date.now()));
  const timer = setTimeout(() => controller.abort(), timeout);
  const started = Date.now();
  try {
    const res = await fetchImpl(`${BASE_URL}/chat/completions`, { method: 'POST', signal: controller.signal, redirect: 'error',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.1, max_tokens: LIMITS.maxTokens }) });
    const latency_ms = Date.now() - started;
    if (!res.ok) { const e = new Error(`provider_http_${res.status}`); e.latency_ms = latency_ms; e.code = `provider_http_${res.status}`; throw e; }
    const json = await res.json();
    return { json, latency_ms };
  } catch (e) {
    if (!e.code) { e.code = e.name === 'AbortError' ? 'provider_timeout' : 'provider_transport_error'; e.latency_ms = Date.now() - started; }
    throw e;
  } finally { clearTimeout(timer); }
}

function usageOf(json) {
  const u = (json && json.usage) || {};
  const n = v => (Number.isInteger(v) && v >= 0 && v < 1e7 ? v : 0);
  return { prompt_tokens: n(u.prompt_tokens), completion_tokens: n(u.completion_tokens), total_tokens: n(u.total_tokens) };
}

async function runLinerAgent(body, { key = process.env.NEBIUS_TOKEN_FACTORY_KEY, model = process.env.NEBIUS_MODEL || DEFAULT_MODEL, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const req = sanitizeRequest(body);
  if (!key) return { status: 'unavailable', error: 'missing_nebius_key', detail: 'The server has no Token Factory key configured; no model call was made.' };
  if (!/^nvidia\//i.test(model)) throw new Error('Only NVIDIA open models are allowed');
  const session = createSession(req);
  const started = Date.now(), deadline = started + LIMITS.workflowTimeoutMs;
  const trace = [], usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const messages = [{ role: 'system', content: SYSTEM },
    { role: 'user', content: `New case "${req.case_label}". ${req.baseline ? `A previous version v${req.baseline.version} exists; the measurements may have changed, so produce v${req.baseline.version + 1}.` : 'Produce v1.'} Operator instruction: ${req.instruction || '(none)'}` }];
  let modelUsed = model, returnedModel = null, finalText = '', stopReason = 'max_turns', callCount = 0, fellBack = false;
  for (let turn = 1; turn <= LIMITS.maxTurns; turn++) {
    if (Date.now() >= deadline) { stopReason = 'workflow_timeout'; break; }
    let resp;
    try {
      resp = await callModel({ key, model: modelUsed, messages, fetchImpl, deadline }); callCount++;
    } catch (e) {
      callCount++;
      trace.push({ step: trace.length + 1, type: 'provider_error', model_requested: modelUsed, code: e.code, latency_ms: e.latency_ms });
      if (!fellBack && modelUsed !== FALLBACK_MODEL) { fellBack = true; modelUsed = FALLBACK_MODEL; turn--; continue; }
      stopReason = e.code; break;
    }
    const { json, latency_ms } = resp, u = usageOf(json);
    for (const k in usage) usage[k] += u[k];
    returnedModel = typeof json.model === 'string' && /^[A-Za-z0-9_.:\/-]{1,120}$/.test(json.model) ? json.model : returnedModel;
    const choice = (json.choices || [])[0] || {}, msg = choice.message || {};
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls.slice(0, LIMITS.maxToolCallsPerTurn) : [];
    const text = stripThinking(msg.content);
    trace.push({ step: trace.length + 1, type: 'model', turn, model_requested: modelUsed, model_returned: returnedModel, latency_ms, usage: u,
      finish_reason: typeof choice.finish_reason === 'string' ? choice.finish_reason.slice(0, 40) : null,
      tool_calls: calls.map(c => ({ name: String(c.function && c.function.name).slice(0, 60), arguments: String(c.function && c.function.arguments || '{}').slice(0, 500) })),
      text: text || null });
    if (!calls.length) { finalText = text; stopReason = 'model_finished'; break; }
    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls.map((c, i) => ({ id: c.id || `call_${turn}_${i}`, type: 'function', function: { name: c.function.name, arguments: c.function.arguments || '{}' } })) });
    calls.forEach((c, i) => {
      const name = c.function && c.function.name;
      let args, result, t0 = Date.now();
      try { args = JSON.parse(c.function.arguments || '{}'); if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error(); }
      catch { args = null; }
      if (args === null) result = { error: 'arguments must be a JSON object' };
      else { const err = validateArgs(name, args); result = err ? { error: err } : runTool(session, name, args); }
      trace.push({ step: trace.length + 1, type: 'tool', name, arguments: args, result, ms: Date.now() - t0, authority: 'deterministic liner-core.js' });
      messages.push({ role: 'tool', tool_call_id: c.id || `call_${turn}_${i}`, content: JSON.stringify(result) });
    });
  }
  const outcome = outcomeOf(session);
  const claim_audit = auditClaims(finalText, trace, session);
  return { schema: 'rehab-liner-agent-trace/0.1', timestamp: now().toISOString(), provider: 'Nebius Token Factory', base_url: BASE_URL,
    model_requested: model, model_used: modelUsed, model_returned: returnedModel, fell_back: fellBack, case_label: req.case_label,
    input: { intake: req.intake, leg: req.leg, baseline: req.baseline, instruction: req.instruction || null },
    trace, final_text: finalText, claim_audit, stop_reason: stopReason, outcome,
    // Spec is returned so the browser can load it behind the existing human-approval gate.
    spec: session.compiled && session.compiled.ok ? session.spec : null,
    totals: { model_calls: callCount, ...usage, wall_ms: Date.now() - started },
    limits: LIMITS, authority: 'All numbers, checks and the outcome are computed by deterministic code; the model selects tools and explains.',
    provenance: { measurements: req.leg.source, physical_measurement_verified: false, clinical_validation: false, human_approval: 'not granted by agent' } };
}

module.exports = { runLinerAgent, auditClaims, sanitizeRequest, runTool, createSession, outcomeOf, TOOLS, DEFAULT_MODEL, FALLBACK_MODEL, OPTION_BOUNDS, LIMITS };
