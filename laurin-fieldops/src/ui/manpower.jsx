import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store.jsx';
import { Empty } from './parts.jsx';
import { SPECIALTY, specialtyTrade } from './forms.jsx';
import { addDays, fmt, isWorking, mondayOf, stepWorking } from '../logic/dates.js';

// Daily site headcount per trade (one number per trade for the whole site), plus a trend chart.
// Separate from the crew numbers on zone actuals.
export function Manpower() {
  const { data, day, can, api, write } = useApp();
  const rows = data.manpower || [];
  const [added, setAdded] = useState([]); // specialty lines added on screen, not saved yet
  const [spec, setSpec] = useState('');
  const hasSpec = data.trades.includes(SPECIALTY);
  // "Specialty" itself isn't a box: each specialty gets its own named line (e.g. "Specialty: Lockers").
  const trades = useMemo(() => {
    const extra = [...new Set(rows.map((r) => r.trade).concat(added))].filter((t) => !data.trades.includes(t)).sort();
    const base = data.trades.filter((t) => t !== SPECIALTY);
    const at = base.indexOf('Cleaning');
    return at >= 0 ? [...base.slice(0, at), ...extra, ...base.slice(at)] : [...base, ...extra];
  }, [data, rows, added]);
  const addSpec = () => { const t = specialtyTrade(spec).trim(); if (t === SPECIALTY) return; if (!trades.includes(t)) setAdded([...added, t]); setSpec(''); };
  const onDay = (d) => Object.fromEntries(rows.filter((r) => r.day === d).map((r) => [r.trade, r.headcount]));
  const saved = useMemo(() => onDay(day), [rows, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState(null); // trade -> string, while editing
  const [forDay, setForDay] = useState(day);
  if (forDay !== day) { setForDay(day); setDraft(null); }
  const vals = draft || Object.fromEntries(Object.entries(saved).map(([t, n]) => [t, String(n)]));
  const total = Object.values(draft ? vals : saved).reduce((s, v) => s + (+v || 0), 0);
  const edit = can('log');
  const dirty = draft && trades.some((t) => (draft[t] ?? '') !== (saved[t] != null ? String(saved[t]) : ''));
  const prev = stepWorking(day, -1, data.calendar);
  const prevVals = onDay(prev);

  const save = async () => {
    const list = trades.map((t) => ({ trade: t, headcount: (vals[t] ?? '') === '' ? null : Math.max(0, Math.round(+vals[t])) }))
      .filter((r) => (r.headcount ?? null) !== (saved[r.trade] ?? null));
    if (!list.length) { setDraft(null); return; }
    const ok = await write(() => api.saveManpower(day, list), `Manpower saved · ${total} on site`);
    if (ok) setDraft(null);
  };

  return (
    <div className="card">
      <div className="card-h"><h2>Manpower on site · {fmt(day, 'long')}</h2><span className="mp-total"><b>{total}</b> workers</span></div>
      <p className="note">Site headcount per trade for the whole day{edit ? '. Leave a trade blank if it was not on site.' : '.'}</p>
      {edit ? (
        <>
          <div className="mp-grid">
            {trades.map((t) => (
              <label key={t} className={'mp-cell' + ((vals[t] ?? '') !== '' && +vals[t] > 0 ? ' on' : '')}>
                <span>{t}</span>
                <input type="number" inputMode="numeric" min="0" max="2000" value={vals[t] ?? ''} aria-label={`${t} headcount`}
                  onChange={(e) => setDraft({ ...vals, [t]: e.target.value })} />
              </label>
            ))}
          </div>
          {hasSpec && (
            <div className="row" style={{ gap: 6, marginTop: 8 }}>
              <input value={spec} maxLength={60} onChange={(e) => setSpec(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSpec(); } }} placeholder="Specialty trade, e.g. Lockers" aria-label="Add a specialty trade" style={{ width: 240 }} />
              <button type="button" className="btn small" onClick={addSpec} disabled={!spec.trim()}>Add specialty</button>
            </div>
          )}
          <div className="form-a" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" onClick={save} disabled={!dirty}>Save manpower</button>
            <button type="button" className="btn" disabled={!Object.keys(prevVals).length} onClick={() => setDraft(Object.fromEntries(Object.entries(prevVals).map(([t, n]) => [t, String(n)])))}>Copy {fmt(prev, 'wk')}</button>
            {draft && <button type="button" className="btn" onClick={() => setDraft(null)}>Cancel</button>}
            {dirty && <span className="msg">Not saved yet</span>}
          </div>
        </>
      ) : Object.keys(saved).length ? (
        <div className="mp-grid">{trades.filter((t) => saved[t] != null).map((t) => <div key={t} className="mp-cell on"><span>{t}</span><b>{saved[t]}</b></div>)}</div>
      ) : <Empty>No manpower recorded for this day.</Empty>}
      <Trend rows={rows} trades={trades} />
    </div>
  );
}

const RANGES = [['4w', '4 weeks'], ['12w', '12 weeks'], ['all', 'Project to date']];

function Trend({ rows, trades }) {
  const { data, day, setDay } = useApp();
  const [range, setRange] = useState('4w');
  const [trade, setTrade] = useState('');
  const [hover, setHover] = useState(null);
  const [box, setBox] = useState(null);
  const [cw, setCw] = useState(760); // chart drawn at its real width so text stays readable on phones
  useEffect(() => {
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setCw(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(box); return () => ro.disconnect();
  }, [box]);
  const pick = (r) => (trade ? r.trade === trade : true);

  // Bars: one per working day (4 / 12 weeks), or one per week for project to date (average per working day).
  const bars = useMemo(() => {
    const byDay = new Map();
    rows.filter(pick).forEach((r) => { const m = byDay.get(r.day) || new Map(); m.set(r.trade, (m.get(r.trade) || 0) + r.headcount); byDay.set(r.day, m); });
    if (range !== 'all') {
      const end = day; const start = addDays(mondayOf(end), range === '4w' ? -21 : -77);
      const out = [];
      for (let d = start; d <= end; d = addDays(d, 1)) {
        if (!isWorking(d, data.calendar) && !byDay.has(d)) continue;
        const m = byDay.get(d) || new Map();
        out.push({ key: d, label: fmt(d, 'wk'), v: [...m.values()].reduce((s, n) => s + n, 0), parts: m, has: byDay.has(d), day: d, tick: d === mondayOf(d) ? fmt(d) : '' });
      }
      return { list: out, unit: 'day' };
    }
    const days = [...byDay.keys()].sort();
    if (!days.length) return { list: [], unit: 'week' };
    const out = [];
    for (let w = mondayOf(days[0]); w <= mondayOf(day); w = addDays(w, 7)) {
      const ds = days.filter((d) => d >= w && d <= addDays(w, 6));
      const m = new Map(); ds.forEach((d) => byDay.get(d).forEach((n, t) => m.set(t, (m.get(t) || 0) + n)));
      const avg = (n) => (ds.length ? Math.round((n / ds.length) * 10) / 10 : 0);
      const parts = new Map([...m].map(([t, n]) => [t, avg(n)]));
      out.push({ key: w, label: `Week of ${fmt(w)} · ${ds.length} day${ds.length === 1 ? '' : 's'} recorded`, v: avg([...m.values()].reduce((s, n) => s + n, 0)), parts, has: ds.length > 0, day: w, tick: '' });
    }
    out.forEach((b) => { b.tick = fmt(b.key); }); // week start; spacing is thinned at draw time
    return { list: out, unit: 'week' };
  }, [rows, range, trade, day, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = bars.list;
  const recorded = list.filter((b) => b.has);
  const max = Math.max(4, ...list.map((b) => b.v));
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].find((s) => max / s <= 5) || 1000;
  const top = Math.ceil(max / step) * step;
  const W = cw, H = cw < 500 ? 180 : 220, L = 36, R = 8, T = 10, B = 26, pw = W - L - R, ph = H - T - B;
  const bw = list.length ? pw / list.length : pw;
  const y = (v) => T + ph - (v / top) * ph;
  const peak = recorded.length ? recorded.reduce((a, b) => (b.v > a.v ? b : a)) : null;
  const avg = recorded.length ? Math.round((recorded.reduce((s, b) => s + b.v, 0) / recorded.length) * 10) / 10 : 0;
  // Axis labels: keep them at least ~70px apart.
  const showTick = new Set(); { let last = -Infinity; list.forEach((b, i) => { if (b.tick && (i - last) * bw >= 70) { showTick.add(i); last = i; } }); }
  const what = trade || 'All trades';
  const per = bars.unit === 'week' ? 'average per working day, by week' : 'per working day';

  return (
    <div className="mp-trend">
      <div className="card-h" style={{ marginTop: 18 }}>
        <h3 style={{ margin: 0 }}>Trend · {what} · {per}</h3>
        <div className="row" style={{ gap: 8 }}>
          <select value={trade} onChange={(e) => setTrade(e.target.value)} aria-label="Trade"><option value="">All trades</option>{trades.map((t) => <option key={t}>{t}</option>)}</select>
          <div className="seg">{RANGES.map(([k, l]) => <button type="button" key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>)}</div>
        </div>
      </div>
      {recorded.length ? (
        <>
          <p className="note" style={{ margin: '6px 0' }}>Peak <b>{peak.v}</b> ({bars.unit === 'week' ? `week of ${fmt(peak.key)}` : fmt(peak.key, 'wk')}) · average <b>{avg}</b> over {recorded.length} {bars.unit === 'week' ? 'weeks' : 'days'} recorded{bars.unit === 'day' ? ' · click a bar to open that day' : ''}</p>
          <div className="mp-chart" ref={setBox}>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${what} headcount ${per}`} onMouseLeave={() => setHover(null)}>
              {[0, 1, 2, 3, 4, 5].map((i) => i * step).filter((v) => v <= top).map((v) => (
                <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v ? 'mp-grid-l' : 'mp-base'} /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="mp-ax">{v}</text></g>
              ))}
              {list.map((b, i) => {
                const x = L + i * bw, w = Math.max(1, bw - 2), h = Math.max(0, (b.v / top) * ph), r = Math.min(4, w / 2, h);
                const sel = bars.unit === 'day' && b.day === day;
                return (
                  <g key={b.key} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
                    onClick={() => bars.unit === 'day' && setDay(b.day)} style={{ cursor: bars.unit === 'day' ? 'pointer' : 'default' }} aria-label={`${b.label}: ${b.has ? b.v : 'not recorded'}`}>
                    <rect x={x} y={T} width={bw} height={ph} fill="transparent" />
                    {h > 0 && <path d={`M${x + 1},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z`} className={'mp-bar' + (sel ? ' sel' : '') + (hover === i ? ' hov' : '')} />}
                    {!b.has && <line x1={x + 1} x2={x + 1 + w} y1={y(0) - 1} y2={y(0) - 1} className="mp-none" />}
                    {b.tick && showTick.has(i) && <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="mp-ax">{b.tick}</text>}
                  </g>
                );
              })}
            </svg>
            {hover != null && list[hover] && (() => {
              const b = list[hover]; const parts = [...b.parts].filter(([, n]) => n > 0).sort((a, c) => c[1] - a[1]);
              const left = Math.min(Math.max(((L + hover * bw + bw / 2) / W) * 100, 12), 88);
              return (
                <div className="mp-tip" style={{ left: left + '%' }}>
                  <b>{b.label}</b>
                  <div>{b.has ? <><b>{b.v}</b> {trade ? trade : 'on site'}</> : 'Not recorded'}</div>
                  {!trade && parts.slice(0, 8).map(([t, n]) => <div key={t} className="sub-i">{t}: {n}</div>)}
                  {!trade && parts.length > 8 && <div className="sub-i">+{parts.length - 8} more trades</div>}
                </div>
              );
            })()}
          </div>
          <details className="bucket"><summary>Show as table</summary>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{bars.unit === 'week' ? 'Week' : 'Day'}</th><th>{what}</th>{!trade && <th>Trades on site</th>}</tr></thead>
              <tbody>{recorded.slice().reverse().map((b) => <tr key={b.key}><td>{bars.unit === 'week' ? `Week of ${fmt(b.key, 'shortY')}` : fmt(b.key, 'wk')}</td><td>{b.v}</td>{!trade && <td>{[...b.parts].filter(([, n]) => n > 0).sort((a, c) => c[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(' · ')}</td>}</tr>)}</tbody></table></div>
          </details>
        </>
      ) : <Empty>No manpower recorded {range === 'all' ? 'yet' : 'in this period'}{trade ? ` for ${trade}` : ''}.</Empty>}
    </div>
  );
}
