import React, { useEffect, useState } from 'react';
import { useApp } from '../store.jsx';
import { Field } from '../ui/parts.jsx';

// Readable temporary password, e.g. "kp7m-x3tq-9fdw" (no look-alike characters).
const genPassword = () => {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const r = new Uint32Array(12); crypto.getRandomValues(r);
  return [0, 4, 8].map((i) => [...r.slice(i, i + 4)].map((n) => abc[n % abc.length]).join('')).join('-');
};

// Inline: set a temporary password for an invite (by email) or a member (by account id).
// The password is shown by the parent (onSet), because an invite row disappears once its account exists.
function TempPassword({ target, onDone, onSet }) {
  const { api, write } = useApp();
  const [pw, setPw] = useState(genPassword);
  const save = async () => {
    const ok = await write(() => api.setTempPassword({ ...target, password: pw }), 'Temporary password set');
    if (ok) { onSet({ label: target.label, pw }); onDone(); }
  };
  return (
    <div className="row" style={{ gap: 6, margin: '6px 0', flexWrap: 'wrap' }}>
      <input value={pw} onChange={(e) => setPw(e.target.value)} maxLength={72} aria-label="Temporary password" style={{ width: 170, fontFamily: 'var(--f-data)' }} />
      <button type="button" className="btn small" onClick={() => setPw(genPassword())}>New one</button>
      <button type="button" className="btn small primary" disabled={pw.length < 8} onClick={save}>Set temporary password</button>
      <button type="button" className="btn small" onClick={onDone}>Cancel</button>
    </div>
  );
}

export default function Admin() {
  const { data, can, api, write, user } = useApp();
  const owner = can('admin');
  const [trades, setTrades] = useState(data.trades.join('\n'));
  const areas = [...new Set(data.areaZones.map((a) => a.area))];
  const [az, setAz] = useState(Object.fromEntries(areas.map((a) => [a, data.areaZones.filter((x) => x.area === a).map((x) => x.zone).join(', ')])));
  const [np, setNp] = useState({ email: '', name: '', role: 'Viewer', pw: '' });
  const [tp, setTp] = useState(null); // invite email or member id with the temp-password form open
  const [given, setGiven] = useState(null); // { label, pw } just set, shown until dismissed
  // Temporary passwords only show once the server function is set up; until then people use the emailed link.
  const [canTemp, setCanTemp] = useState(false);
  useEffect(() => { let on = true; if (api.tempPasswordReady) api.tempPasswordReady().then((ok) => on && setCanTemp(ok)); return () => { on = false; }; }, [api]);
  const [added, setAdded] = useState('');
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(np.email.trim());
  const add = async () => {
    setAdded('');
    let res;
    const email = np.email.trim(), pw = np.pw;
    const ok = await write(async () => {
      if (pw) res = await api.setTempPassword({ email, name: np.name.trim(), role: np.role, password: pw });
      else res = await api.addMember(email, np.name.trim(), np.role);
    }, 'Person added');
    if (ok) {
      if (pw) setGiven({ label: email, pw });
      setAdded(pw ? `${email} can sign in now with ${np.role} access. The temporary password is shown above.`
        : res === 'member' ? `${email} already had an account, so they have ${np.role} access now.` : `${email} will get ${np.role} access the first time they sign in with that email.`);
      setNp({ email: '', name: '', role: np.role, pw: '' });
    }
  };
  const invites = data.invites || [];
  const saveAreas = () => write(() => api.saveAreaZones(areas.flatMap((a) => az[a].split(',').map((z) => z.trim()).filter(Boolean).map((zone) => ({ area: a, group: data.areaZones.find((x) => x.area === a)?.group || '', zone })))), 'Area mapping saved');
  return (
    <section className="screen">
      <div className="card">
        <h2>People and roles</h2>
        <p className="note">Owner: everything, including plan, schedule and setup. Super: logs actuals, commitments, constraints and tracker. Viewer: read only. Add people below. They open the site, choose Sign in to edit › First time or forgot password, and get an emailed link; after opening it they set their own password. The role you set here is applied automatically.</p>
        {given && <div className="banner" style={{ margin: '8px 0' }}>Give this temporary password to <b>{given.label}</b>: <code className="uid" style={{ display: 'inline-block' }}>{given.pw}</code> They sign in with their email and this password, then set their own. <button type="button" className="btn small" onClick={() => setGiven(null)}>Done</button></div>}
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Person</th><th>Role</th><th /></tr></thead>
          <tbody>{data.users.map((u) => <React.Fragment key={u.id}><tr><td>{u.name}{u.id === user.id ? ' (you)' : ''}</td>
            <td>{owner && u.id !== user.id ? <select value={u.role} onChange={(e) => write(() => api.saveUserRole(u.id, e.target.value), 'Role changed')}>{['Owner', 'Super', 'Viewer'].map((r) => <option key={r}>{r}</option>)}</select> : u.role}</td>
            <td>{owner && canTemp && u.id !== user.id && tp !== u.id && <button type="button" className="link" onClick={() => setTp(u.id)}>Reset password</button>}</td></tr>
            {tp === u.id && <tr><td colSpan={3}><TempPassword target={{ userId: u.id, label: u.name }} onDone={() => setTp(null)} onSet={setGiven} /></td></tr>}</React.Fragment>)}</tbody></table></div>
        {owner && api.addMember && (
          <>
            <h3 style={{ margin: '16px 0 6px' }}>Add a person</h3>
            <div className="form">
              <Field label="Email"><input type="email" value={np.email} maxLength={200} onChange={(e) => setNp({ ...np, email: e.target.value })} placeholder="name@company.com" /></Field>
              <Field label="Name (optional)"><input value={np.name} maxLength={100} onChange={(e) => setNp({ ...np, name: e.target.value })} /></Field>
              <Field label="Role"><select value={np.role} onChange={(e) => setNp({ ...np, role: e.target.value })}>
                <option value="Viewer">Viewer (view only)</option><option value="Super">Super (can log and modify)</option><option value="Owner">Owner (everything)</option></select></Field>
              {canTemp && <Field label="Temporary password (recommended)"><div className="row" style={{ gap: 6 }}><input value={np.pw} maxLength={72} onChange={(e) => setNp({ ...np, pw: e.target.value })} placeholder="Leave blank to rely on an email link" style={{ fontFamily: 'var(--f-data)' }} /><button type="button" className="btn small" onClick={() => setNp({ ...np, pw: genPassword() })}>Generate</button></div></Field>}
              <div className="form-a wide"><button type="button" className="btn primary" disabled={!emailOk || (np.pw && np.pw.length < 8)} onClick={add}>Add person</button><span className="msg">{added}</span></div>
            </div>
            <h3 style={{ margin: '16px 0 6px' }}>Waiting for first sign-in</h3>
            {invites.length ? (
              <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Added</th><th /></tr></thead>
                <tbody>{invites.map((i) => <React.Fragment key={i.email}>{tp === i.email && <tr><td colSpan={5}><TempPassword target={{ email: i.email, label: i.name || i.email }} onDone={() => setTp(null)} onSet={setGiven} /></td></tr>}<tr><td>{i.email}</td><td>{i.name}</td>
                  <td><select value={i.role} onChange={(e) => write(() => api.setInviteRole(i.email, e.target.value), 'Role changed')}>{['Owner', 'Super', 'Viewer'].map((r) => <option key={r}>{r}</option>)}</select></td>
                  <td>{i.at}</td><td>{canTemp && tp !== i.email && <button type="button" className="link" onClick={() => setTp(i.email)}>Set temporary password</button>} <button type="button" className="link" onClick={() => write(() => api.removeInvite(i.email), 'Invite removed')}>Remove</button></td></tr></React.Fragment>)}</tbody></table></div>
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
