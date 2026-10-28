import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store.jsx';
import { DateBar, PLANS, zoneState } from '../ui/common.jsx';
import { Empty, Item } from '../ui/parts.jsx';
import { activeOn, isFor, onZone } from '../logic/schedule.js';
import { addDays, fmt, localToday, parse } from '../logic/dates.js';

// Lightweight 3D: each zone outline is extruded and projected with a rotatable camera into SVG.
// The floor plan images are mapped onto each level with an affine transform. L2 drawings are at 1.25x the L1 scale.
const L2_TO_WORLD = [0.8, 0, 0, 0.8, 2.4, 4];
const DEFAULT = { yaw: -28, pitch: 56, zoom: 1, panX: 0, panY: 0, gap: 170 };

export default function Model() {
  const { data, derived, day, zone, setZone, go } = useApp();
  const [v, setV] = useState(DEFAULT);
  const [show, setShow] = useState('both');
  const [modeTakt, setModeTakt] = useState(false);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [tip, setTip] = useState(null);
  const box = useRef(null); const drag = useRef(null);
  const today = useMemo(() => activeOn(derived.items, day, data.calendar), [derived, day, data]);
  const state = zoneState(today, data.actuals.filter((e) => e.day === day));
  useEffect(() => { const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height })); if (box.current) ro.observe(box.current); return () => ro.disconnect(); }, []);
  useEffect(() => { const el = box.current; const wh = (e) => { e.preventDefault(); setV((x) => ({ ...x, zoom: Math.max(0.4, Math.min(6, x.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12))) })); }; el.addEventListener('wheel', wh, { passive: false }); return () => el.removeEventListener('wheel', wh); }, []);

  const parts = useMemo(() => { const out = []; data.zones.forEach((z) => Object.entries(z.geo?.parts || {}).forEach(([fl, rings]) => out.push({ code: z.code, kind: z.geo.kind, fl, rings }))); return out; }, [data]);
  const bb = useMemo(() => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; parts.forEach((g) => g.rings.forEach((r) => r.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }))); return { x0, y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 }; }, [parts]);

  const W = size.w, H = size.h;
  const yaw = (v.yaw * Math.PI) / 180, pit = (v.pitch * Math.PI) / 180;
  const cs = Math.cos(yaw), sn = Math.sin(yaw), sp = Math.sin(pit), cp = Math.cos(pit);
  const gapZ = show === 'both' ? v.gap : 0;
  const s = (Math.min(W / (bb.w * 1.15), H / (bb.h * 1.15 * Math.max(0.45, sp) + gapZ * cp * 1.1)) * v.zoom) || 1;
  const ox = W / 2 + v.panX, oy = H / 2 + v.panY + (gapZ * cp * s) / 2;
  const P = (x, y, z) => { const dx = x - bb.cx, dy = y - bb.cy; const xr = dx * cs - dy * sn, yr = dx * sn + dy * cs; return [ox + s * xr, oy + s * (yr * sp - z * cp), yr * cp + z * sp]; };
  const pts = (arr) => arr.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const colorOf = (code) => { const st = state.get(code); if (modeTakt) return st?.color || '#d5dade'; if (!st) return '#d5dade'; return st.spec ? '#38893a' : st.aw ? '#9fcfa1' : '#3a3a3a'; };
  const shade = (col) => { if (col.startsWith('hsl(')) return col.replace(/(\d+)%\)$/, '28%)'); const m = /^#(..)(..)(..)$/.exec(col); if (!m) return '#555'; return '#' + [1, 2, 3].map((i) => Math.round(parseInt(m[i], 16) * 0.62).toString(16).padStart(2, '0')).join(''); };

  const floors = show === 'both' ? ['L1', 'L2'] : [show];
  const layers = floors.map((fl) => {
    const z0 = fl === 'L2' ? gapZ : 0;
    const a = s * cs, c = -s * sn, b = s * sp * sn, d = s * sp * cs; const [e0, f0] = P(0, 0, z0);
    const k = fl === 'L1' ? [1, 0, 0, 1, 0, 0] : L2_TO_WORLD;
    const M = [a * k[0] + c * k[1], b * k[0] + d * k[1], a * k[2] + c * k[3], b * k[2] + d * k[3], a * k[4] + c * k[5] + e0, b * k[4] + d * k[5] + f0];
    const faces = [];
    parts.filter((g) => g.fl === fl).forEach((g) => {
      const h = g.kind === 'corridor' ? 1.5 : g.kind === 'room' ? 22 : 14; const col = colorOf(g.code);
      const outer = g.rings[0]; const cx = outer.reduce((m, p) => m + p[0], 0) / outer.length, cy = outer.reduce((m, p) => m + p[1], 0) / outer.length;
      if (g.kind !== 'corridor') outer.forEach((p1, i) => {
        const p2 = outer[(i + 1) % outer.length]; let nx = p2[1] - p1[1], ny = -(p2[0] - p1[0]);
        if (nx * ((p1[0] + p2[0]) / 2 - cx) + ny * ((p1[1] + p2[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
        if (nx * sn + ny * cs <= 0 && v.pitch < 89) return;
        const q = [P(p1[0], p1[1], z0), P(p2[0], p2[1], z0), P(p2[0], p2[1], z0 + h), P(p1[0], p1[1], z0 + h)];
        faces.push({ k: 1, depth: (q[0][2] + q[1][2]) / 2, code: g.code, d: 'M' + pts(q) + 'Z', fill: shade(col), op: 0.92 });
      });
      const cP = P(cx, cy, z0 + h);
      faces.push({ k: g.kind === 'corridor' ? 0 : 2, depth: cP[2] + (g.kind === 'room' ? 0.5 : 0), code: g.code, d: g.rings.map((r) => 'M' + pts(r.map(([x, y]) => P(x, y, z0 + h))) + 'Z').join(' '), fill: col, op: g.kind === 'corridor' ? 0.7 : 0.88, label: g.kind !== 'room' ? g.code.replace('Zone ', 'Z') : '', lx: cP[0], ly: cP[1] });
    });
    faces.sort((x, y) => (x.k === 0) !== (y.k === 0) ? (x.k === 0 ? -1 : 1) : x.depth - y.depth || x.k - y.k);
    const [fx, fy] = P(bb.x0, bb.y0, z0);
    return { fl, M, faces, fx, fy };
  });

  const down = (e) => { drag.current = { x: e.clientX, y: e.clientY, moved: false, pan: e.shiftKey, zone: e.target.dataset?.zone || null }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => {
    const d = drag.current;
    if (d) { const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true; d.x = e.clientX; d.y = e.clientY; setTip(null); setV((x) => (d.pan ? { ...x, panX: x.panX + dx, panY: x.panY + dy } : { ...x, yaw: x.yaw + dx * 0.4, pitch: Math.max(12, Math.min(90, x.pitch - dy * 0.3)) })); return; }
    const code = e.target.dataset?.zone; if (!code) { setTip(null); return; }
    const r = box.current.getBoundingClientRect(); setTip({ code, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const up = () => { const d = drag.current; drag.current = null; if (d && !d.moved && d.zone) setZone(zone === d.zone ? null : d.zone); };
  const tz = tip && derived.zmap.get(tip.code); const ts = tip && state.get(tip.code);

  return (
    <section className="screen">
      <DateBar />
      <div className="card">
        <h2>3D zones · first and second floor</h2>
        <p className="note">Drag to rotate, Shift + drag to move, scroll to zoom. Tap a zone for its schedule. Outlines traced from takt zones rev 4 (approximate); stairs, washrooms, service rooms and the elevator are markers at their label positions.</p>
        <div className="row wrap">
          <div className="seg">{[['both', 'Both floors'], ['L1', 'L1'], ['L2', 'L2']].map(([k, l]) => <button type="button" key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}</div>
          <label className="inline">Floor gap <input type="range" min="0" max="260" step="10" value={v.gap} onChange={(e) => setV({ ...v, gap: +e.target.value })} /></label>
          <button type="button" className="btn" onClick={() => setV({ ...v, zoom: Math.min(6, v.zoom * 1.25) })} aria-label="Zoom in">+</button>
          <button type="button" className="btn" onClick={() => setV({ ...v, zoom: Math.max(0.4, v.zoom / 1.25) })} aria-label="Zoom out">−</button>
          <button type="button" className="btn" onClick={() => setV({ ...v, yaw: 0, pitch: 90 })}>Top view</button>
          <button type="button" className="btn" onClick={() => setV(DEFAULT)}>Reset view</button>
          <div className="seg"><button type="button" className={!modeTakt ? 'on' : ''} onClick={() => setModeTakt(false)}>Work on day</button><button type="button" className={modeTakt ? 'on' : ''} onClick={() => setModeTakt(true)}>Takt wagon</button></div>
        </div>
        <div className="model-wrap">
          <div className="model" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => setTip(null)}>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="3D model of takt zones">
              {layers.map((L) => (
                <g key={L.fl}>
                  <image href={PLANS[L.fl.toLowerCase()]} width={L.fl === 'L1' ? 1020 : 848} height={L.fl === 'L1' ? 593 : 622} transform={`matrix(${L.M.map((x) => x.toFixed(4)).join(' ')})`} opacity="0.45" preserveAspectRatio="none" />
                  {L.faces.map((f, i) => <path key={i} d={f.d} fill={f.fill} fillOpacity={f.op} fillRule="evenodd" stroke={zone === f.code ? 'var(--ink)' : 'rgba(0,0,0,.35)'} strokeWidth={zone === f.code ? 2.5 : 0.6} data-zone={f.code} style={{ cursor: 'pointer' }} />)}
                  {L.faces.filter((f) => f.label).map((f, i) => <text key={'t' + i} x={f.lx} y={f.ly} className="zt" textAnchor="middle" dominantBaseline="middle">{f.label}</text>)}
                  <text x={L.fx - 6} y={L.fy - 8} className="fl" textAnchor="end">{L.fl === 'L1' ? 'Main floor (L1)' : 'Second floor (L2)'}</text>
                </g>
              ))}
            </svg>
            {tip && tz && <div className="tip" style={{ left: Math.min(tip.x + 14, W - 230), top: Math.min(tip.y + 10, H - 80) }}><b>{tip.code}</b><div className="sub">{tz.rooms} · {tz.level}</div><div>{modeTakt ? (ts?.wagon ? 'Takt: ' + ts.wagon : 'No takt wagon this day') : `${ts?.spec || 0} zone-specific · ${ts?.aw || 0} Area-wide${ts?.act ? ' · actual logged' : ''}`}</div></div>}
          </div>
          <ZoneSchedule code={zone} today={today} onDay={() => go('day', { zone })} />
        </div>
        <div className="legend muted">{modeTakt ? data.takt.wagons.map((w, i) => <span key={w.id}><i className="sw" style={{ background: derived.TP?.cells.find((c) => c.wagon === w.id)?.color }}>W{i + 1}</i>{w.name}</span>) : <><span><i className="sw" style={{ background: '#38893a' }} />Zone-specific or takt</span><span><i className="sw" style={{ background: '#9fcfa1' }} />Area-wide only</span><span><i className="sw" style={{ background: '#3a3a3a' }} />Actual only</span><span><i className="sw" style={{ background: '#d5dade' }} />No work</span></>}</div>
      </div>
    </section>
  );
}

function ZoneSchedule({ code, today, onDay }) {
  const { data, derived, day, can, setAdjust } = useApp();
  const [all, setAll] = useState(false);
  const z = code ? derived.zmap.get(code) : null;
  if (!z) return <aside className="zs"><Empty>{code ? code + ' is not a takt zone.' : 'Tap a zone to see its schedule.'}</Empty></aside>;
  const t0d = localToday();
  const ents = data.actuals.filter((e) => e.day === day && e.zone === code);
  const now = today.filter((a) => onZone(a, code));
  let items = derived.items.filter((a) => onZone(a, code));
  if (!all) items = items.filter((a) => a.finish >= t0d && !(a.category !== 'takt' && +a.pct >= 100));
  const lo = items.reduce((m, a) => (a.start < m ? a.start : m), '9999'), hi = items.reduce((m, a) => (a.finish > m ? a.finish : m), '0000');
  const t0 = parse(lo).getTime(), span = Math.max(1, parse(addDays(hi, 1)).getTime() - t0);
  const pc = (d) => (100 * (parse(d).getTime() - t0)) / span;
  const groups = [['takt', 'Master takt plan'], ['zone', 'Zone-specific (schedule)'], ['areawide', (z.area || 'Area') + '-wide (schedule)']];
  return (
    <aside className="zs">
      <h3>{z.code}</h3>
      <p className="sub">{z.rooms} · {z.level}{z.area ? ' · ' + z.area : ''} · {z.train}{z.trainPos != null ? ' #' + z.trainPos : ''}</p>
      <div className="row"><button type="button" className="btn small" onClick={onDay}>Open on Day</button><button type="button" className={'btn small' + (all ? ' on' : '')} onClick={() => setAll(!all)}>{all ? 'Showing all' : 'Show completed too'}</button></div>
      <p className="note">{fmt(day, 'long')}: {now.length ? now.length + ' scheduled' : 'nothing scheduled'}</p>
      {now.length > 0 && <ul className="items">{now.map((a) => <Item key={a.uid} a={a} entries={ents.filter((e) => isFor(e, a))} />)}</ul>}
      {items.length ? (
        <div className="gantt">
          <div className="gr hd"><div className="lb">{fmt(lo, 'shortY')} – {fmt(hi, 'shortY')}</div><div className="tk" /></div>
          {groups.map(([cat, title]) => { const list = items.filter((a) => a.category === cat).sort((a, b) => a.start.localeCompare(b.start)); if (!list.length) return null; return (
            <React.Fragment key={cat}><div className="gr gp">{title} · {list.length}</div>
              {list.map((a) => (
                <div key={a.uid} className={'gr' + (can('plan') ? ' click' : '')} onClick={can('plan') ? () => setAdjust(a) : undefined} title={`${a.name} · ${fmt(a.start)} – ${fmt(a.finish, 'shortY')}${a.shift ? ` · pushed +${a.shift}d` : ''}${can('plan') ? ' · click to mark not happening' : ''}`}>
                  <div className="lb">{a.category === 'takt' ? a.name.replace('Takt · ', '') : a.name}</div>
                  <div className="tk"><i className={(a.category !== 'takt' && +a.pct >= 100 ? 'done ' : '') + (a.critical ? 'crit' : '')} style={{ left: pc(a.start) + '%', width: Math.max(0.8, pc(addDays(a.finish, 1)) - pc(a.start)) + '%', background: a.category === 'takt' ? a.color : undefined }} />
                    {[[t0d, 'td'], [day, '']].map(([d, cl]) => d >= lo && d <= hi && <span key={cl} className={'ln ' + cl} style={{ left: pc(d) + '%' }} />)}</div>
                </div>))}
            </React.Fragment>); })}
          <p className="note">Black line = selected day · red dashed = today · grey = complete in the schedule.</p>
        </div>) : <Empty>Nothing current or upcoming. Use “Show completed too”.</Empty>}
    </aside>
  );
}
