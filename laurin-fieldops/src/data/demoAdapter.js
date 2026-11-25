// Demo data layer: the same functions as supabaseAdapter.js, but data lives in this browser.
// Starts from the WCHS seed; changes are kept in localStorage for this viewer only.
import seed from '../seed/wchs.json';

const KEY = 'laurin-fieldops-demo-v1';
const MUTABLE = ['actuals', 'commitments', 'constraints', 'adjustments', 'roomTasks', 'takt', 'trades', 'areaZones', 'activities', 'users', 'scheduleVersions', 'project', 'manpower', 'placements', 'extRequests', 'invites'];
let state = null;
const listeners = new Set();
const clone = (x) => JSON.parse(JSON.stringify(x));

function load() {
  if (state) return state;
  state = clone(seed);
  state.adjustments = state.adjustments || [];
  state.manpower = state.manpower || [];
  state.placements = state.placements || [];
  state.extRequests = state.extRequests || [];
  // Demo trade foreman (United Supreme) so the Foreman role can be tried here.
  if (!state.users.some((u) => u.id === 'foreman')) state.users = [...state.users, { id: 'foreman', name: 'Demo Foreman', role: 'Foreman', trades: ['United Supreme'] }];
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) MUTABLE.forEach((k) => { if (saved[k] !== undefined) state[k] = saved[k]; }); } catch (e) { /* storage blocked: run from seed */ }
  return state;
}
function persist() {
  try { const out = {}; MUTABLE.forEach((k) => { out[k] = state[k]; }); localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) { /* not saved, still works this session */ }
  listeners.forEach((fn) => fn());
}
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const upsert = (list, rec) => { const i = list.findIndex((x) => x.id === rec.id); if (i >= 0) list[i] = rec; else list.push(rec); };

export const mode = 'demo';
export async function loadProject() { return clone(load()); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export async function saveRecord(table, rec) { load(); const r = { ...rec, id: rec.id || newId() }; upsert(state[table], r); persist(); return r; }
export async function deleteRecord(table, id) { load(); state[table] = state[table].filter((x) => x.id !== id); persist(); }
export async function setRoomTask(room, task, status) { load(); state.roomTasks[room] = { ...(state.roomTasks[room] || {}), [task]: status }; persist(); }
export async function saveTakt(takt) { load(); state.takt = takt; persist(); }
export async function saveTrades(list) { load(); state.trades = list; persist(); }
export async function saveAreaZones(rows) { load(); state.areaZones = rows; persist(); }
export async function saveUserRole(id, role) { load(); state.users = state.users.map((u) => (u.id === id ? { ...u, role, trades: role === 'Foreman' ? u.trades || [] : [] } : u)); persist(); }
export async function saveUserTrades(id, trades) { load(); state.users = state.users.map((u) => (u.id === id ? { ...u, trades } : u)); persist(); }
export async function updateRecord(table, id, patch) { load(); state[table] = state[table].map((x) => (x.id === id ? { ...x, ...patch } : x)); persist(); }
export async function requestExtension(r) { load(); state.extRequests = [{ ...r, id: newId(), status: 'Pending', requestedAt: new Date().toISOString() }, ...state.extRequests]; persist(); }
export async function withdrawExtension(id) { load(); state.extRequests = state.extRequests.filter((x) => x.id !== id); persist(); }
export async function decideExtension(id, approve, note = '') {
  load();
  const r = state.extRequests.find((x) => x.id === id);
  if (!r || r.status !== 'Pending') throw new Error('Already decided');
  if (approve) state.adjustments.push({ id: newId(), target: r.target, name: r.name, path: r.path, days: r.days, reason: 'Extended: ' + r.reason, note: [r.note, note && `(approved: ${note})`].filter(Boolean).join(' '), fromStart: null, delayFrom: null, by: 'peter', at: new Date().toISOString() });
  state.extRequests = state.extRequests.map((x) => (x.id === id ? { ...x, status: approve ? 'Approved' : 'Rejected', decidedBy: 'peter', decidedAt: new Date().toISOString(), decisionNote: note } : x));
  persist();
  return approve ? 'Approved' : 'Rejected';
}
export async function replaceActivities(rows, version, clearAdjustments = true) { load(); state.activities = rows; if (clearAdjustments) state.adjustments = []; state.scheduleVersions = [version, ...state.scheduleVersions]; state.project = { ...state.project, statusDate: version.statusDate || state.project.statusDate }; persist(); }
export async function resetDemo() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } state = null; load(); listeners.forEach((fn) => fn()); }
export async function saveManpower(day, rows) {
  load();
  rows.forEach(({ trade, headcount }) => {
    state.manpower = state.manpower.filter((m) => !(m.day === day && m.trade === trade));
    if (headcount != null) state.manpower.push({ day, trade, headcount });
  });
  persist();
}
export async function savePlacement(uid, zones) { load(); state.placements = state.placements.filter((p) => p.uid !== uid).concat({ uid, zones, by: 'peter', at: new Date().toISOString() }); persist(); }
export async function removePlacement(uid) { load(); state.placements = state.placements.filter((p) => p.uid !== uid); persist(); }
export async function setTempPassword(args) { if ((args.password || '').length < 8) throw new Error('Temporary password must be 8 to 72 characters.'); load(); if (args.email) state.invites = (state.invites || []).filter((i) => i.email !== args.email.toLowerCase()); persist(); return { ok: true, email: args.email || '', role: args.role || 'Viewer' }; }
