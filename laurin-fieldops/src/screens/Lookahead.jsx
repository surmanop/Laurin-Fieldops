import React, { useMemo, useState } from 'react';
import { useApp } from '../store.jsx';
import { DateBar, Matrix } from '../ui/common.jsx';
import { Empty } from '../ui/parts.jsx';
import { ConstraintForm, zoneLabel } from '../ui/forms.jsx';
import { groupRows, isFor, overlaps } from '../logic/schedule.js';
import { addDays, fmt, isWorking, localToday, weekDays } from '../logic/dates.js';

export default function Lookahead() {
  const { data, derived, week, can, api, write, user } = useApp();
  const [startOnly, setStartOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(true);
  const [adding, setAdding] = useState(false);
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(week, 7 * i)).map((w) => { const days = weekDays(w).filter((d) => isWorking(d, data.calendar)); return { key: w, days, label: 'Wk of ' + fmt(w) + (days.length < 5 ? ` (${days.length} days)` : ''), off: !days.length }; });
  const starts = (a, c) => a.start >= c.key && a.start <= addDays(c.key, 6);
  const pool = useMemo(() => derived.items.filter((a) => weeks.some((c) => overlaps(a, c.days) && (!startOnly || starts(a, c)))), [derived, week, startOnly]); // eslint-disable-line
  const today = localToday(), soon = addDays(today, 7);
  const open = data.constraints.filter((c) => c.status !== 'Cleared');
  const rows = (openOnly ? open : data.constraints).slice().sort((a, b) => (a.status === 'Cleared') - (b.status === 'Cleared') || a.needBy.localeCompare(b.needBy));
  const toggle = (c) => write(() => api.saveRecord('constraints', { ...c, status: c.status === 'Cleared' ? 'Open' : 'Cleared', clearedOn: c.status === 'Cleared' ? '' : today, updatedBy: user.id }), 'Constraint updated');

  return (
    <section className="screen">
      <DateBar weekly />
      <div className="card">
        <h2>Six weeks from {fmt(week, 'shortY')}</h2>
        <div className="tbl-wrap"><table className="tbl num"><thead><tr><th>Week of</th><th>Working days</th><th>Activities</th><th>Starting</th><th>Open constraints due</th></tr></thead>
          <tbody>{weeks.map((c) => { const inW = derived.items.filter((a) => overlaps(a, c.days)); return (<tr key={c.key}><td>{fmt(c.key, 'shortY')}</td><td>{c.days.length}</td><td>{inW.length}</td><td>{inW.filter((a) => starts(a, c)).length}</td><td>{open.filter((k) => k.needBy >= c.key && k.needBy <= addDays(c.key, 6)).length}</td></tr>); })}</tbody></table></div>
      </div>
      <div className="card">
        <div className="card-h"><h2>Constraints log</h2>
          <div className="row"><div className="seg"><button type="button" className={openOnly ? 'on' : ''} onClick={() => setOpenOnly(true)}>Open</button><button type="button" className={!openOnly ? 'on' : ''} onClick={() => setOpenOnly(false)}>All</button></div>{can('log') && <button type="button" className="btn primary" onClick={() => setAdding(true)}>Add constraint</button>}</div></div>
        <p className="note">{open.length} open · {open.filter((c) => c.needBy < today).length} past need-by (red) · {open.filter((c) => c.needBy >= today && c.needBy <= soon).length} due within 7 days (amber) · {data.constraints.length - open.length} cleared.</p>
        {rows.length ? (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Need by</th><th>Zone</th><th>Activity</th><th>Trade</th><th>Type</th><th>Constraint</th><th>Responsible</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id} className={c.status === 'Cleared' ? 'clr' : c.needBy < today ? 'od' : c.needBy <= soon ? 'soon' : ''}>
                <td>{fmt(c.needBy, 'shortY')}</td><td>{zoneLabel(c.zone)}</td><td>{c.activityName || '—'}{c.activityStart && <small className="sub">Starts {fmt(c.activityStart, 'shortY')}</small>}</td><td>{c.trade}</td><td>{c.type}</td><td>{c.what}</td><td>{c.responsible}</td><td>{c.status === 'Cleared' ? 'Cleared ' + fmt(c.clearedOn) : 'Open'}</td>
                <td className="nowrap">{can('log') && <button type="button" className="btn small" onClick={() => toggle(c)}>{c.status === 'Cleared' ? 'Reopen' : 'Mark cleared'}</button>} {can('log') && (c.by === user.id || user.role === 'Owner') && <button type="button" className="link" onClick={() => write(() => api.deleteRecord('constraints', c.id), 'Constraint deleted')}>Delete</button>}</td></tr>))}</tbody></table></div>
        ) : <Empty>{openOnly ? 'No open constraints.' : 'No constraints logged yet.'}</Empty>}
      </div>
      <div className="card">
        <div className="card-h"><h2>Lookahead by zone</h2>
          <div className="seg"><button type="button" className={!startOnly ? 'on' : ''} onClick={() => setStartOnly(false)}>All activities</button><button type="button" className={startOnly ? 'on' : ''} onClick={() => setStartOnly(true)}>Starting only (make-ready)</button></div></div>
        <p className="note">Green edge = starts that week. ⚠ = open constraint on that activity.</p>
        <Matrix groups={groupRows(pool, data.zones)} cols={weeks}
          cell={(r, c) => r.items.filter((a) => overlaps(a, c.days) && (!startOnly || starts(a, c))).map((a) => { const k = open.filter((x) => isFor(x, a)).length; return { a, start: starts(a, c), tag: k ? <span className="warn">⚠ {k}</span> : null }; })}
          note={(a, c) => (starts(a, c) ? <small> starts {fmt(a.start)}</small> : null)} />
      </div>
      {adding && <ConstraintForm onClose={() => setAdding(false)} />}
    </section>
  );
}
