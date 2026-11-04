import React from 'react';
import { AppProvider, useApp, VIEWS } from './store.jsx';
import { Mark } from './ui/parts.jsx';
import { AdjustForm } from './ui/adjust.jsx';
import Day from './screens/Day.jsx';
import Wwp from './screens/Wwp.jsx';
import Lookahead from './screens/Lookahead.jsx';
import Takt from './screens/Takt.jsx';
import Model from './screens/Model.jsx';
import Tracker from './screens/Tracker.jsx';
import Schedule from './screens/Schedule.jsx';
import Admin from './screens/Admin.jsx';
import Trades from './screens/Trades.jsx';
import { fmt } from './logic/dates.js';

const SCREENS = { day: Day, wwp: Wwp, trades: Trades, lookahead: Lookahead, takt: Takt, model: Model, tracker: Tracker, schedule: Schedule, admin: Admin };

// Email sign-in: Supabase sends a one-time link; opening it signs the person in and returns them here.
function EmailSignIn() {
  const { auth } = useApp();
  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState('idle'); // idle | sending | sent | error
  const [msg, setMsg] = React.useState('');
  const send = async (e) => {
    e.preventDefault();
    setState('sending'); setMsg('');
    try { await auth.sendEmailLink(email.trim()); setState('sent'); } catch (err) { setState('error'); setMsg(err.message); }
  };
  if (state === 'sent') {
    return <p className="email-sent">Check <b>{email.trim()}</b> for a sign-in link and open it. It can take a minute to arrive; check junk mail too. <button type="button" className="link" onClick={() => setState('idle')}>Use a different email</button></p>;
  }
  return (
    <form className="email-form" onSubmit={send}>
      <label htmlFor="signin-email">Work email</label>
      <input id="signin-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
      <button type="submit" className="btn ms" disabled={state === 'sending' || !email.trim()}>{state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}</button>
      {state === 'error' && <p className="bad" role="alert">Couldn't send the link: {msg}</p>}
    </form>
  );
}

// Everyday sign-in: email + password. The emailed link is for the first time, or a forgotten password.
function PasswordSignIn() {
  const { signInWithPassword } = useApp();
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const go = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try { await signInWithPassword(email.trim(), pw); } catch (err) { setMsg(err.message); setBusy(false); }
  };
  return (
    <form className="email-form" onSubmit={go}>
      <label htmlFor="pw-email">Work email</label>
      <input id="pw-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
      <label htmlFor="pw-pass">Password</label>
      <input id="pw-pass" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
      <button type="submit" className="btn primary" disabled={busy || !email.trim() || !pw}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {msg && <p className="bad" role="alert">{msg}</p>}
    </form>
  );
}

function SignIn() {
  const { data, signIn, auth, setSigningIn } = useApp();
  const [linkMode, setLinkMode] = React.useState(false);
  return (
    <main className="signin">
      <div className="signin-card">
        <div className="brand"><Mark /><span className="wordmark">LAURIN</span></div>
        <h1>Field Ops</h1>
        {auth.authMode === 'microsoft' ? (
          <>
            <p>Sign in to log work and make changes. Viewing doesn't need a sign-in.</p>
            {linkMode ? (
              <>
                <p className="demo-note">First time, or forgot your password? We'll email you a one-time sign-in link. After you open it you can set a password.</p>
                <EmailSignIn />
                <button type="button" className="link" onClick={() => setLinkMode(false)}>I have a password</button>
              </>
            ) : (
              <>
                <PasswordSignIn />
                <button type="button" className="link" onClick={() => setLinkMode(true)}>First time or forgot password? Email me a sign-in link</button>
              </>
            )}
            {auth.microsoftEnabled && <button type="button" className="btn ms" onClick={() => signIn()}>Sign in with Microsoft</button>}
            {auth.publicView && <button type="button" className="btn" onClick={() => setSigningIn(false)}>Back to viewing</button>}
          </>
        ) : (
          <>
            <p>Takt, Last Planner and progress tracking for every Laurin site.</p>
            <button type="button" className="btn ms" disabled title="Live app only">Sign in with Microsoft</button>
            <p className="demo-note">Demo: Microsoft sign-in is replaced by a role picker. Choose who to sign in as.</p>
            <div className="who">{(data?.users || []).map((u) => (
              <button type="button" key={u.id} className="btn who-b" onClick={() => signIn(u.id)}><b>{u.name}</b><span>{u.role === 'Owner' ? 'Owner: plans, schedule, setup, everything' : u.role === 'Super' ? 'Super: logs actuals, commitments, constraints, tracker' : 'Viewer: read only'}</span></button>
            ))}</div>
          </>
        )}
      </div>
    </main>
  );
}

// Shown to a signed-in person until they set a password (or close it), so next time they skip the emailed link.
function SetPassword({ onClose, required }) {
  const { setPassword, setToast } = useApp();
  const [pw, setPw] = React.useState('');
  const [pw2, setPw2] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    if (pw.length < 8) return setMsg('Use at least 8 characters.');
    if (pw !== pw2) return setMsg("The two passwords don't match.");
    setBusy(true);
    try { await setPassword(pw); setToast('Password saved. Next time sign in with your email and password.'); onClose(); } catch (err) { setMsg(err.message); setBusy(false); }
  };
  return (
    <div className="card pw-card">
      <h2>{required ? 'Set a password' : 'Change password'}</h2>
      {required && <p className="note">Set a password now and next time you can sign in with your email and password, with no emailed link.</p>}
      <form className="form" onSubmit={save}>
        <label className="field"><span>New password (8+ characters)</span><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <label className="field"><span>Type it again</span><input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
        <div className="form-a wide"><button type="submit" className="btn primary" disabled={busy || !pw}>Save password</button><button type="button" className="btn" onClick={onClose}>Not now</button><span className="msg bad">{msg}</span></div>
      </form>
    </div>
  );
}

function Shell() {
  const { data, user, view, go, signOut, toast, api, adjust, derived, auth, account, setSigningIn } = useApp();
  const visitor = user.role === 'Visitor';
  const views = visitor ? VIEWS.filter(([v]) => v !== 'admin') : VIEWS; // Setup (people and roles) is for the team only
  const Screen = SCREENS[visitor && view === 'admin' ? 'day' : view];
  const [pwOpen, setPwOpen] = React.useState(null); // null: decide from account; true/false: person chose
  const live = auth.authMode === 'microsoft';
  const askPw = live && !!user.id && (pwOpen ?? !account.hasPassword);
  return (
    <div className="app">
      <header className="top">
        <div className="top-l"><Mark /><span className="wordmark">LAURIN</span><span className="app-name">Field Ops</span></div>
        <div className="top-p"><b>{data.project.code}</b> {data.project.name}<span className="sub">Schedule status {fmt(data.project.statusDate, 'shortY')}{derived.adjustments.length ? ` · ${derived.adjustments.length} change${derived.adjustments.length === 1 ? '' : 's'} pushed since` : ''}</span></div>
        <div className="top-r">{api.mode === 'demo' && <span className="badge">Demo</span>}
          {visitor && !user.signedIn ? <><span className="user">Viewing</span><button type="button" className="btn small primary" onClick={() => setSigningIn(true)}>Sign in to edit</button></>
            : <><span className="user">{user.name} · {visitor ? 'View only' : user.role}</span>{live && user.id && <button type="button" className="link" onClick={() => setPwOpen(true)}>Password</button>}<button type="button" className="link" onClick={signOut}>Sign out</button></>}</div>
      </header>
      <nav className="nav" aria-label="Screens">{views.map(([v, l]) => <button type="button" key={v} className={view === v ? 'on' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => go(v)}>{l}</button>)}</nav>
      <main className="main">
        {visitor && user.signedIn && <div className="banner" style={{ margin: '12px 0' }}>You're signed in as {user.name}, but you haven't been added to this project yet, so you can view only. Ask the project owner to add your email on Setup › People and roles, then reload.</div>}
        {askPw && <SetPassword required={!account.hasPassword} onClose={() => setPwOpen(false)} />}
        <Screen />
      </main>
      {adjust && <AdjustForm key={adjust.uid} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Gate() {
  const { booted, data, error, user, userId, auth, signingIn } = useApp();
  if (!booted) return <main className="signin"><div className="signin-card"><p>Loading…</p></div></main>;
  if (auth.publicView) {
    // Anyone can view. Sign-in is only needed to edit.
    if (signingIn && !userId) return <SignIn />;
    if (error && !data) return <main className="signin"><div className="signin-card"><h1>Can't load the project</h1><p>{error}</p></div></main>;
    if (!data) return <main className="signin"><div className="signin-card"><p>Loading WCHS…</p></div></main>;
    return <Shell />;
  }
  if (auth.authMode === 'microsoft' && !userId) return <SignIn />;
  if (error && !data) return <main className="signin"><div className="signin-card"><h1>Can't load the project</h1><p>{error}</p></div></main>;
  if (!data) return <main className="signin"><div className="signin-card"><p>Loading WCHS…</p></div></main>;
  return user ? <Shell /> : <SignIn />;
}

export default function App() { return <AppProvider><Gate /></AppProvider>; }
