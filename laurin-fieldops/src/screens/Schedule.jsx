import React, { useState } from 'react';
import { useApp } from '../store.jsx';
import { Empty } from '../ui/parts.jsx';
import { categorize } from '../logic/mapping.js';
import { diffSchedules, parseProjectXml } from '../logic/msproject.js';
import { fmt, localToday } from '../logic/dates.js';
import { keyMilestones } from '../logic/forecast.js';
import { Status } from '../ui/parts.jsx';

export default function Schedule() {
  const { data, derived, can, api, write } = useApp();
  const [pending, setPending] = useState(null);
  const [clearAdj, setClearAdj] = useState(true);
  const [err, setErr] = useState('');
  const onFile = async (file) => {
    setErr(''); setPending(null);
    if (!file) return;
    if (/\.mpp$/i.test(file.name)) { setErr('.mpp files are read by the server importer in the live app. In this demo, export from MS Project with File › Save As › XML and upload that.'); return; }
    try {
      const { statusDate, tasks } = parseProjectXml(await file.text());
      const rows = tasks.map((t) => ({ ...t, ...categorize(t, data) }));
      setPending({ name: file.name.replace(/\.xml$/i, ''), statusDate, rows, diff: diffSchedules(data.activities, rows) });
    } catch (e) { setErr(e.message); }
  };
  const apply = () => write(() => api.replaceActivities(pending.rows, { name: pending.name, statusDate: pending.statusDate, loaded: localToday(), count: pending.rows.length }, clearAdj), 'Schedule updated').then((ok) => ok && setPending(null));
  const adj = derived.adjustments; const ms = keyMilestones(derived.FC.rows); const pushed = derived.FC.rows.filter((r) => r.shift > 0).sort((a, b) => b.shift - a.shift);
  const cats = (rows) => ['zone', 'areawide', 'unplaced', 'site'].map((c) => rows.filter((a) => a.category === c).length);
  const [z, aw, un, si] = cats(data.activities);

  return (
    <section className="screen">
      <div className="card">
        <h2>Schedule import</h2>
        <p className="note">Current schedule: <b>{data.scheduleVersions[0]?.name}</b>, status date {fmt(data.project.statusDate, 'shortY')}, {data.activities.length} activities ({z} zone-specific, {aw} Area-wide, {un} not placed, {si} site &amp; building-wide).</p>
        {can('import') ? (
          <>
            <ol className="steps">
              <li>In MS Project open the updated schedule and choose <b>File › Save As › XML</b>. (The live app also takes the .mpp file directly.)</li>
              <li>Upload it here. Nothing changes until you review the differences and select <b>Apply update</b>.</li>
              <li>Each activity is placed in zones by the rules below. Field logs, commitments and constraints are kept.</li>
            </ol>
            <input type="file" accept=".xml,.mpp" onChange={(e) => onFile(e.target.files[0])} aria-label="Schedule file" />
            {err && <p className="msg bad">{err}</p>}
          </>
        ) : <p className="note">Only owners can load a schedule update.</p>}
      </div>
      {pending && (
        <div className="card">
          <h2>Review: {pending.name}</h2>
          <p className="note">Status date {fmt(pending.statusDate, 'shortY')} · {pending.rows.length} activities · {pending.diff.added.length} added · {pending.diff.removed.length} removed · {pending.diff.moved.length} with new dates.</p>
          {pending.diff.moved.length > 0 && <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Activity</th><th>Was</th><th>Now</th></tr></thead>
            <tbody>{pending.diff.moved.slice(0, 60).map(({ a, was }) => <tr key={a.uid}><td>{a.name}<small className="sub">{a.path}</small></td><td>{fmt(was.start)} – {fmt(was.finish)}</td><td>{fmt(a.start)} – {fmt(a.finish)}</td></tr>)}</tbody></table></div>}
          {adj.length > 0 && <label className="inline"><input type="checkbox" checked={clearAdj} onChange={(e) => setClearAdj(e.target.checked)} /> Clear the {adj.length} schedule change{adj.length === 1 ? '' : 's'} pushed since the last update (the new schedule should already include them)</label>}
          <div className="row"><button type="button" className="btn primary" onClick={apply}>Apply update</button><button type="button" className="btn" onClick={() => setPending(null)}>Cancel</button></div>
        </div>
      )}
      <div className="card" id="changes">
        <h2>Schedule changes since the last update</h2>
        <p className="note">Work marked “Not happening” pushes the activity and everything that depends on it through the schedule's own logic links (finish-to-start, start-to-start, finish-to-finish, with lags). Successors with slack absorb the push. Remove a change to undo it.</p>
        <div className="kpis">
          {ms.map((m) => <div key={m.uid} className={'kpi' + (m.shift ? ' bad' : '')}><div className="kv">{fmt(m.finish, 'shortY')}</div><div className="kl">{m.name}{m.shift ? ` · was ${fmt(m.baseFinish, 'shortY')} (+${m.shift} working days)` : ' · on baseline'}</div></div>)}
          <div className="kpi mute"><div className="kv">{pushed.length}</div><div className="kl">Activities pushed</div></div>
          {derived.TP && <div className={'kpi' + (derived.TP.slipEnd > 0 ? ' bad' : ' mute')}><div className="kv">{fmt(derived.TP.forecastEnd, 'shortY')}</div><div className="kl">Takt train finish{derived.TP.slipEnd > 0 ? ` (+${derived.TP.slipEnd})` : ''}</div></div>}
        </div>
        {adj.length ? (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Activity</th><th>Pushed</th><th>Reason</th><th>Note</th><th>By</th><th>When</th><th /></tr></thead>
            <tbody>{adj.map((x) => (
              <tr key={x.id}><td>{x.name}<small className="sub">{typeof x.target === 'string' ? 'Takt plan' : x.path}</small></td><td>+{x.days} working day{x.days === 1 ? '' : 's'}</td><td>{x.reason}</td><td>{x.note}</td>
                <td>{data.users.find((u) => u.id === x.by)?.name || ''}</td><td>{fmt(x.at.slice(0, 10), 'shortY')}</td>
                <td>{can('plan') && <button type="button" className="link" onClick={() => write(() => api.deleteRecord('adjustments', x.id), 'Change removed')}>Remove</button>}</td></tr>))}</tbody></table></div>
        ) : <p className="empty">No changes yet. Owners can mark any scheduled item “Not happening” from Day, Weekly plan, 6-week lookahead, Takt plan or 3D zones.</p>}
        {pushed.length > 0 && <details className="bucket"><summary>All {pushed.length} pushed activities</summary>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Activity</th><th>Baseline</th><th>Forecast</th><th>Push</th></tr></thead>
            <tbody>{pushed.map((r) => <tr key={r.uid}><td>{r.name}<small className="sub">{r.path}</small></td><td>{fmt(r.baseStart)} – {fmt(r.baseFinish, 'shortY')}</td><td>{fmt(r.start)} – {fmt(r.finish, 'shortY')}</td><td>+{r.shift}</td></tr>)}</tbody></table></div></details>}
      </div>
      <div className="card">
        <h2>Zone placement rules</h2>
        <p className="note">An activity whose schedule group (and name, where given) matches a rule goes to those zones. Main-floor interior Area groups go to every zone in that Area. Everything else is “not placed” or site-wide.</p>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Schedule group</th><th>Name contains</th><th>Zones</th><th>Why</th></tr></thead>
          <tbody>{data.zoneRules.map((r, i) => <tr key={i}><td>{r.group}</td><td>{r.name ? r.name.split('|').join(' / ') : 'any'}</td><td>{r.zones.join(', ')}</td><td>{r.basis}</td></tr>)}</tbody></table></div>
      </div>
      <div className="card">
        <h2>Versions loaded</h2>
        {data.scheduleVersions.length ? <ul className="plain">{data.scheduleVersions.map((v, i) => <li key={i}>{v.name} · status date {fmt(v.statusDate, 'shortY')} · {v.count} activities · loaded {fmt(v.loaded, 'shortY')}</li>)}</ul> : <Empty>None yet.</Empty>}
      </div>
    </section>
  );
}
