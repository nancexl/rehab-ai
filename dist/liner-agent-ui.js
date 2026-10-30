// Nemotron agent panel: calls the server-side agent (key never reaches the browser) and renders its trace.
(() => {
  const $ = id => document.getElementById(id), app = window.LinerApp;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let status = null;

  fetch('./api/liner/status').then(r => r.ok ? r.json() : null).then(s => {
    status = s;
    $('modeTag').innerHTML = s && s.live_configured
      ? `<b></b> deterministic geometry · agent: ${esc(s.model)} on Nebius Token Factory`
      : '<b></b> local geometry · Nemotron agent not configured on this server';
    if (!s || !s.live_configured) { $('agentRunBtn').disabled = true; $('agentStatus').textContent = 'This copy is running without the agent API (static hosting or no key). Recorded live traces are in evidence/live/.'; }
  }).catch(() => { $('modeTag').innerHTML = '<b></b> local geometry · agent API unavailable'; $('agentRunBtn').disabled = true; });

  $('agentChangeBtn').onclick = () => {
    const S = app.state(), base = S.lastAgent ? S.lastAgent.leg : S.leg;
    app.fillLeg({ circ_top_mm: base.circ_top_mm + 7, circ_mid_mm: base.circ_mid_mm + 9, circ_bottom_mm: base.circ_bottom_mm + 8, source: 'synthetic' });
    $('agentStatus').textContent = 'Synthetic re-measurement loaded (not a real measurement). Run the agent to produce the next version.';
  };
  $('agentInvalidBtn').onclick = () => {
    app.fillLeg({ circ_mid_mm: 620, shin_length_mm: 200, source: 'synthetic' });
    $('agentStatus').textContent = 'Synthetic out-of-bounds input loaded. Run the agent: it should refuse.';
  };

  function stepHtml(t) {
    if (t.type === 'model') {
      const calls = t.tool_calls.length ? t.tool_calls.map(c => `<code>${esc(c.name)}(${esc(c.arguments === '{}' ? '' : c.arguments)})</code>`).join(' ') : '<i>final answer</i>';
      return `<li class="model"><b>Nemotron →</b> ${calls}<span class="meta">${esc(t.model_returned || t.model_requested)} · ${t.latency_ms} ms · ${t.usage.prompt_tokens}+${t.usage.completion_tokens} tokens</span></li>`;
    }
    if (t.type === 'tool') {
      const r = t.result || {}, brief = r.refused ? `REFUSED: ${r.reason}` : r.error ? `error: ${r.error}` :
        t.name === 'validate_measurements' ? (r.ok ? 'all measurements within bounds; in scope' : `FAILED: ${r.measurement_failures.map(f => `${f.field}=${f.value} (allowed ${f.allowed.join('–')})`).concat(r.scope_refusal_reasons).join('; ')}`) :
        t.name === 'compile_pattern' ? `v${r.version}: cut lengths ${r.cut_lengths_mm.join(' / ')} mm · ${r.checks_passed}/${r.checks_total} checks pass` :
        t.name === 'compare_with_baseline' ? `v${r.baseline_version} → v${r.new_version}: cut-length deltas ${r.cut_length_deltas_mm.map(d => (d >= 0 ? '+' : '') + d).join(' / ')} mm · differs: ${r.geometry_differs}` :
        t.name === 'prepare_build_record' ? `draft v${r.version}: ${r.status.replace(/_/g, ' ')} · ${r.template_pages} full-scale pages` : 'case loaded';
      return `<li class="tool${r.refused || r.error || r.ok === false ? ' err' : ''}"><b>compiler · ${esc(t.name)}</b><span class="meta">deterministic code · ${t.ms} ms</span><div>${esc(brief)}</div><details><summary>raw tool result</summary><pre>${esc(JSON.stringify(r, null, 1))}</pre></details></li>`;
    }
    return `<li class="err"><b>provider ${esc(t.code)}</b><span class="meta">${esc(t.model_requested)} · ${t.latency_ms || '?'} ms</span></li>`;
  }

  $('agentRunBtn').onclick = async () => {
    const S = app.state(), btn = $('agentRunBtn');
    const leg = { ...S.leg }, body = { case_label: `${S.persona.id} · browser run`, intake: S.intake, leg };
    if (S.lastAgent && ['circ_top_mm', 'circ_mid_mm', 'circ_bottom_mm', 'shin_length_mm', 'knee_width_mm'].some(k => S.lastAgent.leg[k] !== leg[k]))
      body.baseline = { version: S.lastAgent.version, leg: S.lastAgent.leg, options: S.lastAgent.options };
    btn.disabled = true; $('agentTrace').innerHTML = ''; $('agentOutcome').innerHTML = '';
    $('agentStatus').textContent = `Calling ${status ? status.model : 'Nemotron'} on Nebius Token Factory…`;
    const t0 = performance.now();
    try {
      const res = await fetch('./api/liner/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const r = await res.json();
      if (!res.ok && !r.trace) throw new Error(r.error || r.detail || `HTTP ${res.status}`);
      // Reveal steps one by one so the sequence is readable.
      for (const t of r.trace) { $('agentTrace').insertAdjacentHTML('beforeend', stepHtml(t)); await new Promise(ok => setTimeout(ok, 180)); }
      const o = r.outcome, audit = r.claim_audit;
      $('agentStatus').textContent = `${r.totals.model_calls} live model calls · ${r.totals.total_tokens} tokens · ${(r.totals.wall_ms / 1000).toFixed(1)} s server time · returned model ${r.model_returned}`;
      const auditHtml = audit.ok ? '<small>Claim audit: every number in the explanation appears in a tool result.</small>'
        : `<small class="bad">Claim audit flagged: ${esc(audit.unsupported_numbers.map(n => 'number ' + n).concat(audit.flags).join('; '))}. Trust the code-computed outcome, not the text.</small>`;
      let head = o.status === 'refused' ? `<b>Refused by the compiler.</b> No pattern compiled.` :
        o.status === 'compiled' || o.status === 'revised' ? `<b>v${o.version} compiled by code</b> · cut lengths ${o.cut_lengths_mm.join(' / ')} mm · ${o.checks_passed}/${o.checks_total} checks · human approval: <b>pending</b>` :
        `<b>Agent stopped: ${esc(o.status)}</b> (${esc(o.detail || r.stop_reason)})`;
      const badge = audit.ok ? '<span class="audit-badge ok" title="Every number in the explanation appears in a tool result">Claim audit ✓</span>'
        : '<span class="audit-badge bad" title="The explanation contains numbers not found in any tool result">Claim audit ⚠</span>';
      $('agentOutcome').innerHTML = `<div class="agent-outcome ${o.status === 'refused' ? 'refused' : 'ok'}">${badge}${head}<div class="final">${esc(r.final_text || '')}</div>${auditHtml}` +
        (r.spec ? '<div class="row"><button class="primary" id="agentApplyBtn" type="button">Load v' + o.version + ' into the compiler for my review →</button></div>' : '') + '</div>';
      if (r.spec) $('agentApplyBtn').onclick = () => { app.applyAgent(r); $('agentApplyBtn').disabled = true; $('agentApplyBtn').textContent = `v${o.version} loaded · review and approve it in the Device spec panel`; document.getElementById('preview').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    } catch (e) {
      $('agentStatus').textContent = `Agent call failed: ${e.message}. No live result is claimed.`;
    } finally { btn.disabled = false; }
    void t0;
  };
})();
