import { isWorking } from './dates.js';

export const STATUSES = ['Worked as planned', 'Partial / behind', 'Not worked', 'Completed', 'Unscheduled work'];
export const REASONS = ['Prerequisite work not complete', 'Materials', 'Equipment', 'Labour / crew', 'Information / RFI / design', 'Inspection / approval', 'Weather', 'Space / access / trade conflict', 'Change in plan or priority', 'Under-estimated duration', 'Other'];
export const CTYPES = ['RFI / design information', 'Submittal / shop drawing', 'Material delivery', 'Equipment', 'Labour / crew', 'Prerequisite work', 'Inspection / approval', 'Permit', 'Owner decision', 'Space / access', 'Other'];
export const TRACKER_STATUSES = ['Not started', 'Ready', 'Incomplete Progress', 'Complete', 'N/A'];

export const isZoneCat = (a) => a.category === 'zone' || a.category === 'takt';
export const onZone = (a, z) => (isZoneCat(a) || a.category === 'areawide') && a.zones.includes(z);
export const activeOn = (items, day, calendar) => (isWorking(day, calendar) ? items.filter((a) => a.start <= day && a.finish >= day) : []);
export const overlaps = (a, days) => days.some((d) => a.start <= d && a.finish >= d);

// Does a log entry belong to this schedule item?
export const isFor = (e, a) => (a.category === 'takt' ? e.wagon === a.wagon && e.zone === a.zones[0] : e.activityUid != null && e.activityUid === a.uid);

export const ppc = (rows) => { const done = rows.filter((r) => r.status === 'Complete').length; return { done, total: rows.length, pct: rows.length ? Math.round((100 * done) / rows.length) : null }; };

// Rows for WWP / 6WL grids: one row per zone (or zone pair), per Area, per unplaced bucket, per site group.
export function groupRows(items, zones) {
  const order = new Map(zones.map((z) => [z.code, z.order]));
  const rooms = new Map(zones.map((z) => [z.code, z.rooms]));
  const m = new Map();
  items.forEach((a) => {
    const g = isZoneCat(a) ? 'zone' : a.category;
    const key = g === 'zone' ? 'z:' + a.zones.join('+') : g === 'areawide' ? 'a:' + a.area : g === 'unplaced' ? 'u:' + a.bucket : 's:' + a.path;
    if (!m.has(key)) {
      const label = g === 'zone' ? { t: a.zones.join(' + '), sub: a.zones.map((z) => rooms.get(z) || '').join(' / '), o: Math.min(...a.zones.map((z) => order.get(z) ?? 999)) }
        : g === 'areawide' ? { t: a.area + ' (whole Area)', sub: a.zones.join(', '), o: 0 }
        : g === 'unplaced' ? { t: a.bucket, sub: 'Zone not confirmed', o: 0 }
        : { t: a.path.split(' › ').slice(-1)[0], sub: a.path.split(' › ').slice(0, -1).join(' › '), o: 0 };
      m.set(key, { key, g, items: [], ...label });
    }
    m.get(key).items.push(a);
  });
  const G = [['zone', 'Takt zones'], ['areawide', 'Area-wide (main floor)'], ['unplaced', 'Not placed in a zone yet'], ['site', 'Site, envelope & building-wide']];
  return G.map(([g, title]) => ({ title, rows: [...m.values()].filter((r) => r.g === g).sort((x, y) => x.o - y.o || (x.sub + x.t).localeCompare(y.sub + y.t)) })).filter((x) => x.rows.length);
}
