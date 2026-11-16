import React, { useState } from 'react';
import { useApp } from '../store.jsx';
import { Kpi, Empty, Field } from '../ui/parts.jsx';
import { addDays, fmt, localToday, mondayOf, parse } from '../logic/dates.js';
import { trainsOf } from '../logic/takt.js';

const SL = { complete: 'Complete (logged)', 'complete-s': 'Complete per schedule', blocked: 'Blocked by an open constraint', overdue: 'Past its forecast window, not logged complete', active: 'In the zone now', planned: 'Planned' };

export default function Takt() {
  const { data, derived, can } = useApp();
  const TP = derived.TP;
  if (!TP) return <section className="screen"><Empty>No takt plan set up yet.</Empty>{can('plan') && <TaktSetup />}</section>;
  const many = TP.trains.length > 1;
  return (
    <section className="screen">
      <div className="kpis">
        <Kpi v={fmt(TP.plannedEnd, 'shortY')} l={many ? 'Planned finish, all trains' : 'Planned train finish'} />
        <Kpi v={fmt(TP.forecastEnd, 'shortY')} l={many ? 'Forecast finish, all trains' : 'Forecast train finish'} tone={TP.slipEnd > 0 ? 'bad' : ''} />
        <Kpi v={(TP.slipEnd > 0 ? '+' : '') + TP.slipEnd} l="Slip vs plan (working days)" />
        <Kpi v={TP.cells.filter((x) => x.slip > 0).length} l="Wagon-zones behind plan" />
        <Kpi v={TP.cells.filter((x) => x.blocked).length} l="Blocked by a constraint" />
        <Kpi v={`${TP.cells.filter((x) => x.status.startsWith('complete')).length} of ${TP.cells.length}`} l="Complete" tone="mute" />
      </div>
      {TP.trains.map((tr) => <TrainGrid key={tr.id} tr={tr} T={TP.T} many={many} />)}
      {can('plan') ? <TaktSetup /> : <p className="note">Only owners can change the takt plan.</p>}
    </section>
  );
}

function TrainGrid({ tr, T, many }) {
  const { data, derived, day, go, can, setAdjust } = useApp();
  const [sel, setSel] = useState(null);
  const today = localToday();
  const weeks = []; for (let w = mondayOf(tr.start); w <= mondayOf(tr.forecastEnd); w = addDays(w, 7)) weeks.push(w);
  const offWk = (w) => [0, 1, 2, 3, 4].every((i) => data.calendar.some((c) => addDays(w, i) >= c.from && addDays(w, i) <= c.to));
  const months = weeks.reduce((m, w) => { const k = w.slice(0, 7); m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());
  const c = sel ? tr.cells.find((x) => x.key === sel) : null;
  const zr = derived.zmap;
  const color = (i) => tr.cells.find((x) => x.i === i)?.color;
  return (
    <div className="card">
      <h2>Master takt plan · {tr.name}</h2>
      <p className="note">{tr.wagons.length} wagons through {tr.train.length} zones at {T} working days per zone, starting {fmt(tr.start, 'shortY')}. Planned finish {fmt(tr.plannedEnd, 'shortY')}, forecast {fmt(tr.forecastEnd, 'shortY')}{tr.slipEnd > 0 ? ` (+${tr.slipEnd})` : ''}.{!many ? " Lost days logged on the Day and Weekly plan screens push that wagon's later zones and every wagon behind it." : ''}</p>
      <div className="legend">{tr.wagons.map((w, i) => <span key={w.id}><i className="sw" style={{ background: color(i) }}>W{i + 1}</i>{w.name}{w.trade ? ` (${w.trade})` : ''}</span>)}</div>
      <div className="legend muted"><span><i className="sw ghost">W</i>Planned</span><span><i className="sw now">W</i>In zone now</span><span><i className="sw">W ✓</i>Complete</span><span><i className="sw behind">W</i>Behind plan</span><span><i className="sw over">W</i>Past forecast, not complete</span><span>⚠ open constraint</span></div>
      <div className="mx-wrap"><table className="tk">
        <thead>
          <tr><th className="rh" rowSpan={2}>Zone (train order)</th>{[...months].map(([m, n]) => <th key={m} colSpan={n} className="mo">{fmt(m + '-01', 'my')}</th>)}</tr>
          <tr>{weeks.map((w) => <th key={w} title={'Week of ' + fmt(w, 'shortY')}>{parse(w).getUTCDate()}</th>)}</tr>
        </thead>
        <tbody>{tr.train.map((z, p) => (
          <tr key={z}><th className="rh">#{p + 1} {z}<small>{zr.get(z)?.rooms}</small></th>
            {weeks.map((w) => {
              const fri = addDays(w, 4);
              return (
                <td key={w} className={(offWk(w) ? 'off ' : '') + (w === mondayOf(today) ? 'now ' : '') + (w === mondayOf(day) ? 'selwk' : '')}>
                  {tr.cells.filter((x) => x.zone === z && x.fs <= fri && x.ff >= w).map((x) => (
                    <button type="button" key={x.key} onClick={() => setSel(sel === x.key ? null : x.key)} style={{ background: x.color }} title={`${x.wname} in ${x.zone}: planned ${fmt(x.ps)}–${fmt(x.pf)}${x.slip > 0 ? `, forecast ${fmt(x.fs)}–${fmt(x.ff)} (+${x.slip}d)` : ''}`}
                      className={'w' + (x.status === 'planned' ? ' pl' : '') + (x.status === 'active' ? ' act' : '') + (x.status === 'overdue' ? ' od' : '') + (x.slip > 0 ? ' bh' : '') + (sel === x.key ? ' sel' : '')}>
                      W{x.i + 1}{x.status.startsWith('complete') ? ' ✓' : ''}{x.blocked ? ' ⚠' : ''}
                    </button>))}
                </td>);
            })}
          </tr>))}</tbody>
      </table></div>
      {c && (
        <div className="detail">
          <h3>W{c.i + 1} {c.wname} in {c.zone}{zr.get(c.zone) ? ' · ' + zr.get(c.zone).rooms : ''}</h3>
          <dl>
            <dt>Status</dt><dd>{SL[c.status]}</dd>
            <dt>Planned</dt><dd>{fmt(c.ps, 'shortY')} – {fmt(c.pf, 'shortY')}</dd>
            <dt>Forecast</dt><dd>{fmt(c.fs, 'shortY')} – {fmt(c.ff, 'shortY')}{c.slip > 0 ? ` (+${c.slip} working days)` : ''}</dd>
            <dt>Lost days logged here</dt><dd>{c.lost || 'None'}</dd>
            <dt>Schedule</dt><dd>{c.spct == null ? 'No matching schedule activity' : `${c.area || c.zone}: ${Math.round(c.spct)}% at status date`}</dd>
            <dt>Field log</dt><dd>{c.logs.length ? c.logs.map((e) => `${fmt(e.day)} ${e.status}${e.notes ? ' — ' + e.notes : ''}`).join(' · ') : 'Nothing logged'}</dd>
            <dt>Open constraints</dt><dd>{c.cons.length ? c.cons.map((k) => `${k.type}: ${k.what}`).join(' · ') : 'None'}</dd>
          </dl>
          <div className="row">{can('plan') && <button type="button" className="btn warnb" onClick={() => setAdjust(derived.items.find((x) => x.uid === 'tk:' + c.key))}>Not happening</button>}<button type="button" className="btn" onClick={() => go('day', { day: c.fs > today || c.ff < today ? c.fs : today, zone: c.zone })}>Open zone on Day</button><button type="button" className="btn" onClick={() => go('wwp', { day: c.fs })}>Open its week</button></div>
        </div>)}
    </div>
  );
}

const wagonLine = (w) => [w.name, w.trade || '', (w.match || []).join('; '), (w.skip || []).join(', ')].join(' | ');

function TaktSetup() {
  const { data, api, write } = useApp();
  const T = data.takt || { wagons: [], taktDays: 5 };
  const toForm = (tr) => ({ id: tr.id, name: tr.name, start: tr.start || '', zones: (tr.train || []).join(', '), wagons: tr.wagons.map(wagonLine).join('\n') });
  const [days, setDays] = useState(T.taktDays || 5);
  const [trains, setTrains] = useState(() => { const t = trainsOf(T).map(toForm); return t.length ? t : [{ id: 'main', name: 'Main train', start: '', zones: '', wagons: '' }]; });
  const [msg, setMsg] = useState('');
  const upd = (k, patch) => setTrains((l) => l.map((t, i) => (i === k ? { ...t, ...patch } : t)));
  const addTrain = () => setTrains((l) => [...l, { id: 't' + Date.now().toString(36), name: 'New train', start: l[0]?.start || '', zones: '', wagons: '' }]);
  const save = async () => {
    const codes = new Set(data.zones.map((z) => z.code));
    const seen = new Set(); const used = new Set(T.wagons.map((w) => w.id)); const all = []; const out = [];
    for (const tr of trains) {
      const label = tr.name.trim() || 'Train';
      const train = tr.zones.split(',').map((x) => x.trim()).filter(Boolean);
      if (!tr.start || parse(tr.start).getUTCDay() !== 1) return setMsg(`${label}: start must be a Monday.`);
      const bad = train.filter((z) => !codes.has(z)); if (bad.length) return setMsg(`${label}: unknown zone code(s): ${bad.join(', ')}`);
      const dup = train.filter((z) => seen.has(z)); if (dup.length) return setMsg(`${dup.join(', ')} is in more than one train.`);
      train.forEach((z) => seen.add(z));
      const old = trainsOf(T).find((x) => x.id === tr.id)?.wagons || [];
      const prefix = (tr.id === 'main' ? 'w' : tr.id.toUpperCase().slice(0, 3) + '-');
      let n = 0;
      const rows = tr.wagons.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split('|').map((x) => x.trim()));
      // Keep a wagon's id while its name is unchanged; new wagons get the next id no other wagon (in any train) has had.
      const kept = rows.map(([name = '']) => old.find((w) => w.name.toLowerCase() === name.toLowerCase())?.id || null);
      const taken = (id) => all.some((w) => w.id === id) || kept.includes(id) || used.has(id);
      const wagons = rows.map(([name = '', trade = '', match = '', skip = ''], r) => {
        let id = kept[r] && kept.indexOf(kept[r]) === r ? kept[r] : null;
        if (!id) { do { id = prefix + String(++n).padStart(2, '0'); } while (taken(id)); }
        return { id, name, trade, match: match.split(';').map((x) => x.trim()).filter(Boolean), skip: skip.split(',').map((x) => x.trim()).filter(Boolean) };
      });
      if (!train.length || !wagons.length) return setMsg(`${label}: needs at least one zone and one wagon.`);
      all.push(...wagons);
      out.push({ id: tr.id, name: label, start: tr.start, train, wagonIds: wagons.map((w) => w.id) });
    }
    setMsg('');
    const single = out.length === 1 && out[0].id === 'main';
    await write(() => api.saveTakt({ ...T, start: out[0].start, train: out[0].train, taktDays: +days, wagons: all, trains: single ? null : out }), 'Takt plan saved');
  };
  return (
    <div className="card"><h2>Takt plan setup</h2>
      <p className="note">Each train runs its own wagons through its own zones. Wagons one per line: Name | Trade | schedule activity names (;) | zones where it doesn't apply (,). Log entries stay linked to a wagon while its name is unchanged.</p>
      <div className="form">
        <Field label="Takt time (working days per zone, all trains)"><input type="number" min="1" max="20" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
      </div>
      {trains.map((tr, k) => (
        <div key={tr.id} className="form" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 }}>
          <Field label="Train name"><input value={tr.name} maxLength={60} onChange={(e) => upd(k, { name: e.target.value })} /></Field>
          <Field label="Train start (Monday)"><input type="date" value={tr.start} onChange={(e) => upd(k, { start: e.target.value })} /></Field>
          <Field label="Wagons, in order" wide><textarea rows={8} value={tr.wagons} onChange={(e) => upd(k, { wagons: e.target.value })} /></Field>
          <Field label="Train order (zone codes)" wide><textarea rows={2} value={tr.zones} onChange={(e) => upd(k, { zones: e.target.value })} /></Field>
          {trains.length > 1 && <div className="form-a wide"><button type="button" className="link" onClick={() => setTrains((l) => l.filter((_, i) => i !== k))}>Remove this train</button></div>}
        </div>
      ))}
      <div className="form-a" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={addTrain}>Add a train</button><button type="button" className="btn primary" onClick={save}>Save takt plan</button><span className="msg bad">{msg}</span></div>
    </div>
  );
}
