import React, { useState } from 'react';
import { useApp } from '../store.jsx';
import { Empty, Kpi } from '../ui/parts.jsx';
import { PushImpact, pushTarget, usePushPreview } from '../ui/adjust.jsx';
import { fmt } from '../logic/dates.js';

// Extension requests from trade foremen. Owners and Supers approve (the finish moves and everything after it
// follows through the schedule logic) or reject. Foremen see their own requests here and can withdraw a pending one.
export default function Extensions() {
  const { data, derived, can, foreman, user } = useApp();
  const all = data.extRequests || [];
  const approver = can('approve');
  const list = approver ? all : all.filter((x) => x.requestedBy === user.id);
  const pending = list.filter((x) => x.status === 'Pending');
  const done = list.filter((x) => x.status !== 'Pending').slice(0, 40);
  const itemOf = (r) => derived.items.find((a) => String(pushTarget(a)) === String(r.target));
  const who = (id) => data.users.find((u) => u.id === id)?.name || '';
  return (
    <section className="screen">
      <div className="kpis">
        <Kpi v={pending.length} l={approver ? 'Waiting for your decision' : 'Your requests waiting'} tone={pending.length ? 'bad' : ''} />
        <Kpi v={list.filter((x) => x.status === 'Approved').length} l="Approved" tone="mute" />
        <Kpi v={list.filter((x) => x.status === 'Rejected').length} l="Rejected" tone="mute" />
      </div>
      <div className="card">
        <h2>Waiting for approval</h2>
        <p className="note">{approver
          ? 'Trade foremen asked for more time on these tasks. Approve to move the finish (and everything that follows it through the schedule logic), or reject to keep the schedule as is.'
          : 'Extensions you asked for. The schedule moves only when an owner or super approves.'}</p>
        {pending.length ? <ul className="plain ext-list">{pending.map((r) => <Request key={r.id} r={r} a={itemOf(r)} who={who} approver={approver} mine={foreman && r.requestedBy === user.id} />)}</ul>
          : <Empty>Nothing waiting.</Empty>}
      </div>
      <div className="card">
        <h2>Decided</h2>
        {done.length ? (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Task</th><th>Asked by</th><th>Extension</th><th>Reason</th><th>Decision</th></tr></thead>
            <tbody>{done.map((r) => (
              <tr key={r.id}><td>{r.name}<small className="sub">{r.trade}</small></td><td>{who(r.requestedBy)}<small className="sub">{fmt((r.requestedAt || '').slice(0, 10))}</small></td>
                <td>+{r.days} working day{r.days === 1 ? '' : 's'}{r.fromFinish ? <small className="sub">{fmt(r.fromFinish)} → {fmt(r.newFinish, 'shortY')}</small> : null}</td>
                <td>{r.reason}{r.note ? <small className="sub">{r.note}</small> : null}</td>
                <td><span className={'tag ' + (r.status === 'Approved' ? 'ok' : 'bad')}>{r.status}</span> {who(r.decidedBy)} {r.decidedAt ? fmt(r.decidedAt.slice(0, 10)) : ''}{r.decisionNote ? <small className="sub">{r.decisionNote}</small> : null}</td></tr>))}</tbody></table></div>
        ) : <Empty>No decisions yet.</Empty>}
      </div>
    </section>
  );
}

function Request({ r, a, who, approver, mine }) {
  const { api, write } = useApp();
  const [note, setNote] = useState('');
  const [show, setShow] = useState(false);
  const preview = usePushPreview(show && a ? a : null, r.days, true);
  const decide = (ok) => write(() => api.decideExtension(r.id, ok, note.trim()), ok ? `${r.name}: extension approved, schedule updated` : `${r.name}: extension rejected`);
  return (
    <li className="ext-req">
      <div><b>{r.name}</b> <span className="tag warn">+{r.days} working day{r.days === 1 ? '' : 's'}</span></div>
      <div className="sub">{r.path}{r.trade ? ` · ${r.trade}` : ''}</div>
      <div>Asked by {who(r.requestedBy) || 'a foreman'} on {fmt((r.requestedAt || '').slice(0, 10), 'shortY')}: completion {r.fromFinish ? fmt(r.fromFinish, 'shortY') : '—'} → <b>{r.newFinish ? fmt(r.newFinish, 'shortY') : '—'}</b>
        {a && r.fromFinish && a.finish !== r.fromFinish ? <span className="bad"> (finish is now {fmt(a.finish, 'shortY')}; approving adds {r.days} more working day{r.days === 1 ? '' : 's'} to that)</span> : null}</div>
      <div>Reason: {r.reason}{r.note ? ` — ${r.note}` : ''}</div>
      {!a && <div className="bad">This task is no longer in the schedule (a newer schedule was imported). Approving still records the extension, but nothing will move.</div>}
      {approver && (
        <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {a && <button type="button" className="btn small" onClick={() => setShow(!show)}>{show ? 'Hide impact' : 'What approving does'}</button>}
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Note to the foreman (optional)" aria-label="Decision note" style={{ minWidth: 220 }} />
          <button type="button" className="btn small okb" onClick={() => decide(true)}>Approve</button>
          <button type="button" className="btn small warnb" onClick={() => decide(false)}>Reject</button>
        </div>
      )}
      {mine && <div className="row" style={{ marginTop: 6 }}><button type="button" className="link" onClick={() => write(() => api.withdrawExtension(r.id), 'Request withdrawn')}>Withdraw request</button></div>}
      {show && a && <PushImpact a={a} n={r.days} preview={preview} ext />}
    </li>
  );
}
