import React, { useEffect, useRef } from 'react';
import { fmt } from '../logic/dates.js';
import { STATUSES } from '../logic/schedule.js';
import { NotHappening } from './adjust.jsx';

export const Mark = () => (
  <svg className="mark" viewBox="0 0 44 32" aria-hidden="true"><polygon className="mk-k" points="12,0 26,0 14,32 0,32" /><polygon className="mk-g" points="26,0 44,0 32,32 14,32" /></svg>
);
export const Kpi = ({ v, l, tone }) => (<div className={'kpi ' + (tone || '')}><div className="kv">{v}</div><div className="kl">{l}</div></div>);
export const Empty = ({ children }) => <p className="empty">{children}</p>;
export const stClass = (s) => 'st st' + Math.max(0, STATUSES.indexOf(s));
export const Status = ({ s }) => <span className={stClass(s)}>{s}</span>;

export function Drawer({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.querySelector('select, input, textarea, button')?.focus(); const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-label={title} ref={ref}>
        <div className="drawer-h"><h2>{title}</h2><button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

export const Field = ({ label, children, wide }) => (<label className={'field' + (wide ? ' wide' : '')}><span>{label}</span>{children}</label>);

// One schedule item: master schedule activity or takt wagon-zone.
export function Item({ a, entries = [], extra }) {
  return (
    <li className={'item' + (a.category === 'takt' ? ' takt' : '')} style={a.category === 'takt' ? { borderLeftColor: a.color } : undefined}>
      <div className="item-n">{a.name}</div>
      <div className="item-m">
        <span>{a.milestone ? 'Milestone ' + fmt(a.finish, 'shortY') : fmt(a.start) + ' – ' + fmt(a.finish, 'shortY')}</span>
        {a.category === 'takt'
          ? <span className={'tag ' + (a.slip > 0 ? 'bad' : '')}>{a.slip > 0 ? `+${a.slip} days vs takt plan` : 'On takt plan'}</span>
          : <span className="pct"><span className="pbar"><i style={{ width: Math.min(100, +a.pct || 0) + '%' }} /></span>{Math.round(+a.pct || 0)}% at status date</span>}
        {a.trade && <span>{a.trade}</span>}
        {a.critical && <span className="tag bad">Critical</span>}
        {a.blocked && <span className="tag bad">Blocked</span>}
        {a.shift > 0 && <span className="tag bad" title={`Baseline ${fmt(a.baseStart)} – ${fmt(a.baseFinish, 'shortY')}`}>Pushed +{a.shift}d</span>}
        <NotHappening a={a} />
      </div>
      {entries.length > 0 && <div className="item-a">{entries.map((e) => <span key={e.id}><Status s={e.status} /> {[e.trade, e.crew != null && e.crew !== '' ? e.crew + ' crew' : '', e.notes].filter(Boolean).join(' · ')}</span>)}</div>}
      {extra}
    </li>
  );
}
