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
import { fmt } from './logic/dates.js';

const SCREENS = { day: Day, wwp: Wwp, lookahead: Lookahead, takt: Takt, model: Model, tracker: Tracker, schedule: Schedule, admin: Admin };

function SignIn() {
  const { data, signIn, auth } = useApp();
  return (
    <main className="signin">
      <div className="signin-card">
        <div className="brand"><Mark /><span className="wordmark">LAURIN</span></div>
        <h1>Field Ops</h1>
        <p>Takt, Last Planner and progress tracking for every Laurin site.</p>
        {auth.authMode === 'microsoft' ? (
          <button type="button" className="btn ms" onClick={() => signIn()}>Sign in with Microsoft</button>
        ) : (
          <>
            <button type="button" className="btn ms" disabled title="Live app only">Sign in with Microsoft</button>
            <p className="demo-note">Demo: Microsoft sign-in is replaced by a role picker. Choose who to sign in as.</p>
            <div className="who">{data.users.map((u) => (
              <button type="button" key={u.id} className="btn who-b" onClick={() => signIn(u.id)}><b>{u.name}</b><span>{u.role === 'Owner' ? 'Owner: plans, schedule, setup, everything' : u.role === 'Super' ? 'Super: logs actuals, commitments, constraints, tracker' : 'Viewer: read only'}</span></button>
            ))}</div>
          </>
        )}
      </div>
    </main>
  );
}

function Shell() {
  const { data, user, view, go, signOut, toast, api, adjust, derived } = useApp();
  const Screen = SCREENS[view];
  return (
    <div className="app">
      <header className="top">
        <div className="top-l"><Mark /><span className="wordmark">LAURIN</span><span className="app-name">Field Ops</span></div>
        <div className="top-p"><b>{data.project.code}</b> {data.project.name}<span className="sub">Schedule status {fmt(data.project.statusDate, 'shortY')}{derived.adjustments.length ? ` · ${derived.adjustments.length} change${derived.adjustments.length === 1 ? '' : 's'} pushed since` : ''}</span></div>
        <div className="top-r">{api.mode === 'demo' && <span className="badge">Demo</span>}<span className="user">{user.name} · {user.role}</span><button type="button" className="link" onClick={signOut}>Sign out</button></div>
      </header>
      <nav className="nav" aria-label="Screens">{VIEWS.map(([v, l]) => <button type="button" key={v} className={view === v ? 'on' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => go(v)}>{l}</button>)}</nav>
      <main className="main"><Screen /></main>
      {adjust && <AdjustForm key={adjust.uid} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Gate() {
  const { booted, data, error, user } = useApp();
  if (error && !data) return <main className="signin"><div className="signin-card"><h1>Can't load the project</h1><p>{error}</p></div></main>;
  if (!booted || !data) return <main className="signin"><div className="signin-card"><p>Loading WCHS…</p></div></main>;
  return user ? <Shell /> : <SignIn />;
}

export default function App() { return <AppProvider><Gate /></AppProvider>; }
