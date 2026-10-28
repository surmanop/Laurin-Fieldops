import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '@adapter';
import * as auth from '@auth';
import { localToday, isWorking, mondayOf } from './logic/dates.js';
import { computeTakt, taktItems } from './logic/takt.js';
import { forecastSchedule } from './logic/forecast.js';

export const VIEWS = [
  ['day', 'Day'], ['wwp', 'Weekly plan'], ['lookahead', '6-week lookahead'], ['takt', 'Takt plan'], ['model', '3D zones'], ['tracker', 'Tracker'], ['schedule', 'Schedule import'], ['admin', 'Setup'],
];
const validView = (h) => (VIEWS.some(([v]) => v === h) ? h : 'day');

// What each role may do. The live database enforces the same rules (server/supabase/migrations/002_security.sql).
const RIGHTS = {
  Owner: ['log', 'tracker', 'plan', 'admin', 'import'],
  Super: ['log', 'tracker'],
  Viewer: [],
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

  const reload = useCallback(async () => { try { setData(await api.loadProject()); setError(''); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { (async () => { setUserId(await auth.getUser()); await reload(); setBooted(true); })(); return api.subscribe(reload); }, [reload]);
  useEffect(() => { const f = () => setView(validView(window.location.hash.slice(1))); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast]);

  const go = (v, opts = {}) => { if (opts.day) setDay(opts.day); if (opts.zone !== undefined) setZone(opts.zone); if (window.location.hash.slice(1) !== v) window.location.hash = v; setView(v); };
  const user = data && userId ? data.users.find((u) => u.id === userId) || null : null;
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
    adjust, setAdjust, api, auth, data, derived, error, booted, user, can, view, go, day, setDay, zone, setZone, today, toast, setToast, write, reload,
    signIn: async (id) => { const u = await auth.signIn(id); if (u) setUserId(u); },
    signOut: async () => { await auth.signOut(); setUserId(null); },
    week: mondayOf(day), working: data ? isWorking(day, data.calendar) : true,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
