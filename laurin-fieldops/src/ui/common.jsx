import React from 'react';
import { useApp } from '../store.jsx';
import { addDays, fmt, localToday, mondayOf, stepWorking } from '../logic/dates.js';
import { isFor } from '../logic/schedule.js';
import plan1 from '../assets/plan-l1.jpg';
import plan2 from '../assets/plan-l2.jpg';

export const PLANS = { l1: plan1, l2: plan2 };

export function DateBar({ weekly }) {
  const { day, setDay, data, today } = useApp();
  const step = (dir) => setDay(weekly ? addDays(mondayOf(day), 7 * dir) : stepWorking(day, dir, data.calendar));
  return (
    <div className="datebar">
      <button type="button" className="btn" onClick={() => step(-1)} aria-label={weekly ? 'Previous week' : 'Previous working day'}>◀</button>
      <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Date" />
      <button type="button" className="btn" onClick={() => step(1)} aria-label={weekly ? 'Next week' : 'Next working day'}>▶</button>
      <button type="button" className="btn" onClick={() => setDay(localToday())} disabled={day === today}>Today</button>
      <strong className="datebar-l">{weekly ? 'Week of ' + fmt(mondayOf(day), 'shortY') : fmt(day, 'long')}</strong>
    </div>
  );
}

// Floor plans with a tag on each zone that has work. Filled = zone-specific or takt, outlined = Area-wide only, dark = only an actual logged.
export function PlanView({ state, onPick, selected }) {
  const { data } = useApp();
  return (
    <div className="plans">
      {[['l1', 'Main floor (L1)'], ['l2', 'Second floor (L2)']].map(([fl, name]) => (
        <figure key={fl} className="plan">
          <figcaption>{name}</figcaption>
          <div className="plan-box"><img src={PLANS[fl]} alt={name + ' takt zone plan'} /><div className="plan-veil" />
            {data.zones.filter((z) => z[fl] && state.has(z.code)).map((z) => {
              const s = state.get(z.code);
              const cls = s.spec ? '' : s.aw ? ' aw' : ' act';
              return (
                <button type="button" key={z.code} className={'pin' + cls + (selected === z.code ? ' sel' : '')} style={{ left: z[fl][0] + '%', top: z[fl][1] + '%' }} onClick={() => onPick(z.code)} title={z.code + ' · ' + z.rooms}>
                  {z.code.replace('Zone ', 'Z')}<span className="pin-n">{(s.spec || 0) + (s.aw || 0)}</span>{s.act ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
        </figure>
      ))}
    </div>
  );
}

export function zoneState(items, actuals) {
  const state = new Map();
  const get = (z) => { if (!state.has(z)) state.set(z, { spec: 0, aw: 0, act: false }); return state.get(z); };
  items.forEach((a) => { if (a.category === 'zone' || a.category === 'takt') a.zones.forEach((z) => { const s = get(z); s.spec++; if (a.category === 'takt') { s.wagon = a.name.replace('Takt · ', ''); s.color = a.color; } }); else if (a.category === 'areawide') a.zones.forEach((z) => { get(z).aw++; }); });
  actuals.forEach((e) => { get(e.zone).act = true; });
  return state;
}

// Week-by-day or 6-week grid. cols: [{key,label,off}], cell(row, col) -> items for that cell.
export function Matrix({ groups, cols, cell, entriesFor, note }) {
  const { can, setAdjust } = useApp();
  return (
    <div className="mx-wrap">
      <table className="mx">
        <thead><tr><th className="rh">Zone / Area / group</th>{cols.map((c) => <th key={c.key} className={c.off ? 'off' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {groups.map((g) => (
            <React.Fragment key={g.title}>
              <tr className="grp"><th colSpan={cols.length + 1}>{g.title}</th></tr>
              {g.rows.map((r) => (
                <tr key={r.key}>
                  <th className="rh">{r.t}{r.sub && <small>{r.sub}</small>}</th>
                  {cols.map((c) => (
                    <td key={c.key} className={c.off ? 'off' : ''}>
                      {!c.off && cell(r, c).map(({ a, start, tag }) => (
                        <span key={a.uid} className={'chip' + (start ? ' start' : '') + (a.critical ? ' crit' : '') + (can('plan') ? ' click' : '')} style={a.category === 'takt' ? { borderLeftColor: a.color } : undefined} title={a.name + ' · ' + fmt(a.start) + ' – ' + fmt(a.finish, 'shortY') + (can('plan') ? ' · click to mark not happening' : '')} onClick={can('plan') ? () => setAdjust(a) : undefined}>
                          {a.name}{a.category === 'takt' && a.slip > 0 && <small className="bad"> +{a.slip}d</small>}{a.shift > 0 && <small className="bad"> pushed +{a.shift}d</small>}{note && note(a, c)}
                          {tag}
                          {entriesFor && entriesFor(a, c).map((e) => <span key={e.id} className="st-mini" title={e.status}>{e.status}</span>)}
                        </span>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export { isFor };
