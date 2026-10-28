import React, { useMemo, useState } from 'react';
import { useApp } from '../store.jsx';
import { DateBar, Matrix } from '../ui/common.jsx';
import { Empty, Kpi } from '../ui/parts.jsx';
import { CommitmentForm, zoneLabel } from '../ui/forms.jsx';
import { groupRows, isFor, overlaps, ppc, REASONS } from '../logic/schedule.js';
import { addDays, fmt, shutdownOn, weekDays } from '../logic/dates.js';

export default function Wwp() {
  const { data, derived, week, can, api, write, user } = useApp();
  const [adding, setAdding] = useState(false);
  const cols = weekDays(week).map((d) => { const s = shutdownOn(d, data.calendar); return { key: d, label: fmt(d, 'wk') + (s ? ' · ' + s.name : ''), off: !!s }; });
  const days = cols.filter((c) => !c.off).map((c) => c.key);
  const inWeek = useMemo(() => derived.items.filter((a) => overlaps(a, days)), [derived, week]); // eslint-disable-line
  const cm = data.commitments.filter((c) => c.week === week);
  const P = ppc(cm);
  const trend = Array.from({ length: 8 }, (_, i) => addDays(week, -7 * (7 - i))).map((w) => ({ w, ...ppc(data.commitments.filter((c) => c.week === w)) }));
  const misses = data.commitments.filter((c) => c.status === 'Not complete' && c.week >= trend[0].w && c.week <= week);
  const reasons = [...misses.reduce((m, c) => m.set(c.reason || 'No reason given', (m.get(c.reason || 'No reason given') || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
  const byTrade = [...cm.reduce((m, c) => m.set(c.trade || 'No trade given', [...(m.get(c.trade || 'No trade given') || []), c]), new Map())].map(([t, rows]) => [t, ppc(rows)]);
  const ents = data.actuals.filter((e) => e.day >= week && e.day <= addDays(week, 4));
  const upd = (c, patch) => write(() => api.saveRecord('commitments', { ...c, ...patch, updatedBy: user.id, updatedAt: new Date().toISOString() }), 'Commitment updated');

  return (
    <section className="screen">
      <DateBar weekly />
      <div className="kpis">
        <Kpi v={inWeek.length} l="Activities this week (incl. takt)" />
        <Kpi v={inWeek.filter((a) => a.start >= week && a.start <= addDays(week, 6)).length} l="Starting this week" />
        <Kpi v={P.pct == null ? '—' : P.pct + '%'} l={`PPC this week (${P.done} of ${P.total})`} />
        <Kpi v={days.length} l="Working days" tone="mute" />
      </div>
      <div className="card">
        <div className="card-h"><h2>Commitments &amp; PPC</h2>{can('log') && <button type="button" className="btn primary" onClick={() => setAdding(true)}>Add commitment</button>}</div>
        <p className="note">What each trade commits to finish this week. Close each one out Friday. PPC = completed ÷ committed.</p>
        <div className="ppc">
          <div><h4>PPC, last 8 weeks</h4><div className="trend">{trend.map((t) => <div key={t.w} className={t.w === week ? 'cur' : ''} title={'Week of ' + fmt(t.w, 'shortY')}><span>{t.pct == null ? '—' : t.pct + '%'}</span><i style={{ height: t.pct == null ? 0 : Math.max(2, t.pct * 0.7) + 'px' }} /><span>{fmt(t.w)}</span></div>)}</div></div>
          <div><h4>PPC by trade, this week</h4>{byTrade.length ? byTrade.map(([t, p]) => <div key={t} className="bar"><span>{t}</span><span className="bar-t"><i style={{ width: p.pct + '%' }} /></span><span>{p.pct}% ({p.done}/{p.total})</span></div>) : <Empty>No commitments this week.</Empty>}</div>
          <div><h4>Reasons for misses, last 8 weeks</h4>{reasons.length ? reasons.map(([r, n]) => <div key={r} className="bar"><span>{r}</span><span className="bar-t bad"><i style={{ width: (100 * n) / reasons[0][1] + '%' }} /></span><span>{n}</span></div>) : <Empty>No misses recorded.</Empty>}</div>
        </div>
        {cm.length ? (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Zone</th><th>Commitment</th><th>Trade</th><th>By</th><th>Due</th><th>Status</th><th>Reason if missed</th><th /></tr></thead>
            <tbody>{cm.map((c) => (
              <tr key={c.id}><td>{zoneLabel(c.zone)}</td><td>{c.what}{c.activityName && c.activityName !== c.what && <small className="sub">Schedule: {c.activityName}</small>}</td><td>{c.trade}</td><td>{c.committedBy}</td><td>{c.due ? fmt(c.due, 'wk') : 'End of week'}</td>
                <td>{can('log') ? <select value={c.status} onChange={(e) => upd(c, { status: e.target.value, reason: e.target.value === 'Not complete' ? c.reason : '' })}>{['Open', 'Complete', 'Not complete'].map((s) => <option key={s}>{s}</option>)}</select> : c.status}</td>
                <td>{c.status === 'Not complete' && (can('log') ? <select value={c.reason} onChange={(e) => upd(c, { reason: e.target.value })}><option value="">Pick a reason…</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select> : c.reason)}</td>
                <td>{can('log') && (c.by === user.id || user.role === 'Owner') && <button type="button" className="link" onClick={() => write(() => api.deleteRecord('commitments', c.id), 'Commitment deleted')}>Delete</button>}</td></tr>))}</tbody></table></div>
        ) : <Empty>No commitments for this week yet.</Empty>}
      </div>
      <div className="card">
        <h2>Weekly work plan · week of {fmt(week, 'shortY')}</h2>
        <p className="note">From the master schedule and takt plan. Green edge = starts that day; red outline = critical. Tags under an item come from the field log.</p>
        <Matrix groups={groupRows(inWeek, data.zones)} cols={cols}
          cell={(r, c) => r.items.filter((a) => a.start <= c.key && a.finish >= c.key).map((a) => {
            const k = cm.filter((x) => isFor(x, a));
            return { a, start: a.start === c.key, tag: k.length ? <span className="cm">{k.every((x) => x.status === 'Complete') ? 'Committed ✓' : k.some((x) => x.status === 'Not complete') ? 'Committed ✗' : 'Committed'}</span> : null };
          })}
          entriesFor={(a, c) => ents.filter((e) => e.day === c.key && isFor(e, a))} />
      </div>
      {adding && <CommitmentForm onClose={() => setAdding(false)} />}
    </section>
  );
}
