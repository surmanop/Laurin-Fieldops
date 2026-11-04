import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '@adapter';
import * as auth from '@auth';
import { localToday, isWorking, mondayOf } from './logic/dates.js';
import { computeTakt, taktItems } from './logic/takt.js';
import { forecastSchedule } from './logic/forecast.js';
import { applyPlacements } from './logic/mapping.js';

export const VIEWS = [
  ['day', 'Day'], ['wwp', 'Weekly plan'], ['trades', 'By trade'], ['lookahead', '6-week lookahead'], ['takt', 'Takt plan'], ['model', '3D zones'], ['tracker', 'Tracker'], ['schedule', 'Schedule import'], ['admin', 'Setup'],
];
const validView = (h) => (VIEWS.some(([v]) => v === h) ? h : 'day');

// What each role may do. The live database enforces the same rules (server/supabase/migrations/002_security.sql).
const RIGHTS = {
  Owner: ['log', 'tracker', 'plan', 'admin', 'import'],
  Super: ['log', 'tracker'],
  Viewer: [],
  Visitor: [], // not signed in, or signed in but not added to the project: view only
};

const Ctx = React.createContext(null);
export const useApp = () => React.useContext(Ctx);

export function AppProvider({ children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState(null);
  const [booted, setBooted] = useState(false);
  const [view, setView] = useState(() => validView(window.location.hash.slice(1)));
  const [day, setDay] = useState(localToday());
  const [zone, setZone] = useState(null);
  const [toast, setToast] = useState('');
  const [adjust, setAdjust] = useState(null); // schedule item being marked "not happening"
  const [place, setPlace] = useState(null); // unplaced schedule item being put into zones
  const [signingIn, setSigningIn] = useState(false); // visitor opened the sign-in screen
  const [account, setAccount] = useState({ email: '', hasPassword: true, temp: false });
  const refreshAccount = useCallback(async () => { if (auth.getEmail) setAccount({ email: await auth.getEmail(), hasPassword: await auth.hasPassword(), temp: auth.isTempPassword ? await auth.isTempPassword() : false }); }, []);

  const reload = useCallback(async () => { try { setData(applyPlacements(await api.loadProject())); setError(''); } catch (e) { setError(e.message); } }, []);
  useEffect(() => {
    (async () => {
      const id = await auth.getUser();
      setUserId(id);
      if (id) await refreshAccount();
      // Live app: the project is readable without signing in (view only), so always load.
      if (id || auth.authMode === 'demo' || auth.publicView) await reload();
      setBooted(true);
    })();
    return api.subscribe(reload);
  }, [reload]);
  useEffect(() => { const f = () => setView(validView(window.location.hash.slice(1))); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast]);

  const go = (v, opts = {}) => { if (opts.day) setDay(opts.day); if (opts.zone !== undefined) setZone(opts.zone); if (window.location.hash.slice(1) !== v) window.location.hash = v; setView(v); };
  const member = data && userId ? data.users.find((u) => u.id === userId) || null : null;
  // Visitors (and people signed in but not yet added) view everything except Setup and change nothing.
  const user = member || (data && auth.publicView ? { id: userId, name: userId ? account.email || 'Signed in' : 'Visitor', role: 'Visitor', signedIn: !!userId } : null);
  const can = (right) => !!user && (RIGHTS[user.role] || []).includes(right);

  const today = localToday();
  const derived = useMemo(() => {
    if (!data) return null;
    const adjustments = data.adjustments || [];
    const FC = forecastSchedule(data.activities, adjustments, data.calendar);
    const TP = computeTakt({ takt: data.takt, activities: FC.rows, calendar: data.calendar, actuals: data.actuals, commitments: data.commitments, constraints: data.constraints, adjustments, today });
    const items = FC.rows.concat(taktItems(TP, data.takt));
    return { TP, FC, items, adjustments, zmap: new Map(data.zones.map((z) => [z.code, z])) };
  }, [data, today]);

  // Writes go through here so every screen shows the same confirmation and error handling.
  const write = async (fn, done) => { try { await fn(); await reload(); if (done) setToast(done); return true; } catch (e) { setToast('Not saved: ' + e.message); return false; } };

  const value = {
    adjust, setAdjust, place, setPlace, api, auth, data, derived, error, booted, user, can, view, go, day, setDay, zone, setZone, today, toast, setToast, write, reload,
    signIn: async (id) => { const u = await auth.signIn(id); if (u) { setUserId(u); if (!data) await reload(); } },
    signInWithPassword: async (email, pw) => { const u = await auth.signInWithPassword(email, pw); setUserId(u); await refreshAccount(); await reload(); setSigningIn(false); },
    setPassword: async (pw) => { await auth.setPassword(pw); await refreshAccount(); },
    userId, member, account, signingIn, setSigningIn,
    signOut: async () => { await auth.signOut(); setUserId(null); setAccount({ email: '', hasPassword: true, temp: false }); await reload(); },
    week: mondayOf(day), working: data ? isWorking(day, data.calendar) : true,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
