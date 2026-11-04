import React, { useMemo, useState } from 'react';
import { useApp } from '../store.jsx';
import { Drawer } from './parts.jsx';
import { fmt } from '../logic/dates.js';

const zoneNum = (c) => (/^Zone \d+$/.test(c) ? +c.slice(5) : null);
export const zoneSort = (a, b) => {
  const x = zoneNum(a.code), y = zoneNum(b.code);
  if (x != null && y != null) return x - y;
  if (x != null) return -1;
  if (y != null) return 1;
  return a.code.localeCompare(b.code, undefined, { numeric: true });
};

// Place a task the schedule rules couldn't place into one or more zones. Owners and Supers.
export function PlaceForm() {
  const { place: a, setPlace, data, api, write } = useApp();
  const current = a.placed ? a.zones : [];
  const [picked, setPicked] = useState(new Set(current));
  const [msg, setMsg] = useState('');
  const close = () => setPlace(null);
  const bucket = a.placed ? a.placed.from : a.bucket;
  const lvl = /^L1\b/.test(bucket || '') ? 'L1' : /^L2\b/.test(bucket || '') ? 'L2' : '';
  // Zones on the task's floor first, then the rest.
  const groups = useMemo(() => {
    const zs = [...data.zones].sort(zoneSort);
    const levels = [...new Set(zs.map((z) => z.level || 'Other'))].sort((p, q) => (p === lvl ? -1 : q === lvl ? 1 : p.localeCompare(q)));
    return levels.map((l) => [l, zs.filter((z) => (z.level || 'Other') === l)]);
  }, [data, lvl]);
  const toggle = (c) => setPicked((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const ordered = [...data.zones].sort(zoneSort).map((z) => z.code).filter((c) => picked.has(c));
  const save = async () => {
    setMsg('');
    if (!ordered.length) return setMsg('Tick at least one zone.');
    const ok = await write(() => api.savePlacement(a.uid, ordered), `${a.name} placed in ${ordered.join(', ')}`);
    if (ok) close();
  };
  const undo = async () => { const ok = await write(() => api.removePlacement(a.uid), `${a.name} is back in "Not placed"`); if (ok) close(); };
  const who = a.placed && (data.users.find((u) => u.id === a.placed.by)?.name || '');
  return (
    <Drawer title={a.placed ? 'Change zones' : 'Place in zones'} onClose={close}>
      <div className="adj-item">
        <b>{a.name}</b>
        <span className="sub-i">{a.path}</span>
        <span className="sub-i">{fmt(a.start)} – {fmt(a.finish, 'shortY')}{a.trade ? ' · ' + a.trade : ''}</span>
        <span className="sub-i">Schedule group: {bucket}{a.placed ? ` · placed ${fmt(a.placed.at?.slice(0, 10), 'shortY')}${who ? ' by ' + who : ''}` : ''}</span>
      </div>
      <p className="note">Tick every zone this work happens in. It then shows on those zones' boards, the weekly plan and lookahead, and stays placed when an updated schedule is loaded.</p>
      {groups.map(([l, zs]) => (
        <div key={l}>
          <h3 style={{ margin: '12px 0 6px' }}>{l === 'L1' ? 'Main floor (L1)' : l === 'L2' ? 'Second floor (L2)' : l}{l === lvl ? ' · this task’s floor' : ''}</h3>
          <div className="place-grid">
            {zs.map((z) => (
              <label key={z.code} className={'place-z' + (picked.has(z.code) ? ' on' : '')} title={z.rooms}>
                <input type="checkbox" checked={picked.has(z.code)} onChange={() => toggle(z.code)} /> <b>{z.code}</b><span>{z.rooms}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="form-a" style={{ marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" className="btn primary" onClick={save}>{ordered.length ? `Place in ${ordered.length} zone${ordered.length === 1 ? '' : 's'}` : 'Place'}</button>
        {a.placed && <button type="button" className="btn" onClick={undo}>Undo placement</button>}
        <span className="msg bad">{msg}</span>
      </div>
      {ordered.length > 0 && <p className="note" style={{ marginTop: 8 }}>{ordered.join(', ')}</p>}
    </Drawer>
  );
}

export function PlaceButton({ a }) {
  const { can, setPlace } = useApp();
  if (!can('log') || (a.category !== 'unplaced' && !a.placed)) return null;
  return <button type="button" className="btn small" onClick={(e) => { e.stopPropagation(); setPlace(a); }}>{a.placed ? 'Change zones' : 'Place in zones'}</button>;
}
