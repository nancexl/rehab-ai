(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./liner-core.js') : root.LinerCore);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LinerRecord = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  const clone = value => JSON.parse(JSON.stringify(value));
  async function sha256(text) {
    const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function create({ spec, title, version, review, measurement = null }) {
    if (!review || review.decision !== 'approved_for_nonhuman_specimen' || !review.timestamp)
      throw new Error('Operator review required before export');
    const snapshot = clone(spec), compiled = core.compileLiner(snapshot);
    if (!compiled.ok) throw new Error('Current compilation checks must pass');
    if (!Number.isInteger(version) || version < 1) throw new Error('Invalid revision');
    if (measurement && !['example_values', 'operator_entered_unverified', 'mixed_example_and_operator_input'].includes(measurement.source))
      throw new Error('Explicit measurement provenance required');
    const pages = ['liner', 'crest'].flatMap(layer => core.linerPages(compiled, { title, layer }));
    const templates = await Promise.all(pages.map(async (svg, index) => ({
      file: `liner-v${version}-page${index + 1}.svg`, units: 'mm', svg, sha256: await sha256(svg)
    })));
    return { schema_version: 'liner-build-record/0.1', record_id: globalThis.crypto.randomUUID(),
      timestamp: new Date().toISOString(), version, title, spec: snapshot,
      spec_sha256: await sha256(JSON.stringify(snapshot)), compiled, templates,
      review: { ...clone(review), operator_identity_verified: false, approval_authenticity_verified: false },
      calibration_inputs: measurement ? clone(measurement) : null,
      provenance: { dimensions: snapshot.leg.source || 'unknown', model_called: false,
        physical_measurement_verified: false, clinical_validation: false },
      scope: 'Nonhuman contact-liner fit specimen; not medical-device or patient-use approval.',
      hash_scope: 'Byte consistency only; not a signature or proof of operator or measurement authenticity.' };
  }
  return { create, sha256 };
});
