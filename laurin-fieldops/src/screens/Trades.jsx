import React, { useMemo, useState } from 'react';
import { useApp } from '../store.jsx';
import { DateBar } from '../ui/common.jsx';
import { Empty, Kpi, Status } from '../ui/parts.jsx';
import { activeOn, onZone, ppc, STATUSES } from '../logic/schedule.js';
import { addDays, fmt, mondayOf } from '../logic/dates.js';

// Zones in ascending order: Zone 1 … Zone 25 by number, then the other codes A–Z (C1, EL, R-107, ST1, W1 …).
const zoneSort = (a, b) => {
  const n = (c) => (/^Zone \d+$/.test(c) ? +c.slice(5) : null);
  const x = n(a.code), y = n(b.code);
  if (x != null && y != null) return x - y;
  if (x != null) return -1;
  if (y != null) return 1;
  return a.code.localeCompare(b.code, undefined, { numeric: true });
};

export default function Trades() {
  const { data, derived, day, can, user, api, write } = useApp();
  const week = mondayOf(day);
  const trades = useMemo(() => {
    const extra = [...new Set(data.actuals.map((e) => e.trade).concat(data.commitments.map((c) => c.trade)))].filter((t) => t && !data.trades.includes(t)).sort();
    return [...data.trades, ...extra];
  }, [data]);
  const [trade, setTrade] = useState(trades[0] || '');
  const zones = useMemo(() => [...data.zones].sort(zoneSort), [data]);

  // Form: one task, several zones. Crew is entered per zone, so totals aren't double counted.
  const blank = { task: '', status: 'Unscheduled work', pct: '', notes: '', item: '' };
  const [f, setF] = useState(blank);
  const [picked, setPicked] = useState({}); // zone code -> crew ('' allowed)
  const [msg, setMsg] = useState('');
  const codes = Object.keys(picked);
  const today = useMemo(() => activeOn(derived.items, day, data.calendar), [derived, day, data]);
  // Linking to a scheduled activity is offered when exactly one zone is ticked (same as Log actual on the Day screen).
  const opts = codes.length === 1 ? today.filter((a) => onZone(a, codes[0])) : [];
  const sel = opts.find((a) => String(a.uid) === f.item);
  const toggle = (code) => setPicked((p) => { const n = { ...p }; if (code in n) delete n[code]; else n[code] = ''; return n; });

  const save = async () => {
    setMsg('');
    if (!trade) return setMsg('Pick a trade.');
    if (!codes.length) return setMsg('Tick at least one zone.');
    if (!sel && !f.task.trim()) return setMsg('Describe the task.');
    const ordered = zones.filter((z) => z.code in picked).map((z) => z.code);
    const ok = await write(async () => {
      for (const zone of ordered) {
        await api.saveRecord('actuals', {
          day, zone,
          activityUid: sel && sel.category !== 'takt' ? sel.uid : null, wagon: sel && sel.category === 'takt' ? sel.wagon : '', activityName: sel ? sel.name : '',
          status: sel ? f.status : 'Unscheduled work', trade,
          crew: picked[zone] === '' ? null : +picked[zone], pct: f.pct === '' ? null : +f.pct,
          notes: [f.task.trim(), f.notes.trim()].filter(Boolean).join(' · '),
          by: user.id, at: new Date().toISOString(),
        });
      }
    }, `${trade}: logged in ${ordered.length} zone${ordered.length === 1 ? '' : 's'}`);
    if (ok) { setF(blank); setPicked({}); }
  };

  // This trade's work for the week, grouped by zone.
  const wkEnd = addDays(week, 6);
  const mine = data.actuals.filter((e) => e.trade === trade && e.day >= week && e.day <= wkEnd).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const byZone = zones.map((z) => [z.code, mine.filter((e) => e.zone === z.code)]).filter(([, l]) => l.length)
    .concat([...new Set(mine.map((e) => e.zone))].filter((c) => !zones.some((z) => z.code === c)).map((c) => [c, mine.filter((e) => e.zone === c)]));
  const P = ppc(data.commitments.filter((c) => c.trade === trade && c.week === week));
  const P8 = ppc(data.commitments.filter((c) => c.trade === trade && c.week >= addDays(week, -49) && c.week <= week));
  const crewDays = mine.reduce((s, e) => s + (+e.crew || 0), 0);

  return (
    <section className="screen">
      <DateBar />
      <div className="card">
        <h2>Trade</h2>
        <div className="row" style={{ gap: 6 }}>{trades.map((t) => <button type="button" key={t} className={'btn small' + (t === trade ? ' primary' : '')} aria-pressed={t === trade} onClick={() => setTrade(t)}>{t}</button>)}</div>
      </div>
      {trade && (
        <>
          <div className="kpis">
            <Kpi v={P.pct == null ? '—' : P.pct + '%'} l={`PPC this week (${P.done} of ${P.total} commitments)`} />
            <Kpi v={P8.pct == null ? '—' : P8.pct + '%'} l={`PPC last 8 weeks (${P8.done} of ${P8.total})`} />
            <Kpi v={mine.length} l="Actuals logged this week" tone="mute" />
            <Kpi v={byZone.length} l="Zones worked this week" tone="mute" />
            <Kpi v={crewDays} l="Crew-days this week" tone="mute" />
          </div>
          {can('log') && (
            <div className="card">
              <h2>Log {trade} work · {fmt(day, 'long')}</h2>
              <p className="note">Tick every zone the task happened in. One actual is saved per zone, with that zone's crew. To link it to a scheduled activity, tick a single zone.</p>
              <div className="form">
                <label className="field wide"><span>Task</span><input value={f.task} maxLength={200} onChange={(e) => setF({ ...f, task: e.target.value })} placeholder="e.g. Board ceilings, level 2 corridor" /></label>
                {codes.length === 1 && (
                  <label className="field"><span>Scheduled activity (optional)</span>
                    <select value={f.item} onChange={(e) => setF({ ...f, item: e.target.value, status: e.target.value ? 'Worked as planned' : 'Unscheduled work' })}>
                      <option value="">Not on the schedule</option>{opts.map((a) => <option key={a.uid} value={a.uid}>{a.name}</option>)}
                    </select></label>
                )}
                <label className="field"><span>Status</span>
                  <select value={sel ? f.status : 'Unscheduled work'} disabled={!sel} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
                <label className="field"><span>Field % complete</span><input type="number" min="0" max="100" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></label>
                <label className="field wide"><span>Notes</span><textarea value={f.notes} maxLength={800} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
              </div>
              <h3 style={{ margin: '14px 0 6px' }}>Zones{codes.length ? ` · ${codes.length} ticked` : ''}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
                {zones.map((z) => (
                  <div key={z.code} className="row" style={{ gap: 4, border: '1px solid var(--line)', borderRadius: 6, padding: '4px 6px', background: z.code in picked ? 'rgba(56,137,58,.10)' : 'transparent' }}>
                    <label className="inline" style={{ color: 'inherit', flex: 1 }} title={z.rooms}><input type="checkbox" checked={z.code in picked} onChange={() => toggle(z.code)} /> {z.code}</label>
                    {z.code in picked && <input type="number" min="0" max="500" value={picked[z.code]} onChange={(e) => setPicked({ ...picked, [z.code]: e.target.value })} placeholder="crew" aria-label={`Crew in ${z.code}`} style={{ width: 58 }} />}
                  </div>
                ))}
              </div>
              <div className="form-a" style={{ marginTop: 12 }}><button type="button" className="btn primary" onClick={save}>Log in {codes.length || ''} zone{codes.length === 1 ? '' : 's'}</button><button type="button" className="btn" onClick={() => setPicked({})} disabled={!codes.length}>Clear zones</button><span className="msg bad">{msg}</span></div>
            </div>
          )}
          <div className="card">
            <h2>{trade} by zone · week of {fmt(week, 'shortY')}</h2>
            {byZone.length ? byZone.map(([code, list]) => (
              <details key={code} className="bucket" open>
                <summary>{code} <span>· {list.length} entr{list.length === 1 ? 'y' : 'ies'} · {list.reduce((s, e) => s + (+e.crew || 0), 0)} crew-days</span></summary>
                <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Day</th><th>Work</th><th>Status</th><th>Crew</th><th>%</th><th>Notes</th><th>By</th><th /></tr></thead>
                  <tbody>{list.map((e) => (
                    <tr key={e.id}><td>{fmt(e.day, 'wk')}</td><td>{e.activityName || 'Unscheduled'}</td><td><Status s={e.status} /></td><td>{e.crew ?? ''}</td><td>{e.pct != null ? e.pct + '%' : ''}</td><td>{e.notes}</td><td>{data.users.find((u) => u.id === e.by)?.name || e.byName || ''}</td>
                      <td>{can('log') && (e.by === user.id || user.role === 'Owner') && <button type="button" className="link" onClick={() => write(() => api.deleteRecord('actuals', e.id), 'Entry deleted')}>Delete</button>}</td></tr>))}</tbody></table></div>
              </details>
            )) : <Empty>No {trade} work logged this week.</Empty>}
          </div>
        </>
      )}
    </section>
  );
}
