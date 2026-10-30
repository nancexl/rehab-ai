// Phone-scan import: parse OBJ / PLY / STL, find the leg axis, slice girths, report quality.
// Pure functions (browser: window.ScanCore; Node: module.exports). Runs locally; nothing is uploaded.
// Expected input: a scan of the lower leg (roughly knee to ankle) exported by a phone scanning app.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScanCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_TRIANGLES = 1_500_000;

  // ---------------- parsers → { v: Float64Array (xyz...), f: Uint32Array (abc...) } ----------------
  function parseOBJ(text) {
    const v = [], f = [];
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('v ')) { const p = line.trim().split(/\s+/); v.push(+p[1], +p[2], +p[3]); }
      else if (line.startsWith('f ')) {
        const idx = line.trim().split(/\s+/).slice(1).map(t => { const i = parseInt(t, 10); return i < 0 ? v.length / 3 + i : i - 1; });
        for (let k = 1; k + 1 < idx.length; k++) f.push(idx[0], idx[k], idx[k + 1]);
      }
    }
    return { v: Float64Array.from(v), f: Uint32Array.from(f) };
  }

  function parseSTL(buf) {
    const dv = new DataView(buf), n = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
    if (buf.byteLength === 84 + n * 50 && n > 0) {
      const v = new Float64Array(n * 9), f = new Uint32Array(n * 3);
      for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) v[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
      for (let i = 0; i < n * 3; i++) f[i] = i;
      return { v, f };
    }
    const text = new TextDecoder().decode(buf), v = [];
    for (const m of text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) v.push(+m[1], +m[2], +m[3]);
    return { v: Float64Array.from(v), f: Uint32Array.from({ length: v.length / 3 }, (_, i) => i) };
  }

  function parsePLY(buf) {
    const bytes = new Uint8Array(buf), head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 8192)));
    const end = head.indexOf('end_header'); if (end < 0) throw new Error('PLY header not found');
    const headerLen = head.slice(0, end).length + 'end_header'.length + (head[end + 10] === '\r' ? 2 : 1);
    const lines = head.slice(0, end).split(/\r?\n/), format = (lines.find(l => l.startsWith('format')) || '').split(' ')[1];
    const elements = []; let cur = null;
    for (const l of lines) {
      const p = l.trim().split(/\s+/);
      if (p[0] === 'element') { cur = { name: p[1], count: +p[2], props: [] }; elements.push(cur); }
      else if (p[0] === 'property' && cur) cur.props.push(p[1] === 'list' ? { list: true, countType: p[2], type: p[3], name: p[4] } : { type: p[1], name: p[2] });
    }
    const SIZE = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
    const v = [], f = [];
    if (format === 'ascii') {
      const rows = new TextDecoder().decode(bytes.subarray(headerLen)).split(/\r?\n/).filter(Boolean); let r = 0;
      for (const el of elements) for (let i = 0; i < el.count; i++, r++) {
        const p = rows[r].trim().split(/\s+/).map(Number);
        if (el.name === 'vertex') { const ix = el.props.findIndex(q => q.name === 'x'); v.push(p[ix], p[ix + 1], p[ix + 2]); }
        else if (el.name === 'face') { const n = p[0]; for (let k = 2; k < n; k++) f.push(p[1], p[k], p[k + 1]); }
      }
    } else {
      const le = format === 'binary_little_endian', dv = new DataView(buf); let o = headerLen;
      const read = t => { let x; switch (t) {
        case 'char': case 'int8': x = dv.getInt8(o); break; case 'uchar': case 'uint8': x = dv.getUint8(o); break;
        case 'short': case 'int16': x = dv.getInt16(o, le); break; case 'ushort': case 'uint16': x = dv.getUint16(o, le); break;
        case 'int': case 'int32': x = dv.getInt32(o, le); break; case 'uint': case 'uint32': x = dv.getUint32(o, le); break;
        case 'float': case 'float32': x = dv.getFloat32(o, le); break; default: x = dv.getFloat64(o, le); }
        o += SIZE[t]; return x; };
      for (const el of elements) for (let i = 0; i < el.count; i++) {
        const vals = {};
        for (const p of el.props) {
          if (p.list) { const n = read(p.countType), arr = []; for (let k = 0; k < n; k++) arr.push(read(p.type)); vals[p.name] = arr; }
          else vals[p.name] = read(p.type);
        }
        if (el.name === 'vertex') v.push(vals.x, vals.y, vals.z);
        else if (el.name === 'face') { const a = vals.vertex_indices || vals.vertex_index; for (let k = 1; k + 1 < a.length; k++) f.push(a[0], a[k], a[k + 1]); }
      }
    }
    return { v: Float64Array.from(v), f: Uint32Array.from(f) };
  }

  function parseScan(name, buf) {
    const ext = name.toLowerCase().split('.').pop();
    const mesh = ext === 'obj' ? parseOBJ(new TextDecoder().decode(buf)) : ext === 'ply' ? parsePLY(buf) : ext === 'stl' ? parseSTL(buf) : null;
    if (!mesh) throw new Error(`Unsupported file type .${ext}; export OBJ, PLY or STL from the scanning app.`);
    if (!mesh.f.length) throw new Error('The file has no triangles (a point cloud only). Export a mesh.');
    if (mesh.f.length / 3 > MAX_TRIANGLES) throw new Error('Scan too large; export a lighter mesh (under 1.5 M triangles).');
    return mesh;
  }

  // ---------------- orientation: principal axis = leg axis; millimetres ----------------
  function eig3(m) { // power iteration for the largest eigenvector of a symmetric 3x3
    let x = [1, 0.7, 0.3];
    for (let i = 0; i < 60; i++) {
      const y = [m[0] * x[0] + m[1] * x[1] + m[2] * x[2], m[3] * x[0] + m[4] * x[1] + m[5] * x[2], m[6] * x[0] + m[7] * x[1] + m[8] * x[2]];
      const n = Math.hypot(...y) || 1; x = y.map(t => t / n);
    }
    return x;
  }
  function orient(mesh) {
    const v = mesh.v, n = v.length / 3; let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += v[3 * i]; cy += v[3 * i + 1]; cz += v[3 * i + 2]; } cx /= n; cy /= n; cz /= n;
    let ext = 0; for (let i = 0; i < n; i++) ext = Math.max(ext, Math.abs(v[3 * i] - cx), Math.abs(v[3 * i + 1] - cy), Math.abs(v[3 * i + 2] - cz));
    const unit = ext < 5 ? 1000 : ext < 50 ? 10 : 1;  // metres, centimetres or millimetres
    const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) { const d = [v[3 * i] - cx, v[3 * i + 1] - cy, v[3 * i + 2] - cz]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a * 3 + b] += d[a] * d[b]; }
    const ax = eig3(C);
    const ref = Math.abs(ax[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let u = [ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]]; const un = Math.hypot(...u); u = u.map(t => t / un);
    const w = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
    const out = new Float64Array(v.length);
    for (let i = 0; i < n; i++) {
      const d = [v[3 * i] - cx, v[3 * i + 1] - cy, v[3 * i + 2] - cz];
      out[3 * i] = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) * unit;
      out[3 * i + 1] = (d[0] * w[0] + d[1] * w[1] + d[2] * w[2]) * unit;
      out[3 * i + 2] = (d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2]) * unit;   // z along the leg
    }
    return { v: out, f: mesh.f, unit };
  }

  // ---------------- slicing ----------------
  function sliceAt(m, z) {
    const v = m.v, f = m.f, segs = [];
    for (let t = 0; t < f.length; t += 3) {
      const p = [f[t], f[t + 1], f[t + 2]].map(i => [v[3 * i], v[3 * i + 1], v[3 * i + 2]]), pts = [];
      for (let k = 0; k < 3; k++) {
        const a = p[k], b = p[(k + 1) % 3];
        if ((a[2] - z) * (b[2] - z) < 0) { const s = (z - a[2]) / (b[2] - a[2]); pts.push([a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])]); }
      }
      if (pts.length === 2) segs.push(pts);
    }
    return segs;
  }
  // Chain segments into loops by matching endpoints.
  function loops(segs, eps = 0.05) {
    const key = p => `${Math.round(p[0] / eps)},${Math.round(p[1] / eps)}`, adj = new Map(), used = new Array(segs.length).fill(false);
    segs.forEach((s, i) => s.forEach(p => { const k = key(p); if (!adj.has(k)) adj.set(k, []); adj.get(k).push(i); }));
    const out = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue; used[i] = true;
      const loop = [segs[i][0], segs[i][1]]; let closed = false;
      for (let guard = 0; guard < segs.length; guard++) {
        const tail = loop[loop.length - 1], cands = adj.get(key(tail)) || []; let next = -1;
        for (const j of cands) if (!used[j]) { next = j; break; }
        if (next < 0) break;
        used[next] = true; const s = segs[next];
        loop.push(key(s[0]) === key(tail) ? s[1] : s[0]);
        if (key(loop[loop.length - 1]) === key(loop[0])) { closed = true; break; }
      }
      out.push({ pts: loop, closed });
    }
    return out;
  }
  const perim = (pts, close) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (close) L += Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]); return L; };
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  // A tape measure follows the convex hull of the cross-section, so girth = hull perimeter.
  function girthAt(m, z) {
    const ls = loops(sliceAt(m, z));
    if (!ls.length) return null;
    const main = ls.reduce((a, b) => perim(b.pts, b.closed) > perim(a.pts, a.closed) ? b : a);
    const allPts = ls.flatMap(l => l.pts), h = hull(allPts.length > 3 ? allPts : main.pts);
    return { girth_mm: perim(h, true), loops: ls.length, closed: main.closed, section: h };
  }

  // ---------------- measure the liner zone ----------------
  function measureLeg(mesh, { linerHeightMm = 150 } = {}) {
    const m = orient(mesh); let z0 = Infinity, z1 = -Infinity;
    for (let i = 2; i < m.v.length; i += 3) { z0 = Math.min(z0, m.v[i]); z1 = Math.max(z1, m.v[i]); }
    const length = z1 - z0, profile = [];
    for (let z = z0 + 6; z <= z1 - 6; z += 5) { const g = girthAt(m, z); if (g) profile.push({ z, ...g }); }
    if (profile.length < 10) throw new Error('Could not find enough cross-sections. Is this a leg scan?');
    // Knee end = the end nearer to the maximum calf girth (calf bulk sits in the upper third).
    const max = profile.reduce((a, b) => b.girth_mm > a.girth_mm ? b : a);
    const kneeAtTop = (z1 - max.z) < (max.z - z0), dir = kneeAtTop ? -1 : 1;  // dir: moving down the leg
    const levels = [-75, 0, 75].map(d => max.z + dir * d);
    const sec = levels.map(z => girthAt(m, z));
    const quality = [];
    const add = (id, ok, detail) => quality.push({ id, ok, detail });
    add('scan_length_covers_liner_zone', length >= linerHeightMm + 60, `${length.toFixed(0)} mm of leg scanned (needs ≥ ${linerHeightMm + 60})`);
    add('all_levels_inside_scan', sec.every(Boolean), sec.every(Boolean) ? 'all three liner heights cut the scan' : 'a liner height falls outside the scan');
    if (sec.every(Boolean)) {
      add('cross_sections_closed', sec.every(s => s.closed), sec.map(s => s.closed ? 'closed' : 'gap').join(' / '));
      add('single_limb_in_section', sec.every(s => s.loops <= 3), sec.map(s => `${s.loops} loop(s)`).join(' / '));
      add('girths_plausible', sec.every(s => s.girth_mm > 200 && s.girth_mm < 600), sec.map(s => s.girth_mm.toFixed(0)).join(' / ') + ' mm');
    }
    const ok = quality.every(q => q.ok);
    return { ok, quality, unit_scale: m.unit, scan_length_mm: +length.toFixed(1), knee_end: kneeAtTop ? 'top' : 'bottom',
      circ_mm: sec.map(s => s ? +s.girth_mm.toFixed(1) : null), sections: sec.map(s => s ? s.section : null),
      profile: profile.map(p => ({ z: +(dir < 0 ? z1 - p.z : p.z - z0).toFixed(1), girth_mm: +p.girth_mm.toFixed(1) })) };
  }

  return { parseScan, parseOBJ, parsePLY, parseSTL, orient, girthAt, measureLeg };
});
