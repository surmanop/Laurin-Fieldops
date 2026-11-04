import React, { useState } from 'react';
import { useApp } from '../store.jsx';
import { Field } from '../ui/parts.jsx';

export default function Admin() {
  const { data, can, api, write, user } = useApp();
  const owner = can('admin');
  const [trades, setTrades] = useState(data.trades.join('\n'));
  const areas = [...new Set(data.areaZones.map((a) => a.area))];
  const [az, setAz] = useState(Object.fromEntries(areas.map((a) => [a, data.areaZones.filter((x) => x.area === a).map((x) => x.zone).join(', ')])));
  const [np, setNp] = useState({ email: '', name: '', role: 'Viewer' });
  const [added, setAdded] = useState('');
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(np.email.trim());
  const add = async () => {
    setAdded('');
    let res;
    const ok = await write(async () => { res = await api.addMember(np.email.trim(), np.name.trim(), np.role); }, 'Person added');
    if (ok) {
      setAdded(res === 'member' ? `${np.email.trim()} already had an account, so they have ${np.role} access now.` : `${np.email.trim()} will get ${np.role} access the first time they sign in with that email.`);
      setNp({ email: '', name: '', role: np.role });
    }
  };
  const invites = data.invites || [];
  const saveAreas = () => write(() => api.saveAreaZones(areas.flatMap((a) => az[a].split(',').map((z) => z.trim()).filter(Boolean).map((zone) => ({ area: a, group: data.areaZones.find((x) => x.area === a)?.group || '', zone })))), 'Area mapping saved');
  return (
    <section className="screen">
      <div className="card">
        <h2>People and roles</h2>
        <p className="note">Owner: everything, including plan, schedule and setup. Super: logs actuals, commitments, constraints and tracker. Viewer: read only. People sign in with an emailed link. Add their email below before they sign in and the role is applied automatically.</p>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Person</th><th>Role</th></tr></thead>
          <tbody>{data.users.map((u) => <tr key={u.id}><td>{u.name}{u.id === user.id ? ' (you)' : ''}</td>
            <td>{owner && u.id !== user.id ? <select value={u.role} onChange={(e) => write(() => api.saveUserRole(u.id, e.target.value), 'Role changed')}>{['Owner', 'Super', 'Viewer'].map((r) => <option key={r}>{r}</option>)}</select> : u.role}</td></tr>)}</tbody></table></div>
        {owner && api.addMember && (
          <>
            <h3 style={{ margin: '16px 0 6px' }}>Add a person</h3>
            <div className="form">
              <Field label="Email"><input type="email" value={np.email} maxLength={200} onChange={(e) => setNp({ ...np, email: e.target.value })} placeholder="name@company.com" /></Field>
              <Field label="Name (optional)"><input value={np.name} maxLength={100} onChange={(e) => setNp({ ...np, name: e.target.value })} /></Field>
              <Field label="Role"><select value={np.role} onChange={(e) => setNp({ ...np, role: e.target.value })}>
                <option value="Viewer">Viewer (view only)</option><option value="Super">Super (can log and modify)</option><option value="Owner">Owner (everything)</option></select></Field>
              <div className="form-a wide"><button type="button" className="btn primary" disabled={!emailOk} onClick={add}>Add person</button><span className="msg">{added}</span></div>
            </div>
            <h3 style={{ margin: '16px 0 6px' }}>Waiting for first sign-in</h3>
            {invites.length ? (
              <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Added</th><th /></tr></thead>
                <tbody>{invites.map((i) => <tr key={i.email}><td>{i.email}</td><td>{i.name}</td>
                  <td><select value={i.role} onChange={(e) => write(() => api.setInviteRole(i.email, e.target.value), 'Role changed')}>{['Owner', 'Super', 'Viewer'].map((r) => <option key={r}>{r}</option>)}</select></td>
                  <td>{i.at}</td><td><button type="button" className="link" onClick={() => write(() => api.removeInvite(i.email), 'Invite removed')}>Remove</button></td></tr>)}</tbody></table></div>
            ) : <p className="note">Nobody waiting. People you add who haven't signed in yet show here.</p>}
          </>
        )}
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
