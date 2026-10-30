import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../dist/liner-core.js'), R = require('../dist/liner-record.js');
const spec = () => L.makeLinerSpec({persona: L.PERSONAS.P1});
const review = {decision: 'approved_for_nonhuman_specimen', timestamp: '2026-10-22T12:00:00Z'};

test('reviewed record binds one spec snapshot to exact full-scale templates and hashes', async () => {
  const input = spec(), record = await R.create({spec: input, title: 'P1 v1', version: 1, review});
  input.leg.circ_top_mm = 999;
  assert.equal(record.spec.leg.circ_top_mm, 345);
  assert.equal(record.spec_sha256, await R.sha256(JSON.stringify(record.spec)));
  assert.equal(record.templates.length, L.linerPages(record.compiled).length + 1);
  for (const page of record.templates) assert.equal(page.sha256, await R.sha256(page.svg));
  assert.equal(record.review.approval_authenticity_verified, false);
  assert.equal(record.provenance.model_called, false);
});

test('unreviewed or failed compilation cannot become an approved build record', async () => {
  await assert.rejects(R.create({spec: spec(), title: '', version: 1, review: null}), /review required/);
  const bad = spec(); bad.leg.circ_mid_mm = 900;
  await assert.rejects(R.create({spec: bad, title: '', version: 1, review}), /checks must pass/);
});

test('example and mixed calibration inputs remain labelled and never verify physical measurements', async () => {
  for (const source of ['example_values', 'mixed_example_and_operator_input', 'operator_entered_unverified']) {
    const measurement = {source, source_version: 1, values: {ruler_mm: 99, overlap_mm: [41, 33, 19]}};
    const record = await R.create({spec: spec(), title: '', version: 2, review, measurement});
    assert.equal(record.calibration_inputs.source, source);
    assert.equal(record.provenance.physical_measurement_verified, false);
  }
  await assert.rejects(R.create({spec: spec(), title: '', version: 2, review, measurement: {source: 'measured_verified'}}), /provenance required/);
});
