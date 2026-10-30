// Two entry views on /liner.html: "I'm on crutches" (crutch user view) and "I'm a technician" (technician view).
// The crutch user view never builds or approves anything: it only checks inputs against compiler ranges
// and prepares a summary for a technician. Approval exists only in the technician view (Device spec panel).
(() => {
  const K = window.LinerCore, $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const VIEWS = { crutch: 'crutch', patient: 'crutch', user: 'crutch', tech: 'tech', technician: 'tech' };

  function setView(v, push) {
    const view = VIEWS[v] || null;
    document.body.dataset.view = view || 'choose';
    $('patientView').hidden = view !== 'crutch';
    $('techView').hidden = view !== 'tech';
    $('choosePatient').setAttribute('aria-selected', String(view === 'crutch'));
    $('chooseTech').setAttribute('aria-selected', String(view === 'tech'));
    if (push) {
      const u = new URL(location.href); u.searchParams.set('view', view); history.replaceState(null, '', u);
      const target = view === 'crutch' ? $('patientView') : $('techView');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  document.querySelectorAll('.choose').forEach(b => b.onclick = () => setView(b.dataset.view === 'patient' ? 'crutch' : 'tech', true));

  // ---------- crutch user view ----------
  const PAIN = [['shin', 'Front of the shin'], ['knee', 'Knee'], ['straps', 'Straps dig in'], ['donning', 'Putting it on / taking it off'],
    ['upper', 'Hands, wrists or shoulders'], ['good_leg', 'My other (good) leg']];
  const LEG = [['circ_top_mm', 'Around the calf, just below the knee'], ['circ_mid_mm', 'Around the calf, 7.5 cm lower'], ['circ_bottom_mm', 'Around the calf, 15 cm lower'],
    ['shin_length_mm', 'Shin length, knee crease to ankle bone'], ['knee_width_mm', 'Width across the knee']];
  const PLAIN = { circ_top_in_range: 'calf just below the knee', circ_mid_in_range: 'calf 7.5 cm lower', circ_bottom_in_range: 'calf 15 cm lower',
    shin_length_in_range: 'shin length', knee_width_in_range: 'knee width', liner_fits_shin: 'shin length (the liner needs room above the ankle)',
    taper_plausible: 'the change in calf size between the three measurements' };
  $('ptPain').innerHTML = PAIN.map(([k, l]) => `<label class="chk"><input type="checkbox" data-pain="${k}"> ${l}</label>`).join('');
  $('ptLeg').innerHTML = LEG.map(([k, l]) => `<label>${l}<span class="cm"><input type="number" inputmode="decimal" step="0.1" min="0" data-leg="${k}" placeholder="cm"> cm</span></label>`).join('');
  $('ptExample').onclick = () => {
    const ex = K.PERSONAS.P1.leg; $('ptLeg').querySelectorAll('input').forEach(el => { el.value = (ex[el.dataset.leg] / 10).toFixed(1); });
    $('ptLeg').dataset.example = '1'; $('ptResult').innerHTML = '';
  };
  $('ptLeg').addEventListener('input', () => { delete $('ptLeg').dataset.example; });

  function readCrutchUser() {
    const intake = { side: $('ptSide').value, weight_bearing: $('ptWb').value, age_band: $('ptAge').value,
      balance_concern: $('ptBalance').checked, knee_problem: $('ptKnee').checked, lives_alone: $('ptAlone').checked,
      stairs_at_home: $('ptStairs').checked, shower: $('ptShower').value, work: $('ptWork').value, outdoor_commute: $('ptCommute').checked };
    const leg = { source: $('ptLeg').dataset.example ? 'example_values' : 'entered_by_user' }; let missing = 0;
    $('ptLeg').querySelectorAll('input').forEach(el => { const v = parseFloat(el.value); if (!(v > 0)) missing++; leg[el.dataset.leg] = Math.round(v * 10); });
    const comfort = PAIN.filter(([k]) => $('ptPain').querySelector(`[data-pain="${k}"]`).checked).map(([, l]) => l);
    return { intake, leg, comfort, note: $('ptNote').value.trim(), missing };
  }

  function check() {
    const d = readCrutchUser(), out = $('ptResult');
    if (d.missing) { out.innerHTML = `<div class="pt-card warn"><b>${d.missing} measurement${d.missing > 1 ? 's are' : ' is'} missing.</b> Fill in all five (or use the example numbers to try it out).</div>`; return; }
    const plan = K.planMobility(d.intake);
    let verdict;
    if (!plan.hands_free_recommended) {
      verdict = `<div class="pt-card stop"><b>This tool wouldn't suggest a hands-free crutch liner for you right now.</b>
        <p>Because: ${plan.refusal_reasons.map(esc).join('; ')}. Please talk to your clinician about which mobility aid is right for you.</p></div>`;
    } else {
      const compiled = K.compileLiner(K.makeLinerSpec({ persona: { intake: d.intake, leg: d.leg }, leg: d.leg }));
      const bad = compiled.checks.filter(c => !c.ok);
      verdict = bad.length
        ? `<div class="pt-card warn"><b>Some measurements look outside what the compiler can work with:</b><ul>${bad.map(c => `<li>${esc(PLAIN[c.id] || 'a technical check')}</li>`).join('')}</ul><p>Please measure again, ideally with help, or ask your technician to measure.</p></div>`
        : `<div class="pt-card ok"><b>Your measurements are within the range the compiler can work with.</b><p>A technician can now review them and prepare a liner pattern sized to your leg. Nothing is built or approved yet: a technician decides.</p></div>`;
    }
    const ex = d.leg.source === 'example_values' ? '<p class="pt-example-note">You used example numbers, not your own.</p>' : '';
    out.innerHTML = verdict + ex + `<div class="pt-card"><b>What your technician will see</b><ul>
        <li>${d.intake.side} leg, ${d.intake.weight_bearing.replace(/_/g, ' ')}</li>
        <li>Your day: ${[d.intake.lives_alone && 'lives alone', d.intake.stairs_at_home && 'stairs at home', d.intake.outdoor_commute && 'travels outdoors', d.intake.balance_concern && 'balance trouble', d.intake.knee_problem && 'knee problem'].filter(Boolean).join(', ') || 'nothing ticked'}</li>
        <li>Where it hurts: ${d.comfort.length ? d.comfort.map(esc).join(', ') : 'nothing ticked'}${d.note ? `; “${esc(d.note)}”` : ''}</li>
        <li>Your five measurements</li></ul></div>
      <div class="pt-send"><button class="primary" id="ptSend" type="button"><span>Send to your clinician/technician for review</span><span>↓</span></button>
        <p class="hint">Saves a summary file on this device for you to send them. Nothing is uploaded. You can't approve a build here; only a technician can, after review.</p>
        <button class="quiet" id="ptHandoff" type="button">Demo: open these answers in the technician view</button></div>`;
    $('ptSend').onclick = () => {
      const body = { kind: 'rehab_ai_review_request', status: 'needs_technician_review', approved: false, created: new Date().toISOString(),
        entered_by: 'crutch_user', intake: d.intake, leg: d.leg, comfort_issues: d.comfort, note: d.note,
        plan_summary: { hands_free_recommended: plan.hands_free_recommended, reasons: plan.refusal_reasons },
        scope: 'Design demonstrator. Not a medical device and not medical advice. Nonhuman fit samples only.' };
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }));
      a.download = 'rehab-ai-review-request.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      $('ptSend').querySelector('span').textContent = 'Summary saved: send it to your clinician/technician';
    };
    $('ptHandoff').onclick = () => { window.LinerApp.loadFromPatient(d.intake, d.leg); setView('tech', true); };
  }
  $('ptCheck').onclick = check;

  setView(new URLSearchParams(location.search).get('view'), false);
  window.LinerViews = { setView };
})();
