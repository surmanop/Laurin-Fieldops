import React, { useMemo, useState } from 'react';
import { useApp } from '../store.jsx';
import { Empty, Kpi } from '../ui/parts.jsx';
import { TRACKER_STATUSES } from '../logic/schedule.js';
import { localToday } from '../logic/dates.js';

const CLS = { 'Not started': 't0', Ready: 't1', 'Incomplete Progress': 't2', Complete: 't3', 'N/A': 't4' };
const zoneStatus = (rooms, tasks, rt) => {
  const vals = rooms.flatMap((r) => tasks.map((t) => rt[r]?.[t] || 'Not started')).filter((v) => v !== 'N/A');
  if (!vals.length) return 'n/a';
  if (vals.every((v) => v === 'Complete')) return 'complete';
  if (vals.some((v) => v === 'Complete' || v === 'Incomplete Progress')) return 'in progress';
  return vals.some((v) => v === 'Ready') ? 'ready' : 'not started';
};

export default function Tracker() {
  const { data, derived, can, api, write } = useApp();
  const [zone, setZone] = useState('Zone 1');
  const [edit, setEdit] = useState(null);
  const rooms = data.rooms.filter((r) => (zone === '__all' ? true : zone === '__none' ? !r.zone : r.zone === zone));
  const done = (t) => { const v = data.rooms.map((r) => data.roomTasks[r.room]?.[t] || 'Not started').filter((x) => x !== 'N/A'); return v.length ? Math.round((100 * v.filter((x) => x === 'Complete').length) / v.length) : null; };
  const check = useMemo(() => planCheck(data, derived), [data, derived]);

  return (
    <section className="screen">
      <div className="kpis">
        <Kpi v={check.due} l="Takt cells due by now" />
        <Kpi v={check.dueMatch} l="Of those, matching the field" />
        <Kpi v={check.behind} l="Field behind plan" tone={check.behind ? 'bad' : ''} />
        <Kpi v={check.ahead} l="Field ahead of plan" />
        <Kpi v={check.na} l="No tracker column to compare" tone="mute" />
      </div>
      <div className="card">
        <h2>Plan vs field</h2>
        <p className="note">Each takt wagon-zone compared with the tracker rooms in that zone. Future cells only count when the field is already ahead of them. A zone counts as complete when every room the task applies to is complete. Wagons without a tracker column (firestopping, drops, final board) can't be checked.</p>
        {check.rows.length ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Wagon</th><th>Zone</th><th>Plan says</th><th>Tracker says</th><th>Result</th></tr></thead>
          <tbody>{check.rows.map((r) => <tr key={r.key} className={r.v === 'Field behind' ? 'od' : ''}><td>{r.wagon}</td><td>{r.zone}</td><td>{r.plan}</td><td>{r.field}</td><td>{r.v}</td></tr>)}</tbody></table></div> : <Empty>Nothing due yet.</Empty>}
      </div>
      <div className="card">
        <div className="card-h"><h2>Construction tracker</h2>
          <select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zone filter">
            {[...data.zones].sort((a, b) => a.order - b.order).filter((z) => data.rooms.some((r) => r.zone === z.code)).map((z) => <option key={z.code} value={z.code}>{z.code} · {z.rooms}</option>)}
            <option value="__none">Rooms not matched to a zone</option><option value="__all">All 163 rooms</option>
          </select></div>
        <p className="note">{can('tracker') ? 'Tap a cell to change its status.' : 'Read only for your role.'} Bottom row: % complete across the whole building (N/A excluded).</p>
        <div className="mx-wrap"><table className="trk">
          <thead><tr><th className="rh">Room</th>{data.tasks.map((t) => <th key={t}><span>{t}</span></th>)}</tr></thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.room}><th className="rh">{r.room}<small>{r.name}</small></th>
                {data.tasks.map((t) => {
                  const v = data.roomTasks[r.room]?.[t] || 'Not started'; const k = r.room + '|' + t;
                  return <td key={t} className={CLS[v]}>
                    {edit === k ? <select autoFocus value={v} onBlur={() => setEdit(null)} onChange={(e) => { setEdit(null); write(() => api.setRoomTask(r.room, t, e.target.value), `${r.room} · ${t}: ${e.target.value}`); }}>{TRACKER_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                      : <button type="button" disabled={!can('tracker')} onClick={() => setEdit(k)} title={`${r.room} ${t}: ${v}`}>{v === 'Incomplete Progress' ? 'In prog.' : v === 'Not started' ? '' : v}</button>}
                  </td>;
                })}</tr>))}
            <tr className="tot"><th className="rh">Building %</th>{data.tasks.map((t) => <td key={t}>{done(t) == null ? '—' : done(t) + '%'}</td>)}</tr>
          </tbody>
        </table></div>
        <div className="legend muted">{TRACKER_STATUSES.map((s) => <span key={s}><i className={'sw ' + CLS[s]} />{s}</span>)}</div>
      </div>
    </section>
  );
}

function planCheck(data, derived) {
  const TP = derived.TP; const out = { due: 0, dueMatch: 0, match: 0, behind: 0, ahead: 0, na: 0, rows: [] };
  if (!TP) return out;
  const today = localToday();
  TP.cells.forEach((c) => {
    const tasks = data.wagonTasks[c.wagon] || [];
    const rooms = data.rooms.filter((r) => r.zone === c.zone).map((r) => r.room);
    const plan = c.pf < today ? 'done' : c.ps <= today ? 'in zone' : 'future';
    const f = tasks.length && rooms.length ? zoneStatus(rooms, tasks, data.roomTasks) : 'n/a';
    if (f === 'n/a') { out.na++; return; }
    let v;
    if (plan === 'done') v = f === 'complete' ? 'Match' : 'Field behind';
    else if (plan === 'in zone') v = f === 'not started' ? 'Field behind' : 'Match';
    else v = f === 'not started' || f === 'ready' ? 'Match' : 'Field ahead';
    if (plan !== 'future') { out.due++; if (v === 'Match') out.dueMatch++; }
    if (v === 'Match') out.match++; else if (v === 'Field behind') out.behind++; else out.ahead++;
    if (plan !== 'future' || v !== 'Match') out.rows.push({ key: c.key, wagon: `W${c.i + 1} ${c.wname}`, zone: c.zone, plan: plan === 'done' ? 'Done' : plan === 'in zone' ? 'In zone now' : 'Not yet', field: f, v });
  });
  out.rows.sort((a, b) => (a.v === 'Field behind' ? -1 : 0) - (b.v === 'Field behind' ? -1 : 0));
  return out;
}
