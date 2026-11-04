import React, { useMemo, useState } from 'react';
import { useApp } from '../store.jsx';
import { Drawer, Field } from './parts.jsx';
import { STATUSES, REASONS, CTYPES, inGap, onZone, overlaps } from '../logic/schedule.js';
import { addDays, fmt, weekDays } from '../logic/dates.js';
import { PushImpact, pushTarget, usePushPreview } from './adjust.jsx';

// Zone picker: takt zones, main-floor Areas, unplaced buckets, site.
function ZoneSelect({ value, onChange }) {
  const { data } = useApp();
  const buckets = useMemo(() => [...new Set(data.activities.filter((a) => a.category === 'unplaced').map((a) => a.bucket))].sort(), [data]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">Choose…</option>
      <optgroup label="Takt zones">{[...data.zones].sort((a, b) => a.order - b.order).map((z) => <option key={z.code} value={z.code}>{z.code} · {z.rooms}</option>)}</optgroup>
      <optgroup label="Not placed in a zone">{buckets.map((b) => <option key={b} value={'bucket:' + b}>{b}</option>)}</optgroup>
      <option value="site">Site / building-wide</option>
    </select>
  );
}
const itemsForKey = (items, key) => !key ? [] : key === 'site' ? items.filter((a) => a.category === 'site') : key.startsWith('bucket:') ? items.filter((a) => a.category === 'unplaced' && a.bucket === key.slice(7)) : items.filter((a) => onZone(a, key));
const label = (key) => (key === 'site' ? 'Site / building-wide' : key.startsWith('bucket:') ? key.slice(7) : key);
const link = (a) => ({ activityUid: a && a.category !== 'takt' ? a.uid : null, wagon: a && a.category === 'takt' ? a.wagon : '', activityName: a ? a.name : '' });

// "Specialty" is saved with what it is, e.g. "Specialty: Lockers", so manpower and By trade can tell them apart.
export const SPECIALTY = 'Specialty';
export const isSpecialty = (t) => t === SPECIALTY || (t || '').startsWith(SPECIALTY + ': ');
export const specialtyName = (t) => ((t || '').startsWith(SPECIALTY + ': ') ? t.slice(SPECIALTY.length + 2) : '');
export const specialtyTrade = (name) => (name.trim() ? `${SPECIALTY}: ${name.replace(/^\s+/, '')}` : SPECIALTY); // trimmed again when saved

export function TradeSelect({ value, onChange }) {
  const { data } = useApp();
  const spec = isSpecialty(value) && data.trades.includes(SPECIALTY);
  const known = !value || spec || data.trades.includes(value);
  const [other, setOther] = useState(!known);
  const sel = other ? '__other' : spec ? SPECIALTY : value;
  return (
    <>
      <select value={sel} onChange={(e) => { const v = e.target.value; if (v === '__other') { setOther(true); onChange(''); } else { setOther(false); onChange(v); } }}>
        <option value="">Choose…</option>{data.trades.map((t) => <option key={t}>{t}</option>)}<option value="__other">Other (type it)</option>
      </select>
      {other && <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type the trade" maxLength={80} />}
      {!other && spec && <input value={specialtyName(value)} onChange={(e) => onChange(specialtyTrade(e.target.value))} placeholder="Which specialty? e.g. Lockers" maxLength={60} aria-label="Specialty trade" />}
    </>
  );
}

export function ActualForm({ zoneKey, onClose }) {
  const { data, derived, day, user, api, write } = useApp();
  const [f, setF] = useState({ zone: zoneKey || '', item: '', status: 'Worked as planned', trade: '', crew: '', days: '', pct: '', notes: '', push: true, pushDays: 1, reason: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  // Every task in the zone, not just today's: scheduled this day first, then the rest by start date.
  const inZone = useMemo(() => itemsForKey(derived.items, f.zone), [derived, f.zone]);
  const onDay = inZone.filter((a) => a.start <= day && a.finish >= day && !inGap(a, day));
  const others = inZone.filter((a) => !onDay.includes(a)).sort((x, y) => (x.start < y.start ? -1 : x.start > y.start ? 1 : x.name.localeCompare(y.name)));
  const opts = [...onDay, ...others];
  const label = (a) => `${a.name}${a.category === 'areawide' ? ` (${a.area}-wide)` : ''}`;
  const sel = opts.find((a) => String(a.uid) === f.item);
  const [msg, setMsg] = useState('');
  // "Not worked" on a scheduled item = Not happening: push it (and what depends on it) through the schedule.
  const canPush = !!sel && f.status === 'Not worked' && !(sel.category === 'site' && sel.milestone);
  const pushN = canPush && f.push ? Math.max(0, Math.round(+f.pushDays || 0)) : 0;
  const preview = usePushPreview(canPush ? sel : null, pushN);
  const save = async () => {
    if (!f.zone) return setMsg('Pick a zone or area.');
    if (pushN && !f.reason) return setMsg('Pick a reason for pushing the schedule.');
    if (canPush && f.push && !pushN) return setMsg('Enter at least 1 working day to push, or untick the push.');
    if (!sel && !f.notes.trim()) return setMsg('Describe unscheduled work in the notes.');
    const ok = await write(async () => {
      await api.saveRecord('actuals', { day, zone: f.zone, ...link(sel), status: sel ? f.status : 'Unscheduled work', trade: f.trade.trim(), crew: f.crew === '' ? null : +f.crew, durationDays: f.days === '' ? null : +f.days, pct: f.pct === '' ? null : +f.pct, notes: f.notes.trim(), by: user.id, at: new Date().toISOString() });
      if (pushN) await api.saveRecord('adjustments', { target: pushTarget(sel), name: sel.name, path: sel.path, days: pushN, reason: f.reason, note: f.notes.trim(), fromStart: sel.start, delayFrom: day, by: user.id, at: new Date().toISOString() });
    }, pushN ? `Actual logged · ${sel.name} pushed ${pushN} working day${pushN === 1 ? '' : 's'}` : 'Actual logged');
    if (ok) onClose();
  };
  return (
    <Drawer title={'Log actual work · ' + fmt(day, 'long')} onClose={onClose}>
      <div className="form">
        <Field label="Zone or area"><ZoneSelect value={f.zone} onChange={(v) => setF((x) => ({ ...x, zone: v, item: '' }))} /></Field>
        <Field label="What was worked"><select value={f.item} onChange={(e) => { const a = opts.find((x) => String(x.uid) === e.target.value); setF((x) => ({ ...x, item: e.target.value, trade: x.trade || (a && data.trades.includes(a.trade) ? a.trade : x.trade) })); }}>
          <option value="">Unscheduled / other (describe in notes)</option>
          {onDay.length > 0 && <optgroup label={`Scheduled ${fmt(day, 'wk')}`}>{onDay.map((a) => <option key={a.uid} value={a.uid}>{label(a)}</option>)}</optgroup>}
          {others.length > 0 && <optgroup label="Other tasks in this zone">{others.map((a) => <option key={a.uid} value={a.uid}>{label(a)} · {fmt(a.start)} – {fmt(a.finish, 'shortY')}</option>)}</optgroup>}
          </select></Field>
        <Field label="Status"><select value={sel ? f.status : 'Unscheduled work'} disabled={!sel} onChange={(e) => set('status')(e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Trade"><TradeSelect value={f.trade} onChange={set('trade')} /></Field>
        <Field label="Crew size"><input type="number" min="0" max="500" value={f.crew} onChange={(e) => set('crew')(e.target.value)} /></Field>
        <Field label="Duration (days the task took)"><input type="number" min="0" max="999" step="0.5" value={f.days} onChange={(e) => set('days')(e.target.value)} placeholder="optional" /></Field>
        <Field label="Field % complete"><input type="number" min="0" max="100" value={f.pct} onChange={(e) => set('pct')(e.target.value)} /></Field>
        <Field label="Notes (what was done, delays, reasons)" wide><textarea value={f.notes} maxLength={1000} onChange={(e) => set('notes')(e.target.value)} /></Field>
        {canPush && (
          <div className="wide push-box">
            <label className="inline" style={{ color: 'inherit' }}><input type="checkbox" checked={f.push} onChange={(e) => set('push')(e.target.checked)} /> <b>Not happening:</b> push {sel.name} in the schedule</label>
            {f.push && (
              <div className="form" style={{ marginTop: 8 }}>
                <Field label="Working days to push"><input type="number" min="1" max="200" value={f.pushDays} onChange={(e) => set('pushDays')(e.target.value)} /></Field>
                <Field label="Reason"><select value={f.reason} onChange={(e) => set('reason')(e.target.value)}><option value="">Pick a reason…</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
              </div>
            )}
            {f.push && <PushImpact a={sel} n={pushN} preview={preview} />}
          </div>
        )}
        <div className="form-a wide"><button type="button" className="btn primary" onClick={save}>Log actual</button><span className="msg bad">{msg}</span></div>
      </div>
    </Drawer>
  );
}

export function CommitmentForm({ onClose }) {
  const { derived, week, user, api, write, data } = useApp();
  const days = weekDays(week);
  const [f, setF] = useState({ zone: '', item: '', trade: '', who: '', due: '', what: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const opts = itemsForKey(derived.items.filter((a) => overlaps(a, days)), f.zone);
  const sel = opts.find((a) => String(a.uid) === f.item);
  const [msg, setMsg] = useState('');
  const save = async () => {
    if (!f.zone || !f.what.trim()) return setMsg('Pick a zone and describe the commitment.');
    const ok = await write(() => api.saveRecord('commitments', { week, zone: f.zone, ...link(sel), what: f.what.trim(), trade: f.trade.trim(), committedBy: f.who.trim(), due: f.due, status: 'Open', reason: '', by: user.id, at: new Date().toISOString() }), 'Commitment added');
    if (ok) onClose();
  };
  return (
    <Drawer title={'Add commitment · week of ' + fmt(week, 'shortY')} onClose={onClose}>
      <div className="form">
        <Field label="Zone or area"><ZoneSelect value={f.zone} onChange={(v) => setF((x) => ({ ...x, zone: v, item: '' }))} /></Field>
        <Field label="Schedule activity"><select value={f.item} onChange={(e) => { const a = opts.find((x) => String(x.uid) === e.target.value); setF((x) => ({ ...x, item: e.target.value, what: x.what || (a ? a.name : ''), trade: x.trade || (a && data.trades.includes(a.trade) ? a.trade : '') })); }}>
          <option value="">Not a schedule activity</option>{opts.map((a) => <option key={a.uid} value={a.uid}>{a.name} ({fmt(a.start)} – {fmt(a.finish)})</option>)}</select></Field>
        <Field label="Trade"><TradeSelect value={f.trade} onChange={set('trade')} /></Field>
        <Field label="Committed by (foreman)"><input value={f.who} maxLength={80} onChange={(e) => set('who')(e.target.value)} /></Field>
        <Field label="Due"><select value={f.due} onChange={(e) => set('due')(e.target.value)}><option value="">End of week</option>{days.filter((d) => !data.calendar.some((c) => d >= c.from && d <= c.to)).map((d) => <option key={d} value={d}>{fmt(d, 'wk')}</option>)}</select></Field>
        <Field label="Commitment (what will be complete)" wide><input value={f.what} maxLength={300} onChange={(e) => set('what')(e.target.value)} /></Field>
        <div className="form-a wide"><button type="button" className="btn primary" onClick={save}>Add commitment</button><span className="msg bad">{msg}</span></div>
      </div>
    </Drawer>
  );
}

export function ConstraintForm({ onClose }) {
  const { derived, week, user, api, write, data } = useApp();
  const window6 = Array.from({ length: 42 }, (_, i) => addDays(week, i));
  const [f, setF] = useState({ zone: '', item: '', type: CTYPES[0], trade: '', who: '', need: '', what: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const opts = itemsForKey(derived.items.filter((a) => overlaps(a, window6)), f.zone);
  const sel = opts.find((a) => String(a.uid) === f.item);
  const [msg, setMsg] = useState('');
  const save = async () => {
    if (!f.zone || !f.what.trim() || !f.need) return setMsg('Pick a zone, describe the constraint and set a need-by date.');
    const ok = await write(() => api.saveRecord('constraints', { zone: f.zone, ...link(sel), activityStart: sel ? sel.start : '', type: f.type, trade: f.trade.trim(), what: f.what.trim(), responsible: f.who.trim(), needBy: f.need, status: 'Open', clearedOn: '', by: user.id, at: new Date().toISOString() }), 'Constraint added');
    if (ok) onClose();
  };
  return (
    <Drawer title="Add constraint" onClose={onClose}>
      <div className="form">
        <Field label="Zone or area"><ZoneSelect value={f.zone} onChange={(v) => setF((x) => ({ ...x, zone: v, item: '' }))} /></Field>
        <Field label="Activity (next 6 weeks)"><select value={f.item} onChange={(e) => { const a = opts.find((x) => String(x.uid) === e.target.value); setF((x) => ({ ...x, item: e.target.value, need: x.need || (a ? addDays(a.start, -7) : '') })); }}>
          <option value="">Not tied to one activity</option>{opts.map((a) => <option key={a.uid} value={a.uid}>{a.name} (starts {fmt(a.start)})</option>)}</select></Field>
        <Field label="Type"><select value={f.type} onChange={(e) => set('type')(e.target.value)}>{CTYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Trade"><TradeSelect value={f.trade} onChange={set('trade')} /></Field>
        <Field label="Responsible (person or company)"><input value={f.who} maxLength={80} onChange={(e) => set('who')(e.target.value)} /></Field>
        <Field label="Need by"><input type="date" value={f.need} onChange={(e) => set('need')(e.target.value)} /></Field>
        <Field label="Constraint" wide><input value={f.what} maxLength={300} onChange={(e) => set('what')(e.target.value)} /></Field>
        <div className="form-a wide"><button type="button" className="btn primary" onClick={save}>Add constraint</button><span className="msg bad">{msg}</span></div>
      </div>
    </Drawer>
  );
}
export { label as zoneLabel };
