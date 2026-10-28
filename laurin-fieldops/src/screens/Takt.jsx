import React, { useState } from 'react';
import { useApp } from '../store.jsx';
import { Kpi, Empty, Field } from '../ui/parts.jsx';
import { addDays, fmt, localToday, mondayOf, parse } from '../logic/dates.js';
import { wagonColor } from '../logic/takt.js';

const SL = { complete: 'Complete (logged)', 'complete-s': 'Complete per master schedule', blocked: 'Blocked by an open constraint', overdue: 'Past its forecast window, not logged complete', active: 'In the zone now', planned: 'Planned' };

export default function Takt() {
  const { data, derived, day, go, can, setAdjust } = useApp();
  const TP = derived.TP; const [sel, setSel] = useState(null);
  if (!TP) return <section className="screen"><Empty>No takt plan set up yet.</Empty></section>;
  const T = data.takt; const today = localToday();
  const weeks = []; for (let w = mondayOf(T.start); w <= mondayOf(TP.forecastEnd); w = addDays(w, 7)) weeks.push(w);
  const offWk = (w) => [0, 1, 2, 3, 4].every((i) => data.calendar.some((c) => addDays(w, i) >= c.from && addDays(w, i) <= c.to));
  const months = weeks.reduce((m, w) => { const k = w.slice(0, 7); m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());
  const c = sel ? TP.cells.find((x) => x.key === sel) : null;
  const zr = derived.zmap;
  return (
    <section className="screen">
      <div className="kpis">
        <Kpi v={fmt(TP.plannedEnd, 'shortY')} l="Planned train finish" />
        <Kpi v={fmt(TP.forecastEnd, 'shortY')} l="Forecast train finish" tone={TP.slipEnd > 0 ? 'bad' : ''} />
        <Kpi v={(TP.slipEnd > 0 ? '+' : '') + TP.slipEnd} l="Slip vs plan (working days)" />
        <Kpi v={TP.cells.filter((x) => x.slip > 0).length} l="Wagon-zones behind plan" />
        <Kpi v={TP.cells.filter((x) => x.blocked).length} l="Blocked by a constraint" />
        <Kpi v={`${TP.cells.filter((x) => x.status.startsWith('complete')).length} of ${TP.cells.length}`} l="Complete" tone="mute" />
      </div>
      <div className="card">
        <h2>Master takt plan · main train</h2>
        <p className="note">{T.wagons.length} wagons through {T.train.length} zones at {TP.T} working days per zone, starting {fmt(T.start, 'shortY')}. Lost days logged on the Day and Weekly plan screens push that wagon's later zones and every wagon behind it.</p>
        <div className="legend">{T.wagons.map((w, i) => <span key={w.id}><i className="sw" style={{ background: wagonColor(i, T.wagons.length) }}>W{i + 1}</i>{w.name}{w.trade ? ` (${w.trade})` : ''}</span>)}</div>
        <div className="legend muted"><span><i className="sw ghost">W</i>Planned</span><span><i className="sw now">W</i>In zone now</span><span><i className="sw">W ✓</i>Complete</span><span><i className="sw behind">W</i>Behind plan</span><span><i className="sw over">W</i>Past forecast, not complete</span><span>⚠ open constraint</span></div>
        <div className="mx-wrap"><table className="tk">
          <thead>
            <tr><th className="rh" rowSpan={2}>Zone (train order)</th>{[...months].map(([m, n]) => <th key={m} colSpan={n} className="mo">{fmt(m + '-01', 'my')}</th>)}</tr>
            <tr>{weeks.map((w) => <th key={w} title={'Week of ' + fmt(w, 'shortY')}>{parse(w).getUTCDate()}</th>)}</tr>
          </thead>
          <tbody>{T.train.map((z, p) => (
            <tr key={z}><th className="rh">#{p + 1} {z}<small>{zr.get(z)?.rooms}</small></th>
              {weeks.map((w) => {
                const fri = addDays(w, 4);
                return (
                  <td key={w} className={(offWk(w) ? 'off ' : '') + (w === mondayOf(today) ? 'now ' : '') + (w === mondayOf(day) ? 'selwk' : '')}>
                    {TP.cells.filter((x) => x.zone === z && x.fs <= fri && x.ff >= w).map((x) => (
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
              <dt>Master schedule</dt><dd>{c.spct == null ? 'No matching Area activity' : `${c.area}: ${Math.round(c.spct)}% at status date`}</dd>
              <dt>Field log</dt><dd>{c.logs.length ? c.logs.map((e) => `${fmt(e.day)} ${e.status}${e.notes ? ' — ' + e.notes : ''}`).join(' · ') : 'Nothing logged'}</dd>
              <dt>Open constraints</dt><dd>{c.cons.length ? c.cons.map((k) => `${k.type}: ${k.what}`).join(' · ') : 'None'}</dd>
            </dl>
            <div className="row">{can('plan') && <button type="button" className="btn warnb" onClick={() => setAdjust(derived.items.find((x) => x.uid === 'tk:' + c.key))}>Not happening</button>}<button type="button" className="btn" onClick={() => go('day', { day: c.fs > today || c.ff < today ? c.fs : today, zone: c.zone })}>Open zone on Day</button><button type="button" className="btn" onClick={() => go('wwp', { day: c.fs })}>Open its week</button></div>
          </div>)}
      </div>
      {can('plan') ? <TaktSetup /> : <p className="note">Only owners can change the takt plan.</p>}
    </section>
  );
}

function TaktSetup() {
  const { data, api, write } = useApp();
  const T = data.takt;
  const [f, setF] = useState({ start: T.start, days: T.taktDays, wagons: T.wagons.map((w) => [w.name, w.trade || '', (w.match || []).join('; '), (w.skip || []).join(', ')].join(' | ')).join('\n'), train: T.train.join(', ') });
  const [msg, setMsg] = useState('');
  const save = async () => {
    const codes = new Set(data.zones.map((z) => z.code));
    const train = f.train.split(',').map((x) => x.trim()).filter(Boolean);
    if (parse(f.start).getUTCDay() !== 1) return setMsg('Train start must be a Monday.');
    const bad = train.filter((z) => !codes.has(z)); if (bad.length) return setMsg('Unknown zone code(s): ' + bad.join(', '));
    let next = T.wagons.reduce((m, w) => Math.max(m, parseInt(w.id.slice(1), 10) || 0), 0);
    const wagons = f.wagons.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [name = '', trade = '', match = '', skip = ''] = l.split('|').map((x) => x.trim()); const ex = T.wagons.find((w) => w.name.toLowerCase() === name.toLowerCase()); return { id: ex ? ex.id : 'w' + String(++next).padStart(2, '0'), name, trade, match: match.split(';').map((x) => x.trim()).filter(Boolean), skip: skip.split(',').map((x) => x.trim()).filter(Boolean) }; });
    setMsg('');
    await write(() => api.saveTakt({ ...T, start: f.start, taktDays: +f.days, wagons, train }), 'Takt plan saved');
  };
  return (
    <div className="card"><h2>Takt plan setup</h2>
      <p className="note">Wagons one per line: Name | Trade | schedule activity names (;) | zones where it doesn't apply (,). Log entries stay linked to a wagon while its name is unchanged.</p>
      <div className="form">
        <Field label="Train start (Monday)"><input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="Takt time (working days per zone)"><input type="number" min="1" max="20" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Field>
        <Field label="Wagons, in order" wide><textarea rows={10} value={f.wagons} onChange={(e) => setF({ ...f, wagons: e.target.value })} /></Field>
        <Field label="Train order (zone codes)" wide><textarea rows={2} value={f.train} onChange={(e) => setF({ ...f, train: e.target.value })} /></Field>
        <div className="form-a wide"><button type="button" className="btn primary" onClick={save}>Save takt plan</button><span className="msg bad">{msg}</span></div>
      </div>
    </div>
  );
}
