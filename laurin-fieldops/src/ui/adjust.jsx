import React, { useMemo, useState } from 'react';
import { useApp } from '../store.jsx';
import { Drawer, Field } from './parts.jsx';
import { REASONS, STATUSES } from '../logic/schedule.js';
import { EXT, forecastSchedule, keyMilestones, makeWorkdays } from '../logic/forecast.js';
import { computeTakt } from '../logic/takt.js';
import { addDays, fmt } from '../logic/dates.js';

// "Not happening": the owner pushes a schedule activity or a takt wagon-zone by working days.
// The preview runs the same forecast as the app, so what you see before saving is what happens after.
export function AdjustForm() {
  const { adjust: a, setAdjust, data, derived, user, api, write, today, day } = useApp();
  const [mode, setMode] = useState('days');
  const [days, setDays] = useState(1);
  const [until, setUntil] = useState(addDays(a.start, 7));
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const W = useMemo(() => makeWorkdays(data.calendar, addDays(a.start, -10), addDays(a.start, 800)), [a, data]);
  const n = mode === 'days' ? Math.max(0, Math.round(+days || 0)) : Math.max(0, W.idx(until) - W.idx(a.start));
  const target = pushTarget(a);
  const close = () => setAdjust(null);

  const preview = usePushPreview(a, n);

  const save = async () => {
    if (!n) return setMsg('Enter at least 1 working day, or a date after the current start.');
    if (!reason) return setMsg('Pick a reason.');
    const ok = await write(() => api.saveRecord('adjustments', { target, name: a.name, path: a.path, days: n, reason, note: note.trim(), fromStart: a.start, delayFrom: a.start <= day && day <= a.finish ? day : null, by: user.id, at: new Date().toISOString() }), `${a.name} pushed ${n} working day${n === 1 ? '' : 's'}`);
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
      <PushImpact a={a} n={n} preview={preview} />
      <div className="form-a"><button type="button" className="btn primary" onClick={save}>Push schedule</button><span className="msg bad">{msg}</span></div>
    </Drawer>
  );
}

export function NotHappening({ a }) {
  const { can, setAdjust } = useApp();
  if (!can('plan') || a.category === 'site' && a.milestone) return null;
  return <button type="button" className="btn small warnb" onClick={(e) => { e.stopPropagation(); setAdjust(a); }}>Not happening</button>;
}

// Shared with "Log actual" (status Not worked): what a push would do, before it's saved.
export const pushTarget = (a) => (a.category === 'takt' ? 'tk:' + a.wagon + '|' + a.zones[0] : a.uid);
export function usePushPreview(a, n, ext = false) {
  const { data, derived, today } = useApp();
  const target = a ? pushTarget(a) : null;
  return useMemo(() => {
    if (!a || !n) return null;
    const adj = [...derived.adjustments, { target, days: n, reason: ext ? EXT : '' }];
    const FC = forecastSchedule(data.activities, adj, data.calendar);
    const before = new Map(derived.FC.rows.map((r) => [r.uid, r]));
    const movedNow = FC.rows.filter((r) => r.finish !== before.get(r.uid)?.finish || r.start !== before.get(r.uid)?.start).map((r) => ({ ...r, by: Math.max(r.shift + r.ext - (before.get(r.uid)?.shift || 0) - (before.get(r.uid)?.ext || 0), r.shift - (before.get(r.uid)?.shift || 0)) }));
    const ms = keyMilestones(FC.rows).map((m) => ({ name: m.name, was: before.get(m.uid)?.finish, now: m.finish }));
    let takt = null;
    if (a.category === 'takt') {
      const TP = computeTakt({ takt: data.takt, activities: FC.rows, calendar: data.calendar, actuals: data.actuals, commitments: data.commitments, constraints: data.constraints, adjustments: adj, today });
      takt = { was: derived.TP.forecastEnd, now: TP.forecastEnd, cells: TP.cells.filter((c) => c.ff !== derived.TP.cells.find((x) => x.key === c.key)?.ff).length };
    }
    return { moved: movedNow.length, top: movedNow.sort((x, y) => y.by - x.by).slice(0, 6), ms, takt };
  }, [n, target, derived, ext]); // eslint-disable-line
}
export function PushImpact({ a, n, preview, ext }) {
  return (
    preview ? (
        <div className="impact">
          <h3>What this does</h3>
          <p><b>{a.name}</b> {ext ? 'finishes' : 'moves'} {n} working day{n === 1 ? '' : 's'}{ext ? ' later' : ''}. {preview.moved > 1 ? `${preview.moved - 1} other activit${preview.moved === 2 ? 'y moves' : 'ies move'} with it through the schedule logic.` : a.category === 'takt' ? '' : 'Nothing else moves: its successors have enough slack.'}</p>
          {preview.takt && <p>Takt: {preview.takt.cells} wagon-zones move; train finish {fmt(preview.takt.was, 'shortY')} → <b>{fmt(preview.takt.now, 'shortY')}</b>.</p>}
          {preview.ms.map((m) => <p key={m.name}>{m.name}: {m.now === m.was ? `no change (${fmt(m.now, 'shortY')})` : <>{fmt(m.was, 'shortY')} → <b className="bad">{fmt(m.now, 'shortY')}</b></>}</p>)}
          {preview.top.length > 1 && <ul className="plain">{preview.top.map((r) => <li key={r.uid}>{r.name} <span className="sub-i">({r.path.split(' › ').slice(-1)[0]})</span> +{r.by}</li>)}</ul>}
        </div>
    ) : null
  );
}

// "Confirmed": the field confirms the expected completion of a task on today's plan, or extends it.
// Confirm logs a field entry (Worked as planned). Extend also adds an extension: the finish moves out
// by working days and everything that follows it moves through the schedule logic, like a push.
const CONFIRM = 'Confirmed: ';
export const lastConfirm = (actuals, a) => actuals.filter((e) => (a.category === 'takt' ? e.wagon === a.wagon && e.zone === a.zones[0] : e.activityUid === a.uid) && /^(Confirmed|Extended|Extension requested): /.test(e.notes || '')).sort((x, y) => (x.day + (x.at || '') < y.day + (y.at || '') ? 1 : -1))[0];
const zoneKeyOf = (a) => (a.category === 'site' ? 'site' : a.category === 'unplaced' ? 'bucket:' + a.bucket : a.zones[0] || 'site');

export const pendingExt = (data, a) => (data.extRequests || []).find((x) => x.status === 'Pending' && String(x.target) === String(pushTarget(a)));
export function Confirmed({ a }) {
  const { data, owns } = useApp();
  const [open, setOpen] = useState(false);
  const pend = pendingExt(data, a);
  const tag = pend ? <span className="tag warn" title={`Asked for +${pend.days} working day${pend.days === 1 ? '' : 's'} (${pend.reason}); waiting for an owner or super`}>Extension requested +{pend.days}d</span> : null;
  if (!owns(a) || a.milestone) return tag;
  return (
    <>
      {tag}
      <button type="button" className="btn small okb" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>Confirmed</button>
      {open && <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}><ConfirmForm a={a} onClose={() => setOpen(false)} /></div>}
    </>
  );
}

function ConfirmForm({ a, onClose }) {
  const { data, user, api, write, day, foreman } = useApp();
  const [mode, setMode] = useState('confirm');
  const [until, setUntil] = useState(a.finish);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const W = useMemo(() => makeWorkdays(data.calendar, addDays(a.finish, -10), addDays(a.finish, 800)), [a, data]);
  const n = mode === 'extend' ? Math.max(0, W.idx(until) - W.idx(a.finish)) : 0;
  const preview = usePushPreview(mode === 'extend' ? a : null, n, true);
  const newFinish = n ? W.at(W.idx(a.finish) + n) : a.finish;
  const save = async () => {
    if (mode === 'extend' && !n) return setMsg('Pick a completion date after ' + fmt(a.finish, 'shortY') + ' (a working day).');
    if (mode === 'extend' && !reason) return setMsg('Pick a reason for the extension.');
    if (mode === 'extend' && foreman && pendingExt(data, a)) return setMsg('There is already an extension waiting for approval on this task.');
    const base = { day, zone: zoneKeyOf(a), activityUid: a.category !== 'takt' ? a.uid : null, wagon: a.category === 'takt' ? a.wagon : '', activityName: a.name, trade: a.trade && data.trades.includes(a.trade) ? a.trade : '', by: user.id, at: new Date().toISOString() };
    const ok = await write(async () => {
      if (mode === 'confirm') {
        await api.saveRecord('actuals', { ...base, status: STATUSES[0], notes: `${CONFIRM}expected completion ${fmt(a.finish, 'shortY')}${note.trim() ? ' — ' + note.trim() : ''}` });
      } else if (foreman) {
        // Foremen ask; the schedule moves only when an Owner or Super approves (Extensions screen).
        await api.requestExtension({ target: pushTarget(a), name: a.name, path: a.path, trade: a.trade || '', days: n, fromFinish: a.finish, newFinish, reason, note: note.trim(), requestedBy: user.id });
        await api.saveRecord('actuals', { ...base, status: a.category === 'takt' ? STATUSES[0] : 'Partial / behind', notes: `Extension requested: completion ${fmt(a.finish, 'shortY')} \u2192 ${fmt(newFinish, 'shortY')} (+${n} working day${n === 1 ? '' : 's'}) \u00b7 ${reason}${note.trim() ? ' \u2014 ' + note.trim() : ''}` });
      } else {
        await api.saveRecord('adjustments', { target: pushTarget(a), name: a.name, path: a.path, days: n, reason: EXT + reason, note: note.trim(), fromStart: a.start, delayFrom: null, by: user.id, at: new Date().toISOString() });
        // Takt cells already count the extension as lost days; a Partial entry there would count it twice.
        await api.saveRecord('actuals', { ...base, status: a.category === 'takt' ? STATUSES[0] : 'Partial / behind', notes: `Extended: completion ${fmt(a.finish, 'shortY')} → ${fmt(newFinish, 'shortY')} (+${n} working day${n === 1 ? '' : 's'}) · ${reason}${note.trim() ? ' — ' + note.trim() : ''}` });
      }
    }, mode === 'confirm' ? `${a.name}: completion ${fmt(a.finish, 'shortY')} confirmed` : foreman ? `${a.name}: extension to ${fmt(newFinish, 'shortY')} sent for approval` : `${a.name}: completion extended to ${fmt(newFinish, 'shortY')}`);
    if (ok) onClose();
  };
  return (
    <Drawer title="Confirmed: expected completion" onClose={onClose}>
      <div className="adj-item">
        <b>{a.name}</b>
        <span className="sub">{a.category === 'takt' ? `Takt wagon in ${a.zones[0]}` : a.path}</span>
        <span>Started {fmt(a.start, 'shortY')} · expected completion <b>{fmt(a.finish, 'shortY')}</b>{a.finish !== a.baseFinish && a.baseFinish ? ` (baseline ${fmt(a.baseFinish, 'shortY')})` : ''}</span>
      </div>
      <div className="form">
        <div className="seg wide"><button type="button" className={mode === 'confirm' ? 'on' : ''} onClick={() => setMode('confirm')}>Confirm {fmt(a.finish)}</button><button type="button" className={mode === 'extend' ? 'on' : ''} onClick={() => setMode('extend')}>Extend</button></div>
        {mode === 'extend' && <>
          <Field label="New expected completion"><input type="date" value={until} min={a.finish} onChange={(e) => setUntil(e.target.value)} /></Field>
          <Field label="Reason"><select value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Pick a reason…</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
        </>}
        <Field label="Note" wide><textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'extend' ? 'Why it needs more time' : 'Optional'} /></Field>
      </div>
      {mode === 'extend' && n > 0 && <p className="note">Completion {fmt(a.finish, 'shortY')} → <b>{fmt(newFinish, 'shortY')}</b>: +{n} working day{n === 1 ? '' : 's'}. The start stays {fmt(a.start, 'shortY')}.</p>}
      {mode === 'extend' && foreman && <p className="note">This goes to an owner or super for approval. The schedule moves only once they approve it.</p>}
      {mode === 'extend' && <PushImpact a={a} n={n} preview={preview} ext />}
      <div className="form-a"><button type="button" className="btn primary" onClick={save}>{mode === 'confirm' ? 'Confirm completion' : foreman ? 'Send extension for approval' : 'Extend and update schedule'}</button><span className="msg bad">{msg}</span></div>
    </Drawer>
  );
}
