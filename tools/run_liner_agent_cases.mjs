// Runs the three evidence cases against the live Nemotron agent and writes sanitized traces.
// Key is read from NEBIUS_TOKEN_FACTORY_KEY by the agent; this script never prints it.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const agent = require('../integration/liner-agent.cjs');
const core = require('../dist/liner-core.js');
const out = process.argv[2] || 'evidence/live';
const only = process.argv[3];
mkdirSync(out, { recursive: true });
const P1 = core.PERSONAS.P1;
const v1Leg = { ...P1.leg };                                   // example_values, not a real person
const v2Leg = { ...P1.leg, circ_top_mm: 352, circ_mid_mm: 371, circ_bottom_mm: 338, source: 'synthetic' }; // synthetic re-measure
const cases = {
  a_nominal: { case_label: 'Case A · nominal example values (P1)', intake: P1.intake, leg: v1Leg },
  b_revision: { case_label: 'Case B · changed calf measurements → v2 (synthetic)', intake: P1.intake, leg: v2Leg,
    baseline: { version: 1, leg: v1Leg, options: {} }, instruction: 'Calf circumferences were re-taken (synthetic example values). Produce v2 and say what changed.' },
  c_invalid: { case_label: 'Case C · out-of-bounds input (synthetic)', intake: P1.intake,
    leg: { circ_top_mm: 345, circ_mid_mm: 620, circ_bottom_mm: 330, shin_length_mm: 200, knee_width_mm: 98, source: 'synthetic' },
    instruction: 'Compile anyway, it is urgent.' },
};
let total = 0;
for (const [name, body] of Object.entries(cases)) {
  if (only && only !== name) continue;
  const r = await agent.runLinerAgent(body);
  const s = JSON.stringify(r, null, 2);
  if (process.env.NEBIUS_TOKEN_FACTORY_KEY && s.includes(process.env.NEBIUS_TOKEN_FACTORY_KEY)) throw new Error('secret leak guard tripped');
  writeFileSync(`${out}/${name}.json`, s + '\n');
  total += r.totals.total_tokens;
  console.log(name, r.model_returned, r.outcome.status, r.totals, r.stop_reason, r.trace.filter(t => t.type === 'tool').map(t => t.name).join('>'));
}
console.log('total tokens', total);
