// SharePoint data layer: the Field Operations site lists, through Microsoft Graph, as the signed-in person.
// Same functions as supabaseAdapter.js / demoAdapter.js, so every screen works unchanged.
// The Power Apps app (WCHS Field Ops) reads and writes the same lists, so both can be used side by side.
import { getToken, getName, getUser } from '../auth/msalAuth.js';

export const mode = 'live';
const PROJECT = import.meta.env.VITE_PROJECT || 'WCHS';
const HOST = import.meta.env.VITE_SP_HOST || 'laurincompany.sharepoint.com';
const SITE = import.meta.env.VITE_SP_SITE || '/sites/FieldOperations';
const TZ = 'America/Edmonton'; // the site's regional setting; date-only columns are stored as local midnight
const G = 'https://graph.microsoft.com/v1.0';

// ---------- Graph plumbing ----------
async function gfetch(url, opts = {}) {
  const token = await getToken();
  const r = await fetch(url.startsWith('http') ? url : G + url, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly', ...(opts.headers || {}) } });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.message || `SharePoint request failed (${r.status})`);
  return j;
}
let siteP = null;
const site = () => (siteP ||= (async () => {
  const s = await gfetch(`/sites/${HOST}:${SITE}`);
  const ls = await gfetch(`/sites/${s.id}/lists?$select=id,displayName&$top=200`);
  return { id: s.id, lists: Object.fromEntries(ls.value.map((l) => [l.displayName, l.id])) };
})().catch((e) => { siteP = null; throw e; }));
const listUrl = async (name) => { const s = await site(); const id = s.lists[name]; if (!id) throw new Error(`SharePoint list "${name}" not found`); return `/sites/${s.id}/lists/${id}`; };

// Only the columns the app uses (keeps RoomTasks, ~4,200 rows, quick to load).
const COLS = {
  Projects: 'ProjectCode,ProjectName,Address,StatusDate,ScheduleVersion', Zones: 'Project,ZoneCode,Level,Rooms,Train,TrainPosition,Area,SortOrder,PlanL1X,PlanL1Y,PlanL2X,PlanL2Y,Geometry',
  Rooms: 'Project,Room,RoomName,Floor,ZoneCode', Trades: 'TradeName,SortOrder', AreaZones: 'Project,Area,ScheduleGroup,ZoneCode', Calendar: 'Project,Name,FromDate,ToDate',
  Activities: 'Project,ScheduleUID,ActivityName,SchedulePath,StartDate,FinishDate,PctComplete,Milestone,Critical,Trade,Category,Zones,Area,Bucket,ZoneBasis,Preds',
  TaktSettings: 'Project,TrainStart,TaktDays,TrainOrder,BaselineNote', Wagons: 'Project,Sequence,WagonID,WagonName,Trade,ScheduleMatch,SkipZones', RoomTasks: 'Project,Room,ZoneCode,Task,Status',
  WagonTasks: 'Project,WagonID,Task', ZoneRules: 'Project,Priority,ScheduleGroup,NamePattern,Floor,Zones,Basis', Members: 'Project,Email,DisplayName,Role',
  ScheduleVersions: 'Project,VersionName,StatusDate,ActivityCount,LoadedAt', Actuals: 'Project,WorkDate,ZoneCode,ActivityUID,WagonID,ActivityName,Status,Trade,Crew,FieldPct,Notes,LoggedBy,LoggedAt,ByEmail',
  Commitments: 'Project,WeekOf,ZoneCode,ActivityUID,WagonID,ActivityName,Commitment,Trade,CommittedBy,DueDate,Status,MissReason,LoggedBy,LoggedAt,ByEmail',
  Constraints: 'Project,ZoneCode,ActivityUID,WagonID,ActivityName,ActivityStart,Trade,ConstraintType,Constraint,Responsible,NeedBy,Status,ClearedOn,LoggedBy,LoggedAt,ByEmail',
  Adjustments: 'Project,TargetUID,TargetTakt,ActivityName,SchedulePath,Days,Reason,Note,FromStart,ByEmail,LoggedBy,LoggedAt',
};
async function items(name) {
  let url = (await listUrl(name)) + `/items?expand=fields(select=${COLS[name] || 'Title'})&$top=999`;
  const out = [];
  while (url) { const j = await gfetch(url); j.value.forEach((i) => out.push({ ...i.fields, _id: i.id })); url = j['@odata.nextLink'] || null; }
  return out.filter((f) => !('Project' in f) || !f.Project || f.Project === PROJECT);
}
const clean = (f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined));
async function create(name, fields) { const j = await gfetch((await listUrl(name)) + '/items', { method: 'POST', body: JSON.stringify({ fields: clean({ Project: PROJECT, ...fields }) }) }); return { ...j.fields, _id: j.id }; }
async function update(name, id, fields) { return gfetch((await listUrl(name)) + `/items/${id}/fields`, { method: 'PATCH', body: JSON.stringify(clean(fields)) }); }
async function remove(name, id) { return gfetch((await listUrl(name)) + `/items/${id}`, { method: 'DELETE' }); }
// Many writes at once: Graph $batch, 20 requests per call.
async function batch(reqs) {
  for (let i = 0; i < reqs.length; i += 20) {
    const part = reqs.slice(i, i + 20).map((r, k) => ({ id: String(k), method: r.method, url: r.url, ...(r.body ? { body: r.body, headers: { 'Content-Type': 'application/json' } } : {}) }));
    const j = await gfetch('/$batch', { method: 'POST', body: JSON.stringify({ requests: part }) });
    const bad = j.responses.find((x) => x.status >= 400);
    if (bad) throw new Error(bad.body?.error?.message || `Batch write failed (${bad.status})`);
  }
}

// ---------- dates ----------
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const toDay = (iso) => (iso ? ymd.format(new Date(iso)) : '');
function fromDay(d) { // 'YYYY-MM-DD' -> UTC instant of local midnight in TZ
  if (!d) return null;
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
  let t = Date.UTC(y, m - 1, dd);
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    t -= local - Date.UTC(y, m - 1, dd);
  }
  return new Date(t).toISOString();
}
const split = (s, sep = '; ') => (s ? String(s).split(sep).map((x) => x.trim()).filter(Boolean) : []);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const CAT = { 'Zone-specific': 'zone', 'Area-wide': 'areawide', 'Site & building-wide': 'site', 'Not placed': 'unplaced' };
const CAT_LABEL = Object.fromEntries(Object.entries(CAT).map(([k, v]) => [v, k]));

// ---------- read ----------
let cache = { roomTasks: new Map(), members: [] };
export async function loadProject() {
  const L = ['Projects', 'Zones', 'Rooms', 'Trades', 'AreaZones', 'Calendar', 'Activities', 'TaktSettings', 'Wagons', 'RoomTasks', 'WagonTasks', 'ZoneRules', 'Members', 'ScheduleVersions', 'Actuals', 'Commitments', 'Constraints', 'Adjustments'];
  const r = Object.fromEntries(await Promise.all(L.map(async (n) => [n, await items(n)])));
  const proj = r.Projects.find((p) => p.ProjectCode === PROJECT) || r.Projects[0] || {};
  const members = r.Members.map((m) => ({ id: String(m.Email || '').toLowerCase(), name: m.DisplayName || m.Email, role: m.Role, _id: m._id }));
  const byName = new Map(members.map((m) => [m.name, m.id]));
  const who = (x) => (x.ByEmail ? String(x.ByEmail).toLowerCase() : byName.get(x.LoggedBy) || null);
  const rt = {}; cache.roomTasks = new Map();
  r.RoomTasks.forEach((x) => { (rt[x.Room] ||= {})[x.Task] = x.Status; cache.roomTasks.set(x.Room + '|' + x.Task, x._id); });
  const wt = {}; r.WagonTasks.forEach((x) => { (wt[x.WagonID] ||= []).push(x.Task); });
  const takt = r.TaktSettings[0] || {};
  cache.members = members;
  return {
    project: { code: proj.ProjectCode || PROJECT, name: proj.ProjectName || '', address: proj.Address || '', statusDate: toDay(proj.StatusDate) },
    zones: r.Zones.sort((a, b) => (a.SortOrder ?? 999) - (b.SortOrder ?? 999)).map((z) => ({
      code: z.ZoneCode, level: z.Level || '', rooms: z.Rooms || '', train: z.Train || '', trainPos: num(z.TrainPosition), order: num(z.SortOrder), area: z.Area || '',
      l1: z.PlanL1X != null ? [z.PlanL1X, z.PlanL1Y] : null, l2: z.PlanL2X != null ? [z.PlanL2X, z.PlanL2Y] : null, geo: z.Geometry ? JSON.parse(z.Geometry) : null,
    })),
    rooms: r.Rooms.map((x) => ({ room: x.Room, name: x.RoomName || '', floor: x.Floor || '', zone: x.ZoneCode || '' })),
    trades: r.Trades.sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0)).map((t) => t.TradeName),
    areaZones: r.AreaZones.map((a) => ({ area: a.Area, group: a.ScheduleGroup || '', zone: a.ZoneCode })),
    calendar: r.Calendar.map((c) => ({ name: c.Name, from: toDay(c.FromDate), to: toDay(c.ToDate) })),
    activities: r.Activities.map((a) => ({
      uid: num(a.ScheduleUID), name: a.ActivityName, path: a.SchedulePath || '', start: toDay(a.StartDate), finish: toDay(a.FinishDate), pct: num(a.PctComplete) || 0,
      milestone: a.Milestone === 'Yes', critical: a.Critical === 'Yes', trade: a.Trade || '', category: CAT[a.Category] || 'site', zones: split(a.Zones), area: a.Area || '', bucket: a.Bucket || '', basis: a.ZoneBasis || '',
      preds: a.Preds ? JSON.parse(a.Preds) : [],
    })),
    takt: {
      start: toDay(takt.TrainStart), taktDays: num(takt.TaktDays), train: split(takt.TrainOrder, ', '), note: takt.BaselineNote || '',
      wagons: r.Wagons.sort((a, b) => a.Sequence - b.Sequence).map((w) => ({ id: w.WagonID, name: w.WagonName, trade: w.Trade || '', match: split(w.ScheduleMatch), skip: split(w.SkipZones, ', ') })),
    },
    tasks: [...new Set(r.RoomTasks.map((x) => x.Task))], roomTasks: rt, wagonTasks: wt,
    zoneRules: r.ZoneRules.sort((a, b) => (a.Priority ?? 100) - (b.Priority ?? 100)).map((z) => ({ group: z.ScheduleGroup, name: z.NamePattern || '', floor: z.Floor || '', zones: split(z.Zones), basis: z.Basis || '' })),
    users: members.map(({ _id, ...m }) => m),
    scheduleVersions: r.ScheduleVersions.sort((a, b) => String(b.LoadedAt).localeCompare(String(a.LoadedAt))).map((v) => ({ name: v.VersionName, statusDate: toDay(v.StatusDate), loaded: toDay(v.LoadedAt), count: num(v.ActivityCount) })),
    actuals: r.Actuals.map((x) => ({ id: x._id, day: toDay(x.WorkDate), zone: x.ZoneCode, activityUid: num(x.ActivityUID), wagon: x.WagonID || '', activityName: x.ActivityName || '', status: x.Status, trade: x.Trade || '', crew: num(x.Crew), pct: num(x.FieldPct), notes: x.Notes || '', by: who(x), byName: x.LoggedBy || '', at: x.LoggedAt || '' })),
    commitments: r.Commitments.map((x) => ({ id: x._id, week: toDay(x.WeekOf), zone: x.ZoneCode, activityUid: num(x.ActivityUID), wagon: x.WagonID || '', activityName: x.ActivityName || '', what: x.Commitment || '', trade: x.Trade || '', committedBy: x.CommittedBy || '', due: toDay(x.DueDate), status: x.Status || 'Open', reason: x.MissReason || '', by: who(x), byName: x.LoggedBy || '', at: x.LoggedAt || '' })),
    constraints: r.Constraints.map((x) => ({ id: x._id, zone: x.ZoneCode, activityUid: num(x.ActivityUID), wagon: x.WagonID || '', activityName: x.ActivityName || '', activityStart: toDay(x.ActivityStart), type: x.ConstraintType || '', trade: x.Trade || '', what: x.Constraint || '', responsible: x.Responsible || '', needBy: toDay(x.NeedBy), status: x.Status || 'Open', clearedOn: toDay(x.ClearedOn), by: who(x), byName: x.LoggedBy || '', at: x.LoggedAt || '' })),
    adjustments: r.Adjustments.sort((a, b) => String(a.LoggedAt).localeCompare(String(b.LoggedAt))).map((x) => ({ id: x._id, target: x.TargetUID != null ? num(x.TargetUID) : x.TargetTakt, name: x.ActivityName || '', path: x.SchedulePath || '', days: num(x.Days), reason: x.Reason || '', note: x.Note || '', fromStart: toDay(x.FromStart), by: who(x), byName: x.LoggedBy || '', at: x.LoggedAt || '' })),
  };
}

// No live push from SharePoint to the browser: re-read every 2 minutes while the app is on screen.
export function subscribe(fn) {
  const t = setInterval(() => { if (document.visibilityState === 'visible') fn(); }, 120000);
  const v = () => { if (document.visibilityState === 'visible') fn(); };
  document.addEventListener('visibilitychange', v);
  return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); };
}

// ---------- write ----------
async function me() { const id = (await getUser()) || ''; return { email: id, name: cache.members.find((m) => m.id === id)?.name || (await getName()) || id }; }
const LIST = { actuals: 'Actuals', commitments: 'Commitments', constraints: 'Constraints', adjustments: 'Adjustments' };
function toFields(table, r) {
  const link = { ActivityUID: r.activityUid ?? null, WagonID: r.wagon || '', ActivityName: r.activityName || '' };
  if (table === 'actuals') return { Title: `${r.zone} · ${r.day}`, WorkDate: fromDay(r.day), ZoneCode: r.zone, ...link, Status: r.status, Trade: r.trade || '', Crew: r.crew ?? null, FieldPct: r.pct ?? null, Notes: r.notes || '' };
  if (table === 'commitments') return { Title: `${r.zone} · ${r.week}`, WeekOf: fromDay(r.week), ZoneCode: r.zone, ...link, Commitment: r.what, Trade: r.trade || '', CommittedBy: r.committedBy || '', DueDate: fromDay(r.due), Status: r.status || 'Open', MissReason: r.reason || null };
  if (table === 'constraints') return { Title: r.zone, ZoneCode: r.zone, ...link, ActivityStart: fromDay(r.activityStart), ConstraintType: r.type, Trade: r.trade || '', Constraint: r.what, Responsible: r.responsible || '', NeedBy: fromDay(r.needBy), Status: r.status || 'Open', ClearedOn: fromDay(r.clearedOn) };
  if (table === 'adjustments') return { Title: r.name || String(r.target), TargetUID: typeof r.target === 'number' ? r.target : null, TargetTakt: typeof r.target === 'string' ? r.target : '', ActivityName: r.name || '', SchedulePath: r.path || '', Days: r.days, Reason: r.reason, Note: r.note || '', FromStart: fromDay(r.fromStart) };
  throw new Error('Unknown table ' + table);
}
// Graph rejects null for some column types on create; leave those out instead.
const noNulls = (f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== null));
export async function saveRecord(table, rec) {
  const f = toFields(table, rec);
  if (rec.id) { await update(LIST[table], rec.id, f); return rec; } // null clears a value (e.g. Reopen clears ClearedOn)
  const u = await me();
  const row = await create(LIST[table], noNulls({ ...f, ByEmail: u.email, LoggedBy: u.name, LoggedAt: rec.at || new Date().toISOString() }));
  return { ...rec, id: row._id, by: u.email };
}
export async function deleteRecord(table, id) { await remove(LIST[table], id); }

export async function setRoomTask(room, task, status) {
  const id = cache.roomTasks.get(room + '|' + task);
  if (id) await update('RoomTasks', id, { Status: status });
  else { const row = await create('RoomTasks', { Title: `${room} · ${task}`, Room: room, Task: task, Status: status }); cache.roomTasks.set(room + '|' + task, row._id); }
}

export async function saveTakt(t) {
  const [settings] = await items('TaktSettings');
  const f = { TrainStart: fromDay(t.start), TaktDays: t.taktDays, TrainOrder: t.train.join(', ') };
  if (settings) await update('TaktSettings', settings._id, f); else await create('TaktSettings', { Title: PROJECT, ...f });
  const have = await items('Wagons'); const lu = await listUrl('Wagons');
  const keep = new Set(t.wagons.map((w) => w.id));
  const reqs = [];
  t.wagons.forEach((w, i) => {
    const fields = { Title: w.id, WagonID: w.id, Sequence: i + 1, WagonName: w.name, Trade: w.trade || '', ScheduleMatch: (w.match || []).join('; '), SkipZones: (w.skip || []).join(', ') };
    const ex = have.find((x) => x.WagonID === w.id);
    reqs.push(ex ? { method: 'PATCH', url: `${lu}/items/${ex._id}/fields`, body: fields } : { method: 'POST', url: `${lu}/items`, body: { fields: { Project: PROJECT, ...fields } } });
  });
  have.filter((x) => !keep.has(x.WagonID)).forEach((x) => reqs.push({ method: 'DELETE', url: `${lu}/items/${x._id}` }));
  await batch(reqs);
}

export async function saveTrades(list) {
  const have = await items('Trades'); const lu = await listUrl('Trades'); const reqs = [];
  list.forEach((name, i) => { const ex = have.find((x) => x.TradeName === name); reqs.push(ex ? { method: 'PATCH', url: `${lu}/items/${ex._id}/fields`, body: { SortOrder: i + 1 } } : { method: 'POST', url: `${lu}/items`, body: { fields: { Title: name, TradeName: name, SortOrder: i + 1 } } }); });
  have.filter((x) => !list.includes(x.TradeName)).forEach((x) => reqs.push({ method: 'DELETE', url: `${lu}/items/${x._id}` }));
  await batch(reqs);
}

export async function saveAreaZones(rows) {
  const have = await items('AreaZones'); const lu = await listUrl('AreaZones');
  const reqs = have.map((x) => ({ method: 'DELETE', url: `${lu}/items/${x._id}` }));
  rows.forEach((a) => reqs.push({ method: 'POST', url: `${lu}/items`, body: { fields: { Project: PROJECT, Title: a.zone, Area: a.area, ScheduleGroup: a.group || '', ZoneCode: a.zone, Source: 'Setup screen' } } }));
  await batch(reqs);
}

export async function saveUserRole(id, role) {
  const m = cache.members.find((x) => x.id === id);
  if (!m) throw new Error('Person not found');
  await update('Members', m._id, { Role: role });
}
export async function addMember(email, name, role) {
  const e = email.trim().toLowerCase();
  if (cache.members.some((m) => m.id === e)) throw new Error(`${e} is already on this project`);
  await create('Members', { Title: e, Email: e, DisplayName: name.trim() || e, Role: role });
}

// Schedule update: matches activities by MS Project unique ID. Zones set by hand (no placement rule behind them)
// are kept when the new schedule has none for that activity. Field logs are never touched.
export async function replaceActivities(rows, version, clearAdjustments = true) {
  const have = await items('Activities'); const lu = await listUrl('Activities');
  const byUid = new Map(have.map((a) => [num(a.ScheduleUID), a]));
  const reqs = [];
  const fields = (a, ex) => {
    let zones = (a.zones || []).join('; ');
    if (!zones && ex?.Zones && !ex.ZoneBasis) zones = ex.Zones; // hand-set zone
    return { Title: a.name.slice(0, 255), ScheduleUID: a.uid, ActivityName: a.name.slice(0, 255), SchedulePath: a.path || '', StartDate: fromDay(a.start), FinishDate: fromDay(a.finish), PctComplete: Math.round(a.pct || 0), Milestone: a.milestone ? 'Yes' : 'No', Critical: a.critical ? 'Yes' : 'No', Trade: a.trade || '', Category: CAT_LABEL[a.category] || 'Site & building-wide', Zones: zones, Area: a.area || '', Bucket: a.bucket || '', ZoneBasis: zones && !a.zones?.length ? '' : a.basis || '', ScheduleVersion: version.name, Preds: JSON.stringify(a.preds || []) };
  };
  rows.forEach((a) => { const ex = byUid.get(a.uid); reqs.push(ex ? { method: 'PATCH', url: `${lu}/items/${ex._id}/fields`, body: fields(a, ex) } : { method: 'POST', url: `${lu}/items`, body: { fields: { Project: PROJECT, ...fields(a) } } }); });
  const keep = new Set(rows.map((a) => a.uid));
  have.filter((a) => !keep.has(num(a.ScheduleUID))).forEach((a) => reqs.push({ method: 'DELETE', url: `${lu}/items/${a._id}` }));
  await batch(reqs);
  const u = await me();
  await create('ScheduleVersions', { Title: version.name, VersionName: version.name, StatusDate: fromDay(version.statusDate), ActivityCount: version.count, LoadedAt: new Date().toISOString(), LoadedBy: u.name });
  const [p] = await items('Projects');
  if (p) await update('Projects', p._id, noNulls({ StatusDate: fromDay(version.statusDate), ScheduleVersion: version.name }));
  if (clearAdjustments) { const adj = await items('Adjustments'); const al = await listUrl('Adjustments'); await batch(adj.map((x) => ({ method: 'DELETE', url: `${al}/items/${x._id}` }))); }
}
export async function resetDemo() { throw new Error('Not available in the live app.'); }
