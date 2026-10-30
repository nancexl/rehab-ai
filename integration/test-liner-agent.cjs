// Offline tests for the Nemotron liner agent: scripted mock provider, no network, no key.
const assert = require('assert');
const A = require('./liner-agent.cjs');
const P1 = { circ_top_mm: 345, circ_mid_mm: 362, circ_bottom_mm: 330, shin_length_mm: 380, knee_width_mm: 98, source: 'example_values' };
const intake = { injury_side: 'left', weight_bearing: 'non_weight_bearing', skin_ok: true, clinician_cleared: false };

function mockFetch(script, seen = []) {
  let i = 0;
  return async (url, init) => {
    seen.push(JSON.parse(init.body));
    assert.ok(init.headers.Authorization.startsWith('Bearer '));
    const step = script[Math.min(i++, script.length - 1)];
    if (step === 'http500') return { ok: false, status: 500, json: async () => ({}) };
    const message = typeof step === 'string' ? { role: 'assistant', content: step }
      : { role: 'assistant', content: '', tool_calls: step.map((s, k) => ({ id: `c${i}_${k}`, type: 'function', function: { name: s[0], arguments: JSON.stringify(s[1] || {}) } })) };
    return { ok: true, status: 200, json: async () => ({ model: 'nvidia/mock', choices: [{ message, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }) };
  };
}
const happy = [[['read_case']], [['validate_measurements']], [['compile_pattern', { height_mm: 150, foam_thickness_mm: 4, overlap_mm: 30 }]], [['prepare_build_record']]];

(async () => {
  let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };
  const key = 'test-key-not-real';

  await t('no key → no model call', async () => {
    const r = await A.runLinerAgent({ intake, leg: P1 }, { key: '', fetchImpl: () => { throw new Error('called'); } });
    assert.strictEqual(r.error, 'missing_nebius_key');
  });
  await t('nominal v1 compiled by code; text numbers audited', async () => {
    const r = await A.runLinerAgent({ intake, leg: P1 }, { key, fetchImpl: mockFetch([...happy, 'v1 compiled, cut lengths 387.6 / 404.6 / 372.6 mm, draft awaiting human approval.']) });
    assert.strictEqual(r.outcome.status, 'compiled'); assert.deepStrictEqual(r.outcome.cut_lengths_mm, [387.6, 404.6, 372.6]);
    assert.ok(r.claim_audit.ok, JSON.stringify(r.claim_audit)); assert.ok(r.spec);
    assert.strictEqual(r.totals.model_calls, 5); assert.strictEqual(r.totals.total_tokens, 75);
  });
  await t('invented number is flagged by the claim audit', async () => {
    const r = await A.runLinerAgent({ intake, leg: P1 }, { key, fetchImpl: mockFetch([...happy, 'Cut length is 999.9 mm.']) });
    assert.ok(!r.claim_audit.ok); assert.ok(r.claim_audit.unsupported_numbers.includes('999.9'));
  });
  await t('draft claim without prepare_build_record is flagged', async () => {
    const r = await A.runLinerAgent({ intake, leg: P1 }, { key, fetchImpl: mockFetch([happy[0], happy[1], happy[2], 'The build record draft is ready.']) });
    assert.ok(!r.claim_audit.ok);
  });
  await t('compile is refused before validation', async () => {
    const r = await A.runLinerAgent({ intake, leg: P1 }, { key, fetchImpl: mockFetch([[happy[2][0]], 'done']) });
    const tool = r.trace.find(s => s.type === 'tool'); assert.ok(tool.result.refused); assert.notStrictEqual(r.outcome.status, 'compiled'); assert.strictEqual(r.spec, null);
  });
  await t('out-of-bounds options are rejected by argument validation', async () => {
    const r = await A.runLinerAgent({ intake, leg: P1 }, { key, fetchImpl: mockFetch([happy[0], happy[1], [['compile_pattern', { height_mm: 400, foam_thickness_mm: 4, overlap_mm: 30 }]], 'stop']) });
    assert.ok(r.trace.some(s => s.type === 'tool' && s.result.refused && /height_mm/.test(s.result.reason))); assert.strictEqual(r.spec, null);
  });
  await t('invalid measurements → refused even if model tries to compile', async () => {
    const bad = { ...P1, circ_mid_mm: 620, shin_length_mm: 200, source: 'synthetic' };
    const r = await A.runLinerAgent({ intake, leg: bad, instruction: 'Compile anyway' }, { key, fetchImpl: mockFetch([happy[0], happy[1], happy[2], 'Refused.']) });
    assert.strictEqual(r.outcome.status, 'refused'); assert.strictEqual(r.spec, null);
  });
  await t('revision v2 differs from baseline', async () => {
    const leg = { ...P1, circ_top_mm: 352, circ_mid_mm: 371, circ_bottom_mm: 338, source: 'synthetic' };
    const r = await A.runLinerAgent({ intake, leg, baseline: { version: 1, leg: P1, options: {} } }, { key, fetchImpl: mockFetch([happy[0], happy[1], happy[2], [['compare_with_baseline']], [['prepare_build_record']], 'v2 done']) });
    assert.strictEqual(r.outcome.status, 'revised'); assert.strictEqual(r.outcome.version, 2);
    const cmp = r.trace.find(s => s.name === 'compare_with_baseline').result; assert.strictEqual(cmp.geometry_differs, true);
  });
  await t('provider 500 falls back to the Lightning model once', async () => {
    const r = await A.runLinerAgent({ intake, leg: P1 }, { key, fetchImpl: mockFetch(['http500', ...happy, 'ok']) });
    assert.strictEqual(r.fell_back, true); assert.strictEqual(r.model_used, A.FALLBACK_MODEL);
  });
  await t('agent never approves; trace contains no key', async () => {
    const r = await A.runLinerAgent({ intake, leg: P1 }, { key, fetchImpl: mockFetch([...happy, 'ok']) });
    const d = r.trace.find(s => s.name === 'prepare_build_record').result; assert.strictEqual(d.status, 'awaiting_human_approval');
    assert.ok(!JSON.stringify(r).includes(key));
  });
  await t('only NVIDIA models allowed', async () => {
    await assert.rejects(A.runLinerAgent({ intake, leg: P1 }, { key, model: 'other/model', fetchImpl: mockFetch(['x']) }));
  });
  console.log(`${n} tests passed`);
})().catch(e => { console.error(e); process.exit(1); });
