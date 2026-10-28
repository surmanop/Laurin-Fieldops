import React, { useState } from 'react';
import { useApp } from '../store.jsx';
import { Field } from '../ui/parts.jsx';

export default function Admin() {
  const { data, can, api, write, user } = useApp();
  const owner = can('admin');
  const [trades, setTrades] = useState(data.trades.join('\n'));
  const areas = [...new Set(data.areaZones.map((a) => a.area))];
  const [az, setAz] = useState(Object.fromEntries(areas.map((a) => [a, data.areaZones.filter((x) => x.area === a).map((x) => x.zone).join(', ')])));
  const saveAreas = () => write(() => api.saveAreaZones(areas.flatMap((a) => az[a].split(',').map((z) => z.trim()).filter(Boolean).map((zone) => ({ area: a, group: data.areaZones.find((x) => x.area === a)?.group || '', zone })))), 'Area mapping saved');
  return (
    <section className="screen">
      <div className="card">
        <h2>People and roles</h2>
        <p className="note">Owner: everything, including plan, schedule and setup. Super: logs actuals, commitments, constraints and tracker. Viewer: read only. In the live app people sign in with their Laurin Microsoft account and an owner adds them here.</p>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Person</th><th>Role</th></tr></thead>
          <tbody>{data.users.map((u) => <tr key={u.id}><td>{u.name}{u.id === user.id ? ' (you)' : ''}</td>
            <td>{owner && u.id !== user.id ? <select value={u.role} onChange={(e) => write(() => api.saveUserRole(u.id, e.target.value), 'Role changed')}>{['Owner', 'Super', 'Viewer'].map((r) => <option key={r}>{r}</option>)}</select> : u.role}</td></tr>)}</tbody></table></div>
      </div>
      <div className="card">
        <h2>Trade list</h2>
        <p className="note">Offered in every Trade dropdown. One per line.</p>
        <div className="form"><Field label="Trades" wide><textarea rows={10} value={trades} disabled={!owner} onChange={(e) => setTrades(e.target.value)} /></Field>
          {owner && <div className="form-a wide"><button type="button" className="btn primary" onClick={() => write(() => api.saveTrades([...new Set(trades.split('\n').map((t) => t.trim()).filter(Boolean))]), 'Trade list saved')}>Save trade list</button></div>}</div>
      </div>
      <div className="card">
        <h2>Main-floor Areas</h2>
        <p className="note">Which takt zones each schedule Area covers (from key plan A2.00R1). Area-wide activities show in every zone listed.</p>
        <div className="form">{areas.map((a) => <Field key={a} label={a} wide><input value={az[a]} disabled={!owner} onChange={(e) => setAz({ ...az, [a]: e.target.value })} /></Field>)}
          {owner && <div className="form-a wide"><button type="button" className="btn primary" onClick={saveAreas}>Save Area mapping</button></div>}</div>
      </div>
      {__DEMO__ && owner && (
        <div className="card">
          <h2>Demo data</h2>
          <p className="note">Everything you change in this demo is kept in this browser only. Reset to go back to the WCHS data as loaded.</p>
          <button type="button" className="btn" onClick={() => write(() => api.resetDemo(), 'Demo reset to WCHS data')}>Reset demo data</button>
        </div>
      )}
    </section>
  );
}
