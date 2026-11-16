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

// A takt plan can run several trains (e.g. classrooms, corridors, washrooms), each with its own zones, start and wagons.
// Plans saved before trains existed are one train made from the plan's start, train order and wagons.
export function trainsOf(takt) {
  if (!takt) return [];
  if (takt.trains?.length) return takt.trains.map((t) => ({ ...t, wagons: t.wagonIds.map((id) => takt.wagons.find((w) => w.id === id)).filter(Boolean) }));
  return [{ id: 'main', name: 'Main train', start: takt.start, train: takt.train || [], wagonIds: (takt.wagons || []).map((w) => w.id), wagons: takt.wagons || [] }];
}

// Master takt plan: in each train, wagon i enters train position p in takt period (p + i).
// Forecast start = max(planned start, same wagon finished previous zone, previous wagon finished this zone).
// Lost days stretch a cell and push everything downstream. Skipped zones pass through with zero duration.
export function computeTakt({ takt, activities, calendar, actuals, commitments, constraints, adjustments = [], today }) {
  const trains = trainsOf(takt).filter((t) => t.start && t.train?.length && t.wagons.length);
  if (!trains.length) return null;
  const T = Math.max(1, Math.min(20, Math.round(+takt.taktDays || 5)));
  const first = trains.reduce((m, t) => (t.start < m ? t.start : m), trains[0].start);
  const wd = []; let d = first; let guard = 0;
  const need = Math.max(...trains.map((t) => t.train.length + t.wagons.length)) * T + 900;
  while (wd.length < need && guard++ < 8000) { if (isWorking(d, calendar)) wd.push(d); d = addDays(d, 1); }
  const at = (k) => wd[Math.min(k, wd.length - 1)];
  const lost = lostDays(actuals, commitments, adjustments);
  const areaOf = new Map();
  activities.filter((a) => a.category === 'areawide').forEach((a) => a.zones.forEach((z) => areaOf.set(z, a.area)));
  const cells = []; const out = [];
  trains.forEach((tr) => {
    let o = wd.findIndex((x) => x >= tr.start); if (o < 0) o = 0; // train start as a working-day index
    const F = []; const mine = [];
    tr.wagons.forEach((w, i) => {
      F[i] = [];
      const names = (w.match || []).map(norm);
      const skip = new Set(w.skip || []);
      tr.train.forEach((z, p) => {
        const ps = o + (p + i) * T, pf = ps + T - 1;
        if (skip.has(z)) { const ff = Math.max(ps - 1, p > 0 ? F[i][p - 1].ff : -1, i > 0 ? F[i - 1][p].ff : -1); F[i][p] = { fs: ff + 1, ff }; return; }
        let fs = ps;
        if (p > 0) fs = Math.max(fs, F[i][p - 1].ff + 1);
        if (i > 0) fs = Math.max(fs, F[i - 1][p].ff + 1);
        const raw = lost.get(w.id + '|' + z) || 0; const L = Math.ceil(raw);
        const ff = fs + T - 1 + L;
        F[i][p] = { fs, ff };
        const area = areaOf.get(z) || '';
        // Schedule % complete: the Area-wide activities it matches, or else the zone's own activities it matches.
        let sm = area && names.length ? activities.filter((a) => a.category === 'areawide' && a.area === area && names.includes(norm(a.name))) : [];
        if (!sm.length && names.length) sm = activities.filter((a) => a.category === 'zone' && (a.zones || []).includes(z) && names.includes(norm(a.name)));
        const spct = sm.length ? sm.reduce((s, a) => s + (+a.pct || 0), 0) / sm.length : null;
        const logs = actuals.filter((e) => e.wagon === w.id && e.zone === z);
        const cons = constraints.filter((c) => c.status !== 'Cleared' && c.wagon === w.id && c.zone === z);
        const c = { key: w.id + '|' + z, i, p, train: tr.id, trainName: tr.name, wagon: w.id, wname: w.name, trade: w.trade || '', zone: z, ps: at(ps), pf: at(pf), fs: at(fs), ff: at(ff), lost: raw, slip: ff - pf, area, spct, logs, cons, blocked: cons.length > 0, color: wagonColor(i, tr.wagons.length) };
        const done = logs.some((e) => e.status === 'Completed');
        c.status = done ? 'complete' : !logs.length && spct === 100 ? 'complete-s' : c.blocked ? 'blocked' : c.ff < today ? 'overdue' : c.fs <= today && today <= c.ff ? 'active' : 'planned';
        mine.push(c); cells.push(c);
      });
    });
    const pe = mine.reduce((m, c) => (c.pf > m ? c.pf : m), ''), fe = mine.reduce((m, c) => (c.ff > m ? c.ff : m), '');
    out.push({ ...tr, cells: mine, plannedEnd: pe, forecastEnd: fe, slipEnd: wd.indexOf(fe) - wd.indexOf(pe) });
  });
  const plannedEnd = cells.reduce((m, c) => (c.pf > m ? c.pf : m), ''), forecastEnd = cells.reduce((m, c) => (c.ff > m ? c.ff : m), '');
  return { T, wd, cells, trains: out, plannedEnd, forecastEnd, slipEnd: wd.indexOf(forecastEnd) - wd.indexOf(plannedEnd) };
}

// Takt cells as schedule items, so Day / WWP / 6WL / 3D treat them like zone-specific work.
export const taktItems = (TP, takt) => !TP ? [] : TP.cells.map((c) => ({
  uid: 'tk:' + c.key, name: 'Takt · ' + c.wname, category: 'takt', zones: [c.zone], start: c.fs, finish: c.ff, pct: c.spct ?? 0, spct: c.spct,
  trade: c.trade, wagon: c.wagon, critical: false, milestone: false, path: 'Master takt plan', bucket: '', area: c.area, slip: c.slip, blocked: c.blocked, color: c.color,
  basis: `${c.trainName}: takt wagon ${c.i + 1}, train position ${c.p + 1}`,
}));
