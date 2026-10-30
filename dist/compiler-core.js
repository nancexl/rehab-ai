// Assistive Hardware Compiler: local reference backend.
// Pure functions, no DOM. Works in the browser (window.CompilerCore) and in Node (module.exports).
// Coordinates are millimetres in a "lateral-positive" frame: y runs heel (0) → toe, +x is the lateral side.
// Relief placement uses simple anatomical design rules, not pressure measurement; see the scenarios doc.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CompilerCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const IR_VERSION = '0.1';
  const LIMITS = { lengthMm: [180, 320], widthMm: [60, 130], scale: [0.85, 1.15], minBorderMm: 6, maxReliefRadiusMm: 24 };

  // Fifth-metatarsal regions as fractions of foot length (heel = 0). Derived from the MyoLeg/Rajagopal
  // reference skeleton scaled to the foot (render/make_insert.py writes the landmarks): base ≈ 0.34 L,
  // mid-shaft ≈ 0.49 L, head ≈ 0.57 L. A reference skeleton, not this person's bones: the user's marked
  // painful point (relief.source = user_marked) overrides these defaults.
  const ZONES = {
    distal: { y: 0.54, inset: 15, r: 14, label: 'Distal 5th metatarsal' },
    shaft: { y: 0.49, inset: 13, r: 13, label: '5th metatarsal shaft' },
    base: { y: 0.36, inset: 11, r: 12, label: '5th metatarsal base' }
  };

  const SCENARIOS = {
    A: { id: 'A', title: 'Distal fracture · conservative', side: 'right', zone: 'distal', treatment: 'conservative', age_band: '18-49' },
    B: { id: 'B', title: 'Base avulsion after inversion sprain', side: 'right', zone: 'base', treatment: 'conservative', age_band: '18-49' },
    C: { id: 'C', title: 'Fixed with a plate · age 50–69', side: 'left', zone: 'shaft', treatment: 'plate', age_band: '50-69' }
  };

  // ---------- geometry helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function bounds(poly) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
  }
  // Width of the polygon along the horizontal line y = yy: [minX, maxX] of crossings.
  function span(poly, yy) {
    const xs = [];
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
      if ((ay <= yy && by > yy) || (by <= yy && ay > yy)) xs.push(ax + (yy - ay) / (by - ay) * (bx - ax));
    }
    return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
  }
  function insidePoly(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function distToPoly(poly, x, y) {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
      const dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y));
    }
    return best;
  }

  // ---------- inputs ----------
  // A smooth synthetic foot outline (for demos without a tracing). Lateral-positive, heel at y=0.
  function syntheticFoot({ lengthMm = 245, forefootWidthMm = 96, heelWidthMm = 62 } = {}) {
    const n = 90, med = [], lat = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = t * lengthMm;
      // Round (elliptical) heel and toe caps instead of pointed ends.
      const heel = t < 0.14 ? Math.sqrt(Math.max(0, 1 - ((0.14 - t) / 0.14) ** 2)) : 1;
      const toe = t > 0.80 ? Math.sqrt(Math.max(0, 1 - ((t - 0.80) / 0.20) ** 2)) : 1;
      const body = heelWidthMm / 2 + (forefootWidthMm / 2 - heelWidthMm / 2) * clamp((t - 0.15) / 0.55, 0, 1);
      const arch = 1 - 0.22 * Math.exp(-((t - 0.45) ** 2) / 0.012); // medial arch narrows the print
      const hw = body * heel * toe;
      lat.push([hw * 1.04, y]);
      med.push([-hw * arch * (t > 0.75 ? 0.98 + 0.06 * (t - 0.75) / 0.25 : 1), y]);
    }
    return lat.concat(med.reverse());
  }

  function footMetrics(outline) {
    const b = bounds(outline), L = b.h;
    const widthAt = f => { const s = span(outline, b.y0 + f * L); return s ? s[1] - s[0] : 0; };
    let fore = 0, heel = 0;
    for (let f = 0.55; f <= 0.85; f += 0.01) fore = Math.max(fore, widthAt(f));
    for (let f = 0.04; f <= 0.22; f += 0.01) heel = Math.max(heel, widthAt(f));
    return { length_mm: +L.toFixed(1), forefoot_width_mm: +fore.toFixed(1), heel_width_mm: +heel.toFixed(1) };
  }

  // ---------- spec ----------
  function defaultRelief(outline, zone) {
    const z = ZONES[zone], b = bounds(outline), y = b.y0 + z.y * b.h, s = span(outline, y);
    const inset = Math.max(z.inset, z.r + LIMITS.minBorderMm + 2); // keep the window's lateral edge off the border
    return { center_mm: [+(s[1] - inset).toFixed(1), +y.toFixed(1)], radius_mm: z.r, source: 'scenario_default' };
  }

  function makeSpec({ scenario = SCENARIOS.A, outline, relief = null, calibration = null }) {
    const sc = { zone: scenario.zone, treatment: scenario.treatment, age_band: scenario.age_band };
    const older = scenario.age_band !== '18-49';
    const layers = [
      { role: 'base', material: 'EVA', thickness_mm: older ? 5 : 3 },
      { role: 'relief', material: 'EVA', thickness_mm: 3 }
    ];
    if (scenario.zone === 'base') layers.push({ role: 'flange', material: 'EVA', thickness_mm: 3 });
    if (scenario.treatment === 'plate') layers.push({ role: 'soft_top', material: 'soft foam', thickness_mm: 2 });
    return {
      ir_version: IR_VERSION, device: 'forefoot_offloading_insert', side: scenario.side, scenario: sc,
      foot: { outline_mm: outline, ...footMetrics(outline), source: outline.source || 'tracing_scaled_by_ruler' },
      relief: relief || defaultRelief(outline, scenario.zone),
      layers,
      calibration: calibration || { scale_x: 1, scale_y: 1, relief_offset_mm: [0, 0], source: 'default' },
      constraints: { min_border_mm: LIMITS.minBorderMm, max_relief_radius_mm: LIMITS.maxReliefRadiusMm }
    };
  }

  // ---------- compile ----------
  // Scale corrects the whole template; the relief offset moves only the relief window.
  function applyCal(pt, cal) { return [pt[0] * cal.scale_x, pt[1] * cal.scale_y]; }

  function check(spec) {
    const m = spec.foot, r = spec.relief, cal = spec.calibration, out = [];
    const add = (id, ok, detail) => out.push({ id, ok, detail });
    add('foot_length_in_range', m.length_mm >= LIMITS.lengthMm[0] && m.length_mm <= LIMITS.lengthMm[1], `${m.length_mm} mm (allowed ${LIMITS.lengthMm.join('–')})`);
    add('forefoot_width_in_range', m.forefoot_width_mm >= LIMITS.widthMm[0] && m.forefoot_width_mm <= LIMITS.widthMm[1], `${m.forefoot_width_mm} mm (allowed ${LIMITS.widthMm.join('–')})`);
    add('relief_radius_allowed', r.radius_mm > 0 && r.radius_mm <= spec.constraints.max_relief_radius_mm, `${r.radius_mm} mm (max ${spec.constraints.max_relief_radius_mm})`);
    const inside = insidePoly(m.outline_mm, r.center_mm[0], r.center_mm[1]);
    const border = inside ? distToPoly(m.outline_mm, r.center_mm[0], r.center_mm[1]) - r.radius_mm : -1;
    add('relief_keeps_border', inside && border >= spec.constraints.min_border_mm, inside ? `${border.toFixed(1)} mm border (min ${spec.constraints.min_border_mm})` : 'relief centre is outside the foot outline');
    add('calibration_plausible', [cal.scale_x, cal.scale_y].every(s => s >= LIMITS.scale[0] && s <= LIMITS.scale[1]), `scale ${cal.scale_x.toFixed(3)} × ${cal.scale_y.toFixed(3)}`);
    return out;
  }

  // Returns geometry for each layer in the lateral-positive frame (before mirroring for the left side).
  function compile(spec) {
    const checks = check(spec);
    const cal = spec.calibration, outline = spec.foot.outline_mm.map(p => applyCal(p, cal));
    const rc0 = applyCal(spec.relief.center_mm, cal), ro = cal.relief_offset_mm || [0, 0], rc = [rc0[0] + ro[0], rc0[1] + ro[1]], rr = spec.relief.radius_mm * (cal.scale_x + cal.scale_y) / 2;
    const b = bounds(outline);
    const layers = spec.layers.map(layer => {
      const g = { role: layer.role, material: layer.material, thickness_mm: layer.thickness_mm, outline, holes: [], extra: null };
      if (layer.role === 'relief') {
        // Elongate the window along the bone for shaft/plate cases.
        const long = spec.scenario.zone === 'shaft' || spec.scenario.treatment === 'plate';
        g.holes.push({ type: 'ellipse', cx: rc[0], cy: rc[1], rx: rr, ry: long ? rr * 2.1 : rr * 1.15 });
      }
      if (layer.role === 'flange') {
        // Lateral flange around the midfoot to limit inversion: a strip that folds up the lateral wall.
        const y0 = b.y0 + 0.30 * b.h, y1 = b.y0 + 0.62 * b.h;
        g.outline = null;
        g.extra = { type: 'flange', y0, y1, height_mm: 28, at_x: span(outline, (y0 + y1) / 2)[1] };
      }
      return g;
    });
    // Check the actual window shape (ellipses can be longer than the nominal radius).
    for (const l of layers) for (const h of l.holes) {
      let worst = Infinity;
      for (let k = 0; k < 48; k++) {
        const a = k / 48 * 2 * Math.PI, x = h.cx + h.rx * Math.cos(a), y = h.cy + h.ry * Math.sin(a);
        worst = Math.min(worst, insidePoly(outline, x, y) ? distToPoly(outline, x, y) : -distToPoly(outline, x, y));
      }
      checks.push({ id: 'relief_window_inside', ok: worst >= spec.constraints.min_border_mm, detail: `${worst.toFixed(1)} mm minimum border around the ${h.rx.toFixed(0)}×${h.ry.toFixed(0)} mm window` });
    }
    return { ir_version: spec.ir_version, side: spec.side, ok: checks.every(c => c.ok), checks, layers, bounds: b };
  }

  // ---------- SVG (1:1 millimetres, one page per layer, mirrored for the left foot) ----------
  function toSvg(compiled, { layerIndex = 0, title = '', page = [210, 297] } = {}) {
    const layer = compiled.layers[layerIndex], [W, H] = page, mirror = compiled.side === 'left' ? -1 : 1;
    const b = compiled.bounds, ox = W / 2 - mirror * (b.x0 + b.x1) / 2, oy = 22 + b.h + b.y0; // toe up
    const P = ([x, y]) => [ox + mirror * x, oy - y];
    const path = poly => 'M' + poly.map(p => P(p).map(v => v.toFixed(2)).join(' ')).join('L') + 'Z';
    let body = '';
    if (layer.outline) body += `<path d="${path(layer.outline)}" fill="none" stroke="#000" stroke-width="0.4"/>`;
    for (const h of layer.holes) {
      const [cx, cy] = P([h.cx, h.cy]);
      body += `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${h.rx.toFixed(2)}" ry="${h.ry.toFixed(2)}" fill="#ffe3d6" stroke="#d1461c" stroke-width="0.4" stroke-dasharray="2 1"/>`;
    }
    if (layer.extra && layer.extra.type === 'flange') {
      const e = layer.extra, len = e.y1 - e.y0;
      body += `<rect x="${(W / 2 - e.height_mm / 2).toFixed(2)}" y="40" width="${e.height_mm}" height="${len.toFixed(2)}" fill="none" stroke="#000" stroke-width="0.4"/>`;
      body += `<text x="${W / 2}" y="${(46 + len).toFixed(1)}" font-size="3.5" text-anchor="middle">Lateral flange · ${len.toFixed(0)} × ${e.height_mm} mm · glue to the lateral edge, midfoot</text>`;
    }
    const ruler = Array.from({ length: 11 }, (_, i) => `<line x1="${15 + i * 10}" y1="${H - 18}" x2="${15 + i * 10}" y2="${H - (i % 5 ? 15 : 12)}" stroke="#000" stroke-width="0.3"/>`).join('');
    const fits = b.h + 40 <= H;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">` +
      `<rect width="${W}" height="${H}" fill="#fff"/>` +
      `<text x="10" y="10" font-size="4" font-family="sans-serif">${title} · layer ${layerIndex + 1}/${compiled.layers.length}: ${layer.role} · ${layer.material} ${layer.thickness_mm} mm · ${compiled.side} foot</text>` +
      `<text x="10" y="15" font-size="3" font-family="sans-serif" fill="#555">Print at 100% (no "fit to page"). Check: the ruler below must measure exactly 100 mm.${fits ? '' : ' WARNING: outline taller than the page; use A3.'}</text>` +
      body + `<line x1="15" y1="${H - 18}" x2="115" y2="${H - 18}" stroke="#000" stroke-width="0.3"/>${ruler}` +
      `<text x="120" y="${H - 15}" font-size="3" font-family="sans-serif">100 mm calibration ruler</text></svg>`;
  }

  // ---------- measure → learn ----------
  // measurement: { ruler_mm (printed 100 mm ruler measured), cut_length_mm, cut_forefoot_width_mm,
  //                relief_offset_mm: [dx, dy] (cut window centre minus marked point, lateral-positive) }
  function calibrate(spec, measurement) {
    const t = spec.foot, cal = spec.calibration, m = measurement;
    const printer = 100 / m.ruler_mm; // >1 means the printer shrank the page
    const errors = {
      ruler_mm: +(m.ruler_mm - 100).toFixed(2),
      length_mm: +(m.cut_length_mm - t.length_mm).toFixed(2),
      forefoot_width_mm: +(m.cut_forefoot_width_mm - t.forefoot_width_mm).toFixed(2),
      relief_offset_mm: m.relief_offset_mm.map(v => +v.toFixed(2))
    };
    const next = {
      scale_x: +(cal.scale_x * (t.forefoot_width_mm / m.cut_forefoot_width_mm)).toFixed(4),
      scale_y: +(cal.scale_y * (t.length_mm / m.cut_length_mm)).toFixed(4),
      relief_offset_mm: [+((cal.relief_offset_mm || [0, 0])[0] - m.relief_offset_mm[0]).toFixed(2), +((cal.relief_offset_mm || [0, 0])[1] - m.relief_offset_mm[1]).toFixed(2)],
      printer_scale: +printer.toFixed(4),
      source: 'fitted_from_measurement'
    };
    const explain = [
      `Printed ruler measured ${m.ruler_mm} mm → printer scale ${(100 * (printer - 1)).toFixed(1)}%.`,
      `Cut length ${errors.length_mm >= 0 ? '+' : ''}${errors.length_mm} mm, forefoot width ${errors.forefoot_width_mm >= 0 ? '+' : ''}${errors.forefoot_width_mm} mm vs target.`,
      `Relief window off by (${errors.relief_offset_mm.join(', ')}) mm; v2 shifts it back.`
    ];
    return { errors, calibration: next, explain };
  }

  return { IR_VERSION, LIMITS, ZONES, SCENARIOS, syntheticFoot, footMetrics, defaultRelief, makeSpec, check, compile, toSvg, calibrate, span, bounds, insidePoly };
});
