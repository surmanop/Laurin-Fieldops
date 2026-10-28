import React, { useMemo, useState } from 'react';
import { useApp } from '../store.jsx';
import { Drawer, Field } from './parts.jsx';
import { REASONS } from '../logic/schedule.js';
import { forecastSchedule, keyMilestones, makeWorkdays } from '../logic/forecast.js';
import { computeTakt } from '../logic/takt.js';
import { addDays, fmt } from '../logic/dates.js';

// "Not happening": the owner pushes a schedule activity or a takt wagon-zone by working days.
// The preview runs the same forecast as the app, so what you see before saving is what happens after.
export function AdjustForm() {
  const { adjust: a, setAdjust, data, derived, user, api, write, today } = useApp();
  const [mode, setMode] = useState('days');
  const [days, setDays] = useState(1);
  const [until, setUntil] = useState(addDays(a.start, 7));
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const W = useMemo(() => makeWorkdays(data.calendar, addDays(a.start, -10), addDays(a.start, 800)), [a, data]);
  const n = mode === 'days' ? Math.max(0, Math.round(+days || 0)) : Math.max(0, W.idx(until) - W.idx(a.start));
  const target = a.category === 'takt' ? 'tk:' + a.wagon + '|' + a.zones[0] : a.uid;
  const close = () => setAdjust(null);

  const preview = useMemo(() => {
    if (!n) return null;
    const adj = [...derived.adjustments, { target, days: n }];
    const FC = forecastSchedule(data.activities, adj, data.calendar);
    const before = new Map(derived.FC.rows.map((r) => [r.uid, r]));
    const movedNow = FC.rows.filter((r) => r.shift !== (before.get(r.uid)?.shift || 0));
    const ms = keyMilestones(FC.rows).map((m) => ({ name: m.name, was: before.get(m.uid)?.finish, now: m.finish }));
    let takt = null;
    if (a.category === 'takt') {
      const TP = computeTakt({ takt: data.takt, activities: FC.rows, calendar: data.calendar, actuals: data.actuals, commitments: data.commitments, constraints: data.constraints, adjustments: adj, today });
      takt = { was: derived.TP.forecastEnd, now: TP.forecastEnd, cells: TP.cells.filter((c) => c.ff !== derived.TP.cells.find((x) => x.key === c.key)?.ff).length };
    }
    return { moved: movedNow.length, top: movedNow.sort((x, y) => y.shift - x.shift).slice(0, 6), ms, takt };
  }, [n, target]); // eslint-disable-line

  const save = async () => {
    if (!n) return setMsg('Enter at least 1 working day, or a date after the current start.');
    if (!reason) return setMsg('Pick a reason.');
    const ok = await write(() => api.saveRecord('adjustments', { target, name: a.name, path: a.path, days: n, reason, note: note.trim(), fromStart: a.start, by: user.id, at: new Date().toISOString() }), `${a.name} pushed ${n} working day${n === 1 ? '' : 's'}`);
    if (ok) close();
  };

  return (
    <Drawer title="Not happening: push the schedule" onClose={close}>
      <div className="adj-item">
        <b>{a.name}</b>
        <span className="sub">{a.category === 'takt' ? `Takt wagon in ${a.zones[0]}` : a.path}</span>
        <span>Now {fmt(a.start)} – {fmt(a.finish, 'shortY')}{a.shift ? ` (already +${a.shift} from ${fmt(a.baseStart)} – ${fmt(a.baseFinish, 'shortY')})` : ''}{a.category === 'takt' && a.slip > 0 ? ` (already +${a.slip} vs takt plan)` : ''}</span>
      </div>
      <div className="form">
        <div className="seg wide"><button type="button" className={mode === 'days' ? 'on' : ''} onClick={() => setMode('days')}>Push by working days</button><button type="button" className={mode === 'until' ? 'on' : ''} onClick={() => setMode('until')}>Not starting until</button></div>
        {mode === 'days'
          ? <Field label="Working days to push"><input type="number" min="1" max="200" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
          : <Field label="Earliest it can start"><input type="date" value={until} min={a.start} onChange={(e) => setUntil(e.target.value)} /></Field>}
        <Field label="Reason"><select value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Pick a reason…</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Note" wide><textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="What's holding it up" /></Field>
      </div>
      {preview && (
        <div className="impact">
          <h3>What this does</h3>
          <p><b>{a.name}</b> moves {n} working day{n === 1 ? '' : 's'}. {preview.moved > 1 ? `${preview.moved - 1} other activit${preview.moved === 2 ? 'y moves' : 'ies move'} with it through the schedule logic.` : a.category === 'takt' ? '' : 'Nothing else moves: its successors have enough slack.'}</p>
          {preview.takt && <p>Takt: {preview.takt.cells} wagon-zones move; train finish {fmt(preview.takt.was, 'shortY')} → <b>{fmt(preview.takt.now, 'shortY')}</b>.</p>}
          {preview.ms.map((m) => <p key={m.name}>{m.name}: {m.now === m.was ? `no change (${fmt(m.now, 'shortY')})` : <>{fmt(m.was, 'shortY')} → <b className="bad">{fmt(m.now, 'shortY')}</b></>}</p>)}
          {preview.top.length > 1 && <ul className="plain">{preview.top.map((r) => <li key={r.uid}>{r.name} <span className="sub-i">({r.path.split(' › ').slice(-1)[0]})</span> +{r.shift}</li>)}</ul>}
        </div>
      )}
      <div className="form-a"><button type="button" className="btn primary" onClick={save}>Push schedule</button><span className="msg bad">{msg}</span></div>
    </Drawer>
  );
}

export function NotHappening({ a }) {
  const { can, setAdjust } = useApp();
  if (!can('plan') || a.category === 'site' && a.milestone) return null;
  return <button type="button" className="btn small warnb" onClick={(e) => { e.stopPropagation(); setAdjust(a); }}>Not happening</button>;
}
