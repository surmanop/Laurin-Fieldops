import { addDays, mondayOf, isWorking } from './dates.js';

export const wagonColor = (i, n) => `hsl(${Math.round((i * 360) / Math.max(1, n) + 150) % 360}, 58%, 42%)`;
const norm = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Lost working days per wagon-zone, from the field log and missed WWP commitments.
//   Not worked = 1 day, Partial / behind = 0.5 day,
//   a missed commitment = 1 day unless actuals were already logged for that wagon-zone that week,
//   plus any days the owner pushes the wagon-zone by with "Not happening".
export function lostDays(actuals, commitments, adjustments = []) {
  const lost = new Map(); const add = (k, v) => lost.set(k, (lost.get(k) || 0) + v);
  adjustments.filter((x) => typeof x.target === 'string' && x.target.startsWith('tk:')).forEach((x) => add(x.target.slice(3), +x.days || 0));
  const logged = new Set();
  actuals.filter((e) => e.wagon).forEach((e) => {
    const k = e.wagon + '|' + e.zone;
    if (e.status === 'Not worked') add(k, 1); else if (e.status === 'Partial / behind') add(k, 0.5);
    logged.add(k + '|' + mondayOf(e.day));
  });
  commitments.filter((c) => c.wagon && c.status === 'Not complete').forEach((c) => { const k = c.wagon + '|' + c.zone; if (!logged.has(k + '|' + c.week)) add(k, 1); });
  return lost;
}

// Master takt plan: wagon i enters train position p in takt period (p + i).
// Forecast start = max(planned start, same wagon finished previous zone, previous wagon finished this zone).
// Lost days stretch a cell and push everything downstream. Skipped zones pass through with zero duration.
export function computeTakt({ takt, activities, calendar, actuals, commitments, constraints, adjustments = [], today }) {
  if (!takt || !takt.start || !takt.train?.length || !takt.wagons?.length) return null;
  const T = Math.max(1, Math.min(20, Math.round(+takt.taktDays || 5)));
  const wd = []; let d = takt.start; let guard = 0;
  const need = (takt.train.length + takt.wagons.length) * T + 600;
  while (wd.length < need && guard++ < 6000) { if (isWorking(d, calendar)) wd.push(d); d = addDays(d, 1); }
  const at = (k) => wd[Math.min(k, wd.length - 1)];
  const lost = lostDays(actuals, commitments, adjustments);
  const areaOf = new Map();
  activities.filter((a) => a.category === 'areawide').forEach((a) => a.zones.forEach((z) => areaOf.set(z, a.area)));
  const F = []; const cells = [];
  takt.wagons.forEach((w, i) => {
    F[i] = [];
    const names = (w.match || []).map(norm);
    const skip = new Set(w.skip || []);
    takt.train.forEach((z, p) => {
      const ps = (p + i) * T, pf = ps + T - 1;
      if (skip.has(z)) { const ff = Math.max(ps - 1, p > 0 ? F[i][p - 1].ff : -1, i > 0 ? F[i - 1][p].ff : -1); F[i][p] = { fs: ff + 1, ff }; return; }
      let fs = ps;
      if (p > 0) fs = Math.max(fs, F[i][p - 1].ff + 1);
      if (i > 0) fs = Math.max(fs, F[i - 1][p].ff + 1);
      const raw = lost.get(w.id + '|' + z) || 0; const L = Math.ceil(raw);
      const ff = fs + T - 1 + L;
      F[i][p] = { fs, ff };
      const area = areaOf.get(z) || '';
      const sm = area && names.length ? activities.filter((a) => a.category === 'areawide' && a.area === area && names.includes(norm(a.name))) : [];
      const spct = sm.length ? sm.reduce((s, a) => s + (+a.pct || 0), 0) / sm.length : null;
      const logs = actuals.filter((e) => e.wagon === w.id && e.zone === z);
      const cons = constraints.filter((c) => c.status !== 'Cleared' && c.wagon === w.id && c.zone === z);
      const c = { key: w.id + '|' + z, i, p, wagon: w.id, wname: w.name, trade: w.trade || '', zone: z, ps: at(ps), pf: at(pf), fs: at(fs), ff: at(ff), lost: raw, slip: ff - pf, area, spct, logs, cons, blocked: cons.length > 0, color: wagonColor(i, takt.wagons.length) };
      const done = logs.some((e) => e.status === 'Completed');
      c.status = done ? 'complete' : !logs.length && spct === 100 ? 'complete-s' : c.blocked ? 'blocked' : c.ff < today ? 'overdue' : c.fs <= today && today <= c.ff ? 'active' : 'planned';
      cells.push(c);
    });
  });
  const plannedEnd = cells.reduce((m, c) => (c.pf > m ? c.pf : m), ''), forecastEnd = cells.reduce((m, c) => (c.ff > m ? c.ff : m), '');
  return { T, wd, cells, plannedEnd, forecastEnd, slipEnd: wd.indexOf(forecastEnd) - wd.indexOf(plannedEnd) };
}

// Takt cells as schedule items, so Day / WWP / 6WL / 3D treat them like zone-specific work.
export const taktItems = (TP, takt) => !TP ? [] : TP.cells.map((c) => ({
  uid: 'tk:' + c.key, name: 'Takt · ' + c.wname, category: 'takt', zones: [c.zone], start: c.fs, finish: c.ff, pct: c.spct ?? 0, spct: c.spct,
  trade: c.trade, wagon: c.wagon, critical: false, milestone: false, path: 'Master takt plan', bucket: '', area: c.area, slip: c.slip, blocked: c.blocked, color: c.color,
  basis: `Takt wagon ${c.i + 1} of ${takt.wagons.length}, train position ${c.p + 1}`,
}));
