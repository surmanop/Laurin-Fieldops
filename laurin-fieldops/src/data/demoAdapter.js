// Demo data layer: the same functions as supabaseAdapter.js, but data lives in this browser.
// Starts from the WCHS seed; changes are kept in localStorage for this viewer only.
import seed from '../seed/wchs.json';

const KEY = 'laurin-fieldops-demo-v1';
const MUTABLE = ['actuals', 'commitments', 'constraints', 'adjustments', 'roomTasks', 'takt', 'trades', 'areaZones', 'activities', 'users', 'scheduleVersions', 'project'];
let state = null;
const listeners = new Set();
const clone = (x) => JSON.parse(JSON.stringify(x));

function load() {
  if (state) return state;
  state = clone(seed);
  state.adjustments = state.adjustments || [];
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
export async function saveUserRole(id, role) { load(); state.users = state.users.map((u) => (u.id === id ? { ...u, role } : u)); persist(); }
export async function replaceActivities(rows, version, clearAdjustments = true) { load(); state.activities = rows; if (clearAdjustments) state.adjustments = []; state.scheduleVersions = [version, ...state.scheduleVersions]; state.project = { ...state.project, statusDate: version.statusDate || state.project.statusDate }; persist(); }
export async function resetDemo() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } state = null; load(); listeners.forEach((fn) => fn()); }
