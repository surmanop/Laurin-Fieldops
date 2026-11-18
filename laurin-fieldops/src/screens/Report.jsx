import React, { useMemo } from 'react';
import { useApp } from '../store.jsx';
import { DateBar } from '../ui/common.jsx';
import { Empty, Kpi } from '../ui/parts.jsx';
import { zoneLabel } from '../ui/forms.jsx';
import { ppc } from '../logic/schedule.js';
import { addDays, fmt, iso, localToday } from '../logic/dates.js';
import { keyMilestones } from '../logic/forecast.js';
import { downloadXlsx, printReport } from '../logic/exportFile.js';

// Weekly report: manpower, progress, delays, PPC and next week, built only from what is logged in the app.
// Every table on screen is also a sheet in the Excel file and a section of the printout.
const STAT = ['Worked as planned', 'Partial / behind', 'Not worked', 'Completed', 'Unscheduled work'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const localDay = (ts) => { if (!ts) return ''; const d = new Date(ts); return isNaN(d) ? '' : iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))); };
const inRange = (d, a, b) => !!d && d >= a && d <= b;
const pctTxt = (p) => (p.pct == null ? '—' : `${p.pct}% (${p.done} of ${p.total})`);
const tally = (list, key) => [...list.reduce((m, x) => { const k = key(x) || 'Not given'; return m.set(k, [...(m.get(k) || []), x]); }, new Map())].sort((a, b) => a[0].localeCompare(b[0]));

export function buildWeekly(data, derived, week, today) {
  const end = addDays(week, 6), nextMon = addDays(week, 7), nextEnd = addDays(week, 13), prevMon = addDays(week, -7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  // 1. Manpower (site headcount per trade per day)
  const mp = data.manpower || [];
  const mpW = mp.filter((m) => inRange(m.day, week, end)), mpP = mp.filter((m) => inRange(m.day, prevMon, addDays(week, -1)));
  const cols = days.filter((d, i) => i < 5 || mpW.some((m) => m.day === d));
  const trades = [...new Set([...mpW, ...mpP].map((m) => m.trade))].sort((a, b) => (data.trades.indexOf(a) + 1 || 999) - (data.trades.indexOf(b) + 1 || 999) || a.localeCompare(b));
  const sum = (list) => list.reduce((s, m) => s + (+m.headcount || 0), 0);
  const daysOn = (list) => new Set(list.map((m) => m.day)).size;
  const manRows = trades.map((t) => {
    const w = mpW.filter((m) => m.trade === t), p = mpP.filter((m) => m.trade === t), tw = sum(w), tp = sum(p);
    return [t, ...cols.map((d) => { const v = w.filter((m) => m.day === d); return v.length ? sum(v) : ''; }), tw, daysOn(w) ? Math.round((10 * tw) / daysOn(w)) / 10 : '', tp, tw - tp];
  });
  const totW = sum(mpW), totP = sum(mpP);
  if (manRows.length) manRows.push(['All trades', ...cols.map((d) => { const v = mpW.filter((m) => m.day === d); return v.length ? sum(v) : ''; }), totW, daysOn(mpW) ? Math.round((10 * totW) / daysOn(mpW)) / 10 : '', totP, totW - totP]);

  // 2. Progress
  const ents = data.actuals.filter((e) => inRange(e.day, week, end));
  const statRow = (label, list) => [label, list.length, ...STAT.map((s) => list.filter((e) => e.status === s).length), list.reduce((s, e) => s + (+e.crew || 0), 0) || ''];
  const byTrade = tally(ents, (e) => e.trade).map(([t, l]) => statRow(t, l));
  const byZone = tally(ents, (e) => zoneLabel(e.zone)).map(([z, l]) => statRow(z, l));
  const rta = data.roomTaskAt || {};
  const trk = data.tasks.map((t) => {
    const vals = data.rooms.map((r) => ({ v: data.roomTasks[r.room]?.[t] || 'Not started', at: localDay(rta[r.room]?.[t]) })).filter((x) => x.v !== 'N/A');
    const done = vals.filter((x) => x.v === 'Complete').length;
    return [t, vals.length, done, vals.length ? Math.round((100 * done) / vals.length) + '%' : '—', vals.filter((x) => x.v === 'Complete' && inRange(x.at, week, end)).length, vals.filter((x) => x.v === 'Incomplete Progress').length];
  }).filter((r) => r[1]);
  const items = derived.items.filter((a) => a.category !== 'summary');
  const where = (a) => (a.zones?.length ? a.zones.map(zoneLabel).join(', ') : a.category === 'unplaced' ? 'Not placed' : a.area || 'Site');
  const sched = (a, what) => [where(a), a.name, a.path || '', a.trade || '', fmt(a.start, 'shortY'), fmt(a.finish, 'shortY'), a.shift > 0 ? `+${a.shift}d` : '', what];
  const schRows = [
    ...items.filter((a) => inRange(a.start, week, end)).map((a) => sched(a, 'Planned start')),
    ...items.filter((a) => inRange(a.finish, week, end) && !inRange(a.start, week, end)).map((a) => sched(a, 'Planned finish')),
  ];
  const doneLogged = ents.filter((e) => e.status === 'Completed');

  // 3. Delays
  const pushes = (data.adjustments || []).filter((x) => inRange(x.delayFrom, week, end) || (!x.delayFrom && inRange(localDay(x.at), week, end)));
  const pushRows = pushes.map((x) => [fmt(x.delayFrom || localDay(x.at), 'shortY'), x.name || String(x.target), x.days, x.reason, x.note || '']);
  const lost = ents.filter((e) => e.status === 'Not worked' || e.status === 'Partial / behind');
  const lostRows = lost.map((e) => [fmt(e.day, 'shortY'), zoneLabel(e.zone), e.activityName || '', e.trade || '', e.status, e.notes || '']);
  const ms = keyMilestones(derived.FC.rows).map((a) => [a.name, fmt(a.baseFinish || a.finish, 'shortY'), fmt(a.finish, 'shortY'), a.shift > 0 ? `+${a.shift} working days` : 'On baseline']);

  // 4. PPC
  const cm = data.commitments.filter((c) => c.week === week);
  const P = ppc(cm);
  const trend = Array.from({ length: 8 }, (_, i) => addDays(week, -7 * (7 - i))).map((w) => ({ w, ...ppc(data.commitments.filter((c) => c.week === w)) }));
  const misses = data.commitments.filter((c) => c.status === 'Not complete' && c.week >= trend[0].w && c.week <= week);
  const reasons = tally(misses, (c) => c.reason).sort((a, b) => b[1].length - a[1].length).map(([r, l]) => [r, l.length]);
  const ppcTrade = tally(cm, (c) => c.trade).map(([t, l]) => [t, pctTxt(ppc(l))]);
  const missRows = cm.filter((c) => c.status === 'Not complete').map((c) => [zoneLabel(c.zone), c.what, c.trade || '', c.reason || 'Not given']);

  // 5. Next week
  const nextRows = items.filter((a) => inRange(a.start, nextMon, nextEnd)).map((a) => [where(a), a.name, a.path || '', a.trade || '', fmt(a.start, 'shortY'), fmt(a.finish, 'shortY')]);
  const cons = data.constraints.filter((c) => c.status !== 'Cleared' && c.needBy <= nextEnd).sort((a, b) => a.needBy.localeCompare(b.needBy))
    .map((c) => [fmt(c.needBy, 'shortY'), zoneLabel(c.zone), c.activityName || '', c.trade || '', c.type, c.what, c.responsible || '', c.needBy < today ? 'Past need-by' : 'Due']);

  const statHead = (first) => [first, 'Entries', ...STAT, 'Crew (sum)'];
  const sections = [
    { group: 'Manpower', name: 'Manpower', title: 'Manpower by trade', note: 'Site headcount from the Day screen. Avg/day counts only days with a number entered. Change = this week total minus last week total.',
      heads: ['Trade', ...cols.map((d) => DAYS[days.indexOf(d)] + ' ' + fmt(d)), 'Week total', 'Avg / day', 'Last week', 'Change'], rows: manRows, empty: 'No manpower recorded this week or last.' },
    { group: 'Progress', name: 'Progress by trade', title: 'Field log by trade', note: 'Entries logged on the Day screen this week.', heads: statHead('Trade'), rows: byTrade, empty: 'No field log entries this week.' },
    { group: 'Progress', name: 'Progress by zone', title: 'Field log by zone', heads: statHead('Zone'), rows: byZone, empty: 'No field log entries this week.' },
    { group: 'Progress', name: 'Tracker', title: 'Room tracker by task', note: 'Current state of the Tracker. "Marked complete this week" counts rooms whose last change was to Complete during this week (the app keeps the last change only, not full history).',
      heads: ['Task', 'Rooms (excl. N/A)', 'Complete', '% complete', 'Marked complete this week', 'Incomplete progress'], rows: trk, empty: 'No tracker data.' },
    { group: 'Progress', name: 'Schedule this week', title: 'Schedule: planned starts and finishes this week', note: `Planned (forecast) dates from the schedule and takt plan. ${doneLogged.length} item${doneLogged.length === 1 ? '' : 's'} logged Completed in the field this week.`,
      heads: ['Zone', 'Activity', 'Schedule group', 'Trade', 'Start', 'Finish', 'Pushed', 'This week'], rows: schRows, empty: 'Nothing planned to start or finish this week.' },
    { group: 'Delays', name: 'Pushes', title: 'Schedule pushes logged this week', heads: ['From', 'Activity', 'Working days', 'Reason', 'Note'], rows: pushRows, empty: 'No pushes logged this week.' },
    { group: 'Delays', name: 'Not worked', title: 'Not worked / partial (field log)', heads: ['Day', 'Zone', 'Activity', 'Trade', 'Status', 'Notes'], rows: lostRows, empty: 'No Not worked or Partial entries this week.' },
    { group: 'Delays', name: 'Milestones', title: 'Key milestones: forecast vs baseline', note: 'Forecast includes every push logged to date, carried through the schedule logic.', heads: ['Milestone', 'Baseline finish', 'Forecast finish', 'Variance'], rows: ms, empty: 'No Substantial Completion or Occupancy milestone in the schedule.' },
    { group: 'PPC', name: 'PPC trend', title: 'PPC, last 8 weeks', heads: ['Week of', 'PPC'], rows: trend.map((t) => [fmt(t.w, 'shortY'), pctTxt(t)]), empty: '' },
    { group: 'PPC', name: 'PPC by trade', title: 'PPC by trade, this week', heads: ['Trade', 'PPC'], rows: ppcTrade, empty: 'No commitments this week.' },
    { group: 'PPC', name: 'Missed', title: 'Missed commitments this week', heads: ['Zone', 'Commitment', 'Trade', 'Reason'], rows: missRows, empty: 'No missed commitments this week.' },
    { group: 'PPC', name: 'Miss reasons', title: 'Reasons for misses, last 8 weeks', heads: ['Reason', 'Count'], rows: reasons, empty: 'No misses recorded.' },
    { group: 'Next week', name: 'Next week starts', title: `Starting next week (week of ${fmt(nextMon, 'shortY')})`, heads: ['Zone', 'Activity', 'Schedule group', 'Trade', 'Start', 'Finish'], rows: nextRows, empty: 'Nothing planned to start next week.' },
    { group: 'Next week', name: 'Constraints', title: 'Open constraints due by end of next week', heads: ['Need by', 'Zone', 'Activity', 'Trade', 'Type', 'Constraint', 'Responsible', 'Status'], rows: cons, empty: 'No open constraints due.' },
  ];
  const kpis = [
    { v: totW, l: `Man-days this week (last week ${totP})` },
    { v: daysOn(mpW) ? Math.round(totW / daysOn(mpW)) : '—', l: 'Average daily headcount' },
    { v: P.pct == null ? '—' : P.pct + '%', l: `PPC (${P.done} of ${P.total})` },
    { v: pushes.length, l: 'Pushes logged', tone: pushes.length ? 'bad' : '' },
    { v: lost.length, l: 'Not worked / partial entries', tone: lost.length ? 'bad' : '' },
    { v: cons.filter((c) => c[7] === 'Past need-by').length, l: 'Constraints past need-by', tone: cons.some((c) => c[7] === 'Past need-by') ? 'bad' : '' },
  ];
  return { sections, kpis, end };
}

export default function Report() {
  const { data, derived, week, user } = useApp();
  const today = localToday();
  const R = useMemo(() => buildWeekly(data, derived, week, today), [data, derived, week, today]);
  const report = () => {
    const summary = [['Measure', 'Value'], ...R.kpis.map((k) => [k.l, k.v])];
    return {
      title: `${data.project.code} ${data.project.name} · Weekly report`,
      subtitle: `Week of ${fmt(week, 'shortY')} – ${fmt(R.end, 'shortY')} · exported ${fmt(today, 'shortY')}${user?.name && user.role !== 'Visitor' ? ' by ' + user.name : ''}`,
      file: `${data.project.code}_Weekly-report_${week}`,
      sheets: [{ name: 'Summary', rows: summary, widths: [40, 16] },
        ...R.sections.map((s) => ({ name: s.name, note: [s.title, s.note].filter(Boolean).join(' — '), rows: [s.heads, ...(s.rows.length ? s.rows : [[s.empty || 'None']])] }))],
    };
  };
  let last = '';
  return (
    <section className="screen">
      <DateBar weekly />
      <div className="row"><span className="inline">Export this report to email:</span><button type="button" className="btn small" onClick={() => downloadXlsx(report())}>Excel (.xlsx)</button><button type="button" className="btn small" onClick={() => printReport(report())}>Print / PDF</button></div>
      <div className="kpis">{R.kpis.map((k) => <Kpi key={k.l} v={k.v} l={k.l} tone={k.tone} />)}</div>
      {R.sections.map((s) => {
        const head = s.group !== last; last = s.group;
        return (
          <div className="card" key={s.name}>
            {head && <h2>{s.group}</h2>}
            <h3>{s.title}</h3>
            {s.note && <p className="note">{s.note}</p>}
            {s.rows.length ? (
              <div className="tbl-wrap"><table className="tbl"><thead><tr>{s.heads.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{s.rows.map((r, i) => <tr key={i} className={r[0] === 'All trades' ? 'tot' : undefined}>{r.map((c, j) => <td key={j}>{j === 0 && r[0] === 'All trades' ? <b>{c}</b> : c}</td>)}</tr>)}</tbody></table></div>
            ) : <Empty>{s.empty}</Empty>}
          </div>
        );
      })}
    </section>
  );
}
