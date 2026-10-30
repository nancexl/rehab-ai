// Hands-free crutch liner: second device for the same compiler, plus a task-based mobility plan.
// Pure functions, no DOM; browser (window.LinerCore) and Node (module.exports).
// Pattern frame: millimetres, x across the wrap (0 = front of the shin / tibial crest), y down the shin
// (0 = top edge just below the knee). The closure (overlap + straps) sits at the back of the calf.
// Geometry is an exact frustum development per segment; comfort rules are design heuristics, not clinical advice.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LinerCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const IR_VERSION = '0.1';
  // Bounds inherited from the earlier Rehab Foundry prototype (software bounds, not clinical indications).
  const BOUNDS = { circumferenceMm: [260, 480], shinLengthMm: [250, 450], kneeWidthMm: [80, 150], linerHeightMm: [100, 200] };

  const PERSONAS = {
    P1: { id: 'P1', title: 'Right foot in a cast · lives alone', note: 'Illustrative case; example measurements until real ones are taken.',
      intake: { side: 'right', weight_bearing: 'non_weight_bearing', age_band: '18-49', balance_concern: false, knee_problem: false,
        lives_alone: true, stairs_at_home: true, shower: 'tub', work: 'desk', outdoor_commute: true },
      leg: { circ_top_mm: 345, circ_mid_mm: 362, circ_bottom_mm: 330, shin_length_mm: 380, knee_width_mm: 98, source: 'example_values' } },
    P2: { id: 'P2', title: 'Left ankle fracture · balance concerns · 60s', note: 'Synthetic. Shows the agent refusing a hands-free device.',
      intake: { side: 'left', weight_bearing: 'non_weight_bearing', age_band: '50-69', balance_concern: true, knee_problem: false,
        lives_alone: false, stairs_at_home: true, shower: 'walk_in', work: 'retired', outdoor_commute: false },
      leg: { circ_top_mm: 330, circ_mid_mm: 340, circ_bottom_mm: 300, shin_length_mm: 360, knee_width_mm: 104, source: 'synthetic' } },
    P3: { id: 'P3', title: 'Achilles rupture in a boot · active commuter', note: 'Synthetic. Muscular calf changes the pattern taper.',
      intake: { side: 'right', weight_bearing: 'non_weight_bearing', age_band: '18-49', balance_concern: false, knee_problem: false,
        lives_alone: false, stairs_at_home: false, shower: 'walk_in', work: 'standing', outdoor_commute: true },
      leg: { circ_top_mm: 385, circ_mid_mm: 418, circ_bottom_mm: 372, shin_length_mm: 410, knee_width_mm: 106, source: 'synthetic' } }
  };

  // ---------------- mobility plan (local rules; the Nemotron agent replaces/extends these) ----------------
  function planMobility(intake) {
    const reasons = [];
    if (intake.balance_concern) reasons.push('balance concern reported');
    if (intake.knee_problem) reasons.push('knee problem on the injured side (kneeling needs a comfortable 90° knee)');
    if (intake.weight_bearing === 'full') reasons.push('full weight-bearing allowed, so offloading aids may be unnecessary');
    const handsFree = reasons.length === 0;
    const hf = handsFree ? 'Hands-free knee crutch with personalised liner' : 'Not recommended without clinician review';
    const tasks = [
      { task: 'Short walks indoors, carrying things', aid: handsFree ? hf : 'Walker with a tray or wheelchair indoors; ask your clinician',
        why: handsFree ? 'Keeps both hands free for cups, plates and doors.' : 'Hands-free devices rely on balance on one leg.' },
      { task: 'Kitchen and cooking', aid: handsFree ? hf : 'Perching stool at the counter',
        why: handsFree ? 'Standing work with both hands.' : 'Sitting work avoids balancing while handling hot items.' },
      { task: 'Stairs', aid: intake.stairs_at_home ? 'Crutches, or sitting and shuffling on the stairs' : 'Not needed at home',
        why: 'Neither knee scooters nor kneeling crutches are designed for stairs.' },
      { task: 'Shower / bath', aid: intake.shower === 'tub' ? 'Bath board or transfer bench + cast cover' : 'Shower chair + cast cover',
        why: 'Wet floors and a one-legged stance are a common fall setting.' },
      { task: 'Outdoors and commuting', aid: !intake.outdoor_commute ? 'Not needed' : handsFree ? 'Crutches for uneven ground; hands-free on smooth paths' : 'Crutches or wheelchair; ask your clinician',
        why: 'Kerbs, slopes and wet surfaces are harder than indoor floors. Knee scooters have a reported fall rate (a surgeon survey reported 37% falls).' },
      { task: intake.work === 'desk' ? 'Desk work' : intake.work === 'standing' ? 'Standing work' : 'Seated rest',
        aid: intake.work === 'standing' && handsFree ? hf + ' for short periods; plan seated breaks' : 'Chair + footstool to elevate the injured leg',
        why: 'Elevation and seated breaks reduce swelling and fatigue.' }
    ];
    const flags = [];
    if (intake.lives_alone) flags.push('Lives alone: keep a phone on you, and arrange help for the first week.');
    if (intake.age_band !== '18-49') flags.push('Higher fall-risk age band: a clinician should confirm aid choices.');
    return { hands_free_recommended: handsFree, refusal_reasons: reasons, tasks, flags,
      disclaimer: 'Suggestions to discuss with your clinician, not medical advice.' };
  }

  // ---------------- spec ----------------
  function makeLinerSpec({ persona, leg = persona.leg, calibration = null, options = {} }) {
    return {
      ir_version: IR_VERSION, device: 'hands_free_crutch_liner', side: persona.intake.side,
      leg: { ...leg },
      liner: { height_mm: options.height_mm || 150, foam_thickness_mm: options.foam_thickness_mm || 4,
        overlap_mm: options.overlap_mm || 30, crest_channel_mm: options.crest_channel_mm || 14, straps: 2 },
      layers: [{ role: 'liner', material: 'EVA / neoprene foam', thickness_mm: options.foam_thickness_mm || 4 },
               { role: 'crest_relief', material: 'soft foam', thickness_mm: 3 }],
      calibration: calibration || { length_add_mm: [0, 0, 0], source: 'default' },
      constraints: { min_overlap_mm: 20, bounds: BOUNDS }
    };
  }

  function checkLiner(spec) {
    const L = spec.leg, n = spec.liner, out = [];
    const add = (id, ok, detail) => out.push({ id, ok, detail });
    const inR = (v, [a, b]) => v >= a && v <= b;
    for (const k of ['circ_top_mm', 'circ_mid_mm', 'circ_bottom_mm'])
      add(`${k.replace('_mm', '')}_in_range`, inR(L[k], BOUNDS.circumferenceMm), `${L[k]} mm (allowed ${BOUNDS.circumferenceMm.join('–')})`);
    add('shin_length_in_range', inR(L.shin_length_mm, BOUNDS.shinLengthMm), `${L.shin_length_mm} mm (allowed ${BOUNDS.shinLengthMm.join('–')})`);
    add('knee_width_in_range', inR(L.knee_width_mm, BOUNDS.kneeWidthMm), `${L.knee_width_mm} mm (allowed ${BOUNDS.kneeWidthMm.join('–')})`);
    add('liner_fits_shin', n.height_mm + 60 <= L.shin_length_mm, `${n.height_mm} mm liner on a ${L.shin_length_mm} mm shin (needs 60 mm clear above the ankle)`);
    add('overlap_sufficient', n.overlap_mm >= spec.constraints.min_overlap_mm, `${n.overlap_mm} mm closure overlap (min ${spec.constraints.min_overlap_mm})`);
    const cal = spec.calibration.length_add_mm;
    add('calibration_plausible', cal.every(v => Math.abs(v) <= 40), `cut-length corrections ${cal.join(' / ')} mm (max ±40)`);
    const taper = Math.max(L.circ_top_mm, L.circ_mid_mm, L.circ_bottom_mm) - Math.min(L.circ_top_mm, L.circ_mid_mm, L.circ_bottom_mm);
    add('taper_plausible', taper <= 90, `${taper} mm circumference change over ${n.height_mm} mm`);
    add('crest_channel_narrow', n.crest_channel_mm <= 0.06 * Math.min(L.circ_top_mm, L.circ_mid_mm, L.circ_bottom_mm), `${n.crest_channel_mm} mm channel`);
    return out;
  }

  // ---------------- compile: exact frustum development, segment by segment ----------------
  function arcPoints(level, len, n = 40) {
    // level: {y, k, R, cy, sgn} or flat {y}; returns points across arc length [-len/2, len/2]
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = -len / 2 + len * i / n;
      if (!level.R) { pts.push([a, level.y]); continue; }
      const phi = a / level.R;
      pts.push([level.R * Math.sin(phi), level.cy - level.sgn * level.R * Math.cos(phi)]);
    }
    return pts;
  }

  function compileLiner(spec) {
    const checks = checkLiner(spec);
    const L = spec.leg, n = spec.liner, t = n.foam_thickness_mm, add = spec.calibration.length_add_mm;
    const heights = [0, n.height_mm / 2, n.height_mm];
    // Cut along the foam mid-surface: effective circumference = skin circumference + π·t.
    const circ = [L.circ_top_mm, L.circ_mid_mm, L.circ_bottom_mm].map((c, i) => c + Math.PI * t + add[i]);
    const r = circ.map(c => c / (2 * Math.PI));
    const segs = [];
    let yTop = 0;
    for (let i = 0; i < 2; i++) {
      const dh = heights[i + 1] - heights[i], s = Math.hypot(dh, r[i] - r[i + 1]);
      const lenA = circ[i] + n.overlap_mm, lenB = circ[i + 1] + n.overlap_mm;
      let top, bot;
      if (Math.abs(r[i] - r[i + 1]) < 0.3) { top = { y: yTop }; bot = { y: yTop + s }; }
      else {
        const k = (r[i] - r[i + 1]) / s, sgn = Math.sign(k), R = r[i] / Math.abs(k), cy = yTop + sgn * R;
        top = { y: yTop, R, cy, sgn }; bot = { y: yTop + s, R: R - sgn * s, cy, sgn };
      }
      segs.push({ top: arcPoints(top, lenA), bot: arcPoints(bot, lenB) });
      yTop += s;
    }
    // Outline: top arc L→R, right edge down, bottom arc R→L, left edge up.
    const outline = [...segs[0].top, segs[0].bot[segs[0].bot.length - 1], ...segs[1].bot.slice().reverse(), segs[0].bot[0]];
    const height = yTop;
    const bx = outline.map(p => p[0]), by = outline.map(p => p[1]);
    const bounds = { x0: Math.min(...bx), x1: Math.max(...bx), y0: Math.min(...by), y1: Math.max(...by) };
    // Overlap zones at both ends of the wrap (back of the calf); strap slots inside the overlap on one end.
    const ov = n.overlap_mm;
    const straps = [0.28, 0.72].map(f => ({ y: f * height, x: bounds.x1 - ov / 2, w: 6, h: 32 }));
    const channel = { x: -n.crest_channel_mm / 2, w: n.crest_channel_mm, y0: 8, y1: height - 8 };
    const ok = checks.every(c => c.ok);
    return { ir_version: spec.ir_version, device: spec.device, ok, checks, outline, bounds, height_mm: +height.toFixed(1),
      cut_lengths_mm: circ.map(c => +(c + ov).toFixed(1)), straps, channel, overlap_mm: ov,
      layers: spec.layers.map(l => ({ ...l })) };
  }

  // ---------------- SVG template (1:1 mm, landscape A4) ----------------
  function linerSvg(c, { title = '', page = [297, 210], layer = 'liner' } = {}) {
    const [W, H] = page, b = c.bounds, ox = W / 2 - (b.x0 + b.x1) / 2, oy = 24 - b.y0;
    if (layer === 'liner' && (b.x1 - b.x0 > W - 20 + 1e-8 || b.y1 - b.y0 > H - 50 + 1e-8))
      throw new RangeError('Pattern exceeds page; use linerPages for full-scale tiled output');
    const P = ([x, y]) => `${(ox + x).toFixed(2)} ${(oy + y).toFixed(2)}`;
    let body = '';
    if (layer === 'liner') {
      body += `<path d="M${c.outline.map(P).join('L')}Z" fill="none" stroke="#000" stroke-width="0.4"/>`;
      body += `<line x1="${ox}" y1="${oy - 4}" x2="${ox}" y2="${oy + c.height_mm + 4}" stroke="#888" stroke-dasharray="2 2" stroke-width="0.25"/>`;
      body += `<text x="${ox + 2}" y="${oy + c.height_mm / 2}" font-size="3" fill="#666">front of shin</text>`;
      for (const s of c.straps) body += `<rect x="${(ox + s.x - s.w / 2).toFixed(2)}" y="${(oy + s.y - s.h / 2).toFixed(2)}" width="${s.w}" height="${s.h}" fill="none" stroke="#000" stroke-width="0.3"/>`;
      body += `<rect x="${(ox + b.x1 - c.overlap_mm).toFixed(2)}" y="${oy}" width="${c.overlap_mm}" height="${c.height_mm.toFixed(2)}" fill="none" stroke="#999" stroke-dasharray="1 1" stroke-width="0.25"/>`;
    } else {
      const ch = c.channel, w = 2 * ch.w + 30, x0 = ox - w / 2;
      body += `<rect x="${x0}" y="${oy + ch.y0 - 6}" width="${w}" height="${(ch.y1 - ch.y0 + 12).toFixed(2)}" rx="6" fill="none" stroke="#000" stroke-width="0.4"/>`;
      body += `<rect x="${(ox + ch.x).toFixed(2)}" y="${oy + ch.y0}" width="${ch.w}" height="${(ch.y1 - ch.y0).toFixed(2)}" rx="3" fill="#ffe3d6" stroke="#d1461c" stroke-width="0.4" stroke-dasharray="2 1"/>`;
      body += `<text x="${ox}" y="${(oy + ch.y1 + 12).toFixed(1)}" font-size="3.5" text-anchor="middle">Crest relief pad: cut out the dashed channel; glue centred on the front line</text>`;
    }
    const ruler = Array.from({ length: 11 }, (_, i) => `<line x1="${15 + i * 10}" y1="${H - 14}" x2="${15 + i * 10}" y2="${H - (i % 5 ? 11 : 8)}" stroke="#000" stroke-width="0.3"/>`).join('');
    const fits = (b.x1 - b.x0) <= W - 20;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>` +
      `<text x="10" y="10" font-size="4" font-family="sans-serif">${title} · ${layer === 'liner' ? `liner · ${c.layers[0].thickness_mm} mm foam` : 'crest relief pad · 3 mm soft foam'}</text>` +
      `<text x="10" y="15" font-size="3" font-family="sans-serif" fill="#555">Print at 100%. The ruler must measure 100 mm. Cut lengths at top / middle / bottom: ${c.cut_lengths_mm.join(' / ')} mm.${fits ? '' : ' WARNING: wider than A4 landscape, use A3.'}</text>` +
      `<g data-pattern-geometry="true">${body}</g>` + `<line x1="15" y1="${H - 14}" x2="115" y2="${H - 14}" stroke="#000" stroke-width="0.3"/>${ruler}<text x="120" y="${H - 11}" font-size="3" font-family="sans-serif">100 mm calibration ruler</text></svg>`;
  }

  // Tile the actual geometry at 1:1. Never shrink a wide pattern to fit A4.
  function linerPages(c, { title = '', page = [297, 210], layer = 'liner', overlap = 10 } = {}) {
    if (!c.ok) throw new RangeError('Compile checks must pass before template generation');
    if (layer !== 'liner') return [linerSvg(c, { title, page, layer })];
    const [W, H] = page, b = c.bounds, width = b.x1 - b.x0, height = b.y1 - b.y0;
    const pw = W - 20, ph = H - 50;
    if (![W, H, width, height, overlap].every(Number.isFinite) || pw <= overlap || ph <= overlap || overlap <= 0)
      throw new RangeError('Invalid page or overlap');
    const cols = Math.max(1, Math.ceil((width - overlap) / (pw - overlap)));
    const rows = Math.max(1, Math.ceil((height - overlap) / (ph - overlap)));
    if (cols * rows > 20) throw new RangeError('Too many template pages');
    const masterW = Math.max(W, width + 20), masterH = Math.max(H, height + 50);
    const master = linerSvg(c, { page: [masterW, masterH], layer });
    const geometry = master.match(/<g data-pattern-geometry="true">([\s\S]*)<\/g>/)[1];
    const mx = masterW / 2 - (b.x0 + b.x1) / 2, my = 24 - b.y0;
    const safeTitle = String(title).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
    const pages = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const x = b.x0 + col * (pw - overlap), y = b.y0 + row * (ph - overlap);
      const clip = `tile-${row}-${col}`;
      pages.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" data-tile-x-mm="${x}" data-tile-y-mm="${y}" data-tile-width-mm="${pw}" data-tile-height-mm="${ph}">` +
        `<rect width="${W}" height="${H}" fill="white"/><text x="10" y="10" font-size="4">${safeTitle} · liner · row ${row + 1}/${rows}, column ${col + 1}/${cols}</text>` +
        `<text x="10" y="17" font-size="3">Print 100% / actual size. Adjacent tiles overlap ${overlap} mm. No fit-to-page scaling.</text>` +
        `<defs><clipPath id="${clip}"><rect x="10" y="24" width="${pw}" height="${ph}"/></clipPath></defs>` +
        `<g clip-path="url(#${clip})"><g transform="translate(${10 - mx - x} ${24 - my - y})">${geometry}</g></g>` +
        `<rect x="10" y="24" width="${pw}" height="${ph}" fill="none" stroke="#888" stroke-width="0.2" stroke-dasharray="2 2"/>` +
        `<line x1="15" y1="${H - 14}" x2="115" y2="${H - 14}" stroke="black" stroke-width="0.3"/><text x="120" y="${H - 11}" font-size="3">100 mm calibration ruler</text></svg>`);
    }
    return pages;
  }

  // ---------------- measure → learn ----------------
  // measured: { ruler_mm, overlap_mm: [top, mid, bottom] } measured when the cut liner is wrapped snugly on the leg
  // (positive = overlap, negative = gap).
  function calibrateLiner(spec, measured) {
    const target = spec.liner.overlap_mm, prev = spec.calibration.length_add_mm;
    const err = measured.overlap_mm.map(o => +(o - target).toFixed(1));            // + = too long, − = too short
    const next = prev.map((a, i) => +(a - err[i]).toFixed(1));
    const explain = [
      `Printed ruler measured ${measured.ruler_mm} mm (${(measured.ruler_mm - 100).toFixed(1)} mm off).`,
      `Overlap at top / mid / bottom was ${measured.overlap_mm.join(' / ')} mm against a ${target} mm target.`,
      `v2 changes the cut length by ${next.map((v, i) => (v - prev[i] >= 0 ? '+' : '') + (v - prev[i]).toFixed(1)).join(' / ')} mm at those heights (foam stretch and wrap tightness).`
    ];
    return { errors_mm: err, calibration: { length_add_mm: next, source: 'fitted_from_measurement' }, explain };
  }

  return { IR_VERSION, BOUNDS, PERSONAS, planMobility, makeLinerSpec, checkLiner, compileLiner, linerSvg, linerPages, calibrateLiner };
});
