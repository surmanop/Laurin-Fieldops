// Production data layer: Supabase (hosted Postgres). Tables and row-level security are in server/supabase/migrations.
// Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (see README).
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const PROJECT = import.meta.env.VITE_PROJECT || 'WCHS';
export const mode = 'live';

const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const sel = (t, q = '*') => supabase.from(t).select(q).eq('project', PROJECT);

// Column names in Postgres are snake_case; the app uses camelCase.
const toCamel = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
const toSnake = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()), v]));

export async function loadProject() {
  const [project, zones, rooms, trades, areaZones, calendar, activities, takt, wagons, roomTasks, wagonTasks, zoneRules, users, versions, actuals, commitments, constraints, adjustments] = await Promise.all([
    supabase.from('projects').select('*').eq('code', PROJECT).single().then(must),
    sel('zones').order('sort_order').then(must), sel('rooms').then(must), supabase.from('trades').select('*').order('sort_order').then(must),
    sel('area_zones').then(must), sel('calendar_exceptions').then(must), sel('activities').limit(20000).then(must),
    sel('takt_settings').single().then(must), sel('wagons').order('sequence').then(must), sel('room_tasks').limit(20000).then(must),
    sel('wagon_tasks').then(must), sel('zone_rules').order('priority').then(must), supabase.from('members_view').select('*').eq('project', PROJECT).then(must),
    sel('schedule_versions').order('loaded_at', { ascending: false }).then(must),
    sel('actuals').then(must), sel('commitments').then(must), sel('constraints').then(must), sel('schedule_adjustments').order('at').then(must),
  ]);
  const rt = {}; roomTasks.forEach((r) => { (rt[r.room] ||= {})[r.task] = r.status; });
  const wt = {}; wagonTasks.forEach((r) => { (wt[r.wagon_id] ||= []).push(r.task); });
  return {
    project: { code: project.code, name: project.name, address: project.address, statusDate: project.status_date },
    zones: zones.map((z) => ({ code: z.zone_code, level: z.level, rooms: z.rooms, train: z.train, trainPos: z.train_position, order: z.sort_order, area: z.area, l1: z.plan_l1, l2: z.plan_l2, geo: z.geometry })),
    rooms: rooms.map((r) => ({ room: r.room, name: r.room_name, floor: r.floor, zone: r.zone_code || '' })),
    trades: trades.map((t) => t.name),
    areaZones: areaZones.map((a) => ({ area: a.area, group: a.schedule_group, zone: a.zone_code })),
    calendar: calendar.map((c) => ({ name: c.name, from: c.from_date, to: c.to_date })),
    activities: activities.map((a) => ({ ...toCamel(a), uid: a.schedule_uid, zones: a.zones || [], preds: a.preds || [] })),
    takt: { start: takt.train_start, taktDays: takt.takt_days, train: takt.train_order, note: takt.baseline_note, wagons: wagons.map((w) => ({ id: w.wagon_id, name: w.name, trade: w.trade, match: w.schedule_match || [], skip: w.skip_zones || [] })) },
    tasks: [...new Set(roomTasks.map((r) => r.task))], roomTasks: rt, wagonTasks: wt,
    zoneRules: zoneRules.map((r) => ({ group: r.schedule_group, name: r.name_pattern, floor: r.floor, zones: r.zones, basis: r.basis })),
    users: users.map((u) => ({ id: u.user_id, name: u.display_name, role: u.role })),
    scheduleVersions: versions.map((v) => ({ name: v.name, statusDate: v.status_date, loaded: v.loaded_at?.slice(0, 10), count: v.activity_count })),
    actuals: actuals.map(toCamel), commitments: commitments.map(toCamel), constraints: constraints.map(toCamel),
    // target: a schedule uid (number) or a takt cell ('tk:w05|Zone 1')
    adjustments: adjustments.map((x) => ({ ...toCamel(x), target: x.target_uid ?? x.target_takt })),
  };
}

// Realtime: any change to the field logs reloads the screen for everyone looking at it.
export function subscribe(fn) {
  const ch = supabase.channel('fieldops').on('postgres_changes', { event: '*', schema: 'public' }, () => fn()).subscribe(); // includes schedule_adjustments
  return () => supabase.removeChannel(ch);
}
const TABLE = { actuals: 'actuals', commitments: 'commitments', constraints: 'constraints', adjustments: 'schedule_adjustments' };
export async function saveRecord(table, rec) {
  let r = { ...rec, project: PROJECT };
  if (table === 'adjustments') { const { target, ...rest } = r; r = { ...rest, targetUid: typeof target === 'number' ? target : null, targetTakt: typeof target === 'string' ? target : null }; }
  return toCamel(must(await supabase.from(TABLE[table]).upsert(toSnake(r)).select().single()));
}
export async function deleteRecord(table, id) { must(await supabase.from(TABLE[table]).delete().eq('id', id)); }
export async function setRoomTask(room, task, status) { must(await supabase.from('room_tasks').upsert({ project: PROJECT, room, task, status })); }
export async function saveTakt(t) {
  must(await supabase.from('takt_settings').update({ train_start: t.start, takt_days: t.taktDays, train_order: t.train }).eq('project', PROJECT));
  must(await supabase.rpc('replace_wagons', { p_project: PROJECT, p_wagons: t.wagons }));
}
export async function saveTrades(list) { must(await supabase.rpc('replace_trades', { p_trades: list })); }
export async function saveAreaZones(rows) { must(await supabase.rpc('replace_area_zones', { p_project: PROJECT, p_rows: rows })); }
export async function saveUserRole(id, role) { must(await supabase.from('memberships').update({ role }).eq('project', PROJECT).eq('user_id', id)); }
export async function replaceActivities(rows, version, clearAdjustments = true) { must(await supabase.rpc('replace_activities', { p_project: PROJECT, p_rows: rows, p_version: version, p_clear_adjustments: clearAdjustments })); }
export async function resetDemo() { throw new Error('Not available in the live app.'); }
