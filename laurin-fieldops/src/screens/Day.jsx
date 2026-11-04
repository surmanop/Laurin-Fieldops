import React, { useMemo, useState } from 'react';
import { useApp } from '../store.jsx';
import { DateBar, PlanView, zoneState } from '../ui/common.jsx';
import { Empty, Item, Kpi, Status } from '../ui/parts.jsx';
import { ActualForm, zoneLabel } from '../ui/forms.jsx';
import { Manpower } from '../ui/manpower.jsx';
import { activeOn, inGap, isFor, isZoneCat, onZone } from '../logic/schedule.js';
import { addDays, fmt, offReason, stepWorking } from '../logic/dates.js';
import { makeWorkdays } from '../logic/forecast.js';

const TRAINS = ['Main train', 'Corridors', 'Gym + change rooms', 'Theatre', 'Mech 201 + service rooms', 'Train 2 · stairs', 'Train 3 · washrooms', 'Elevator'];

export default function Day() {
  const { data, derived, day, setDay, zone, setZone, can, user, api, write, working } = useApp();
  const [logFor, setLogFor] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const today = useMemo(() => activeOn(derived.items, day, data.calendar), [derived, day, data]);
  // Actuals for this day, plus multi-day ones logged earlier that still cover it (duration in working days, rounded up).
  const acts = useMemo(() => {
    const own = data.actuals.filter((e) => e.day === day);
    if (!working) return own;
    const W = makeWorkdays(data.calendar, addDays(day, -1500), addDays(day, 5));
    const carried = data.actuals.filter((e) => e.day < day && +e.durationDays > 1).map((e) => {
      const total = Math.ceil(+e.durationDays); const n = W.idx(day) - W.idx(e.day) + 1;
      return n >= 2 && n <= total ? { ...e, carried: true, dayNo: n, total } : null;
    }).filter(Boolean);
    return [...own, ...carried];
  }, [data, day, working]);
  const span = (e) => (e.carried ? `Day ${e.dayNo} of ${e.total} \u00b7 logged ${fmt(e.day, 'wk')}` : '');
  const state = zoneState(today, acts);
  // Items paused today by a delay: shown as "Pushed" on their zone instead of disappearing without a trace.
  const paused = useMemo(() => derived.items.filter((a) => a.start <= day && a.finish >= day && inGap(a, day)), [derived, day]);
  const n = (f) => today.filter(f).length;
  const zones = [...data.zones].sort((a, b) => a.order - b.order).filter((z) => showAll || state.has(z.code) || zone === z.code);
  const pick = (code) => { setZone(code); setTimeout(() => document.getElementById('z-' + code.replace(/\W/g, ''))?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30); };

  return (
    <section className="screen">
      <DateBar />
      {!working && <div className="banner">Non-working day in the schedule calendar ({offReason(day, data.calendar)}). <button type="button" className="btn" onClick={() => setDay(stepWorking(day, 1, data.calendar))}>Next working day ▶</button></div>}
      <div className="kpis">
        <Kpi v={today.length} l="Scheduled this day (incl. takt)" />
        <Kpi v={state.size} l="Zones with work" />
        <Kpi v={n(isZoneCat)} l="Zone-specific + takt" />
        <Kpi v={n((a) => a.category === 'areawide')} l="Area-wide" />
        <Kpi v={n((a) => a.category === 'unplaced')} l="Not placed in a zone" tone="mute" />
        <Kpi v={acts.filter((e) => !e.carried).length} l={`Actuals logged${acts.some((e) => e.carried) ? ` (+${acts.filter((e) => e.carried).length} continuing)` : ''}`} tone="mute" />
      </div>
      <Manpower />
      <div className="card">
        <div className="card-h"><h2>Where work is happening</h2>{can('log') && <button type="button" className="btn primary" onClick={() => setLogFor(zone || '')}>Log actual work</button>}</div>
        <p className="note">Filled tag: zone-specific or takt work. Outlined: Area-wide work only. Dark: actual logged with nothing scheduled. ✓ = actual logged. Tap a tag to open that zone.</p>
        <PlanView state={state} onPick={pick} selected={zone} />
      </div>
      <div className="card">
        <div className="card-h"><h2>Zone board</h2>
          <div className="seg"><button type="button" className={!showAll ? 'on' : ''} onClick={() => setShowAll(false)}>Zones with work</button><button type="button" className={showAll ? 'on' : ''} onClick={() => setShowAll(true)}>All zones</button></div></div>
        {[...TRAINS, ...new Set(data.zones.map((z) => z.train).filter((t) => t && !TRAINS.includes(t)))].map((t) => {
          const zs = zones.filter((z) => z.train === t); if (!zs.length) return null;
          return (
            <div key={t} className="train"><h3>{t}</h3>
              <div className="zones">
                {zs.map((z) => {
                  const own = today.filter((a) => isZoneCat(a) && a.zones.includes(z.code));
                  const aw = today.filter((a) => a.category === 'areawide' && a.zones.includes(z.code));
                  const ze = acts.filter((e) => e.zone === z.code);
                  const pz = paused.filter((a) => onZone(a, z.code));
                  const unsched = ze.filter((e) => !today.some((a) => onZone(a, z.code) && isFor(e, a)) && !pz.some((a) => isFor(e, a)));
                  return (
                    <article key={z.code} id={'z-' + z.code.replace(/\W/g, '')} className={'zone' + (own.length || aw.length || ze.length ? ' busy' : '') + (zone === z.code ? ' sel' : '')} onClick={() => setZone(z.code)}>
                      <header><b>{z.code}</b><span>{z.rooms}</span>{z.trainPos != null && <em>#{z.trainPos}</em>}</header>
                      {own.length > 0 && <ul className="items">{own.map((a) => <Item key={a.uid} a={a} entries={ze.filter((e) => isFor(e, a))} />)}</ul>}
                      {aw.length > 0 && <p className="aw"><b>{aw[0].area}-wide:</b> {aw.map((a) => a.name).join(' · ')}</p>}
                      {ze.some((e) => aw.some((a) => isFor(e, a))) && <div className="unsched"><b>Logged on Area-wide work:</b>{ze.filter((e) => aw.some((a) => isFor(e, a))).map((e) => <div key={'aw' + e.id}><Status s={e.status} /> {[e.activityName, e.trade, e.crew != null && e.crew !== '' ? e.crew + ' crew' : '', e.notes, span(e)].filter(Boolean).join(' · ')}</div>)}</div>}
                      {aw.filter((a) => (a.delays || []).length).map((a) => <div key={'d' + a.uid} className="delay-note">{a.delays.map((d) => <div key={d.id || d.at}><b>Delay</b> {a.name}: +{d.days} working day{d.days === 1 ? '' : 's'}{d.delayFrom ? ` from ${fmt(d.delayFrom, 'wk')}` : ''} · {d.reason}{d.note ? ` \u2014 ${d.note}` : ''}</div>)}</div>)}
                      {pz.length > 0 && <div className="delay-note">{pz.map((a) => { const g = a.gaps.find((x) => day >= x.from && day <= x.to); return <div key={'p' + a.uid}><b>Pushed</b> {a.name}: back on {fmt(stepWorking(g.to, 1, data.calendar), 'wk')}{ze.filter((e) => isFor(e, a)).map((e) => ` \u00b7 ${e.status}${e.notes ? ' \u2014 ' + e.notes : ''}`).join('')}</div>; })}</div>}
                      {unsched.length > 0 && <div className="unsched"><b>Logged, not on the schedule:</b>{unsched.map((e) => <div key={e.id}><Status s={e.status} /> {[e.trade, e.notes, span(e)].filter(Boolean).join(' · ')}</div>)}</div>}
                      {!own.length && !aw.length && !ze.length && !pz.length && <Empty>No scheduled work this day.</Empty>}
                      {can('log') && <button type="button" className="btn small" onClick={(ev) => { ev.stopPropagation(); setLogFor(z.code); }}>Log actual</button>}
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!zones.length && <Empty>{working ? 'No zone has scheduled work this day.' : 'No work scheduled this day.'}</Empty>}
      </div>
      <div className="cols">
        <Bucketed title="Not placed in a zone yet" note="Tracked by Area or washroom group in the schedule; zones not confirmed." items={today.filter((a) => a.category === 'unplaced')} by={(a) => a.bucket} />
        <Bucketed title="Site, envelope & building-wide" note="Roofing, cladding, site work, commissioning, closeout." items={today.filter((a) => a.category === 'site')} by={(a) => a.path} />
      </div>
      <div className="card">
        <h2>Actual work log · {fmt(day, 'long')}</h2>
        {acts.length ? (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Zone</th><th>Work</th><th>Status</th><th>Trade</th><th>Crew</th><th>Days</th><th>%</th><th>Notes</th><th>By</th><th /></tr></thead>
            <tbody>{acts.map((e) => (
              <tr key={e.id} className={e.carried ? 'carried' : ''}><td>{zoneLabel(e.zone)}</td><td>{e.activityName || 'Unscheduled'}{e.carried && <small className="sub">{span(e)}</small>}</td><td><Status s={e.status} /></td><td>{e.trade}</td><td>{e.crew ?? ''}</td><td>{e.durationDays ?? ''}</td><td>{e.pct != null ? e.pct + '%' : ''}</td><td>{e.notes}</td><td>{data.users.find((u) => u.id === e.by)?.name || ''}</td>
                <td>{can('log') && (e.by === user.id || user.role === 'Owner') && <button type="button" className="link" onClick={() => write(() => api.deleteRecord('actuals', e.id), 'Entry deleted')}>Delete</button>}</td></tr>))}</tbody></table></div>
        ) : <Empty>Nothing logged for this day yet.</Empty>}
      </div>
      {logFor !== null && <ActualForm zoneKey={logFor} onClose={() => setLogFor(null)} />}
    </section>
  );
}

function Bucketed({ title, note, items, by }) {
  const groups = [...items.reduce((m, a) => m.set(by(a), [...(m.get(by(a)) || []), a]), new Map())];
  return (
    <div className="card"><h2>{title}</h2><p className="note">{note}</p>
      {groups.length ? groups.map(([k, list]) => (<details key={k} className="bucket"><summary>{k} <span>· {list.length}</span></summary><ul className="items">{list.map((a) => <Item key={a.uid} a={a} />)}</ul></details>)) : <Empty>Nothing this day.</Empty>}
    </div>
  );
}
