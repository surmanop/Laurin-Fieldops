import { addDays, isWorking } from './dates.js';

// Pushes schedule changes through the MS Project logic links.
//
// Each activity keeps its baseline dates from the imported schedule. A "not happening" adjustment adds
// working days to that activity. Every successor moves by however much of that push its slack can't absorb:
//   FS: slack = working days between (predecessor finish + lag) and successor start
//   SS: slack = working days between (predecessor start + lag) and successor start
//   FF: slack = working days between (predecessor finish + lag) and successor finish
// An activity's shift = its own adjustments + the largest push from any predecessor. The whole bar moves
// (duration unchanged). Links that were already broken in the imported schedule count as zero slack.
export function makeWorkdays(calendar, from, to) {
  const list = []; const index = new Map();
  for (let d = from; d <= to; d = addDays(d, 1)) { if (isWorking(d, calendar)) { index.set(d, list.length); list.push(d); } }
  // index of the first working day on or after d
  const idx = (d) => { if (index.has(d)) return index.get(d); let x = d; for (let i = 0; i < 15; i++) { x = addDays(x, 1); if (index.has(x)) return index.get(x); } return d < from ? 0 : list.length - 1; };
  const at = (i) => list[Math.max(0, Math.min(list.length - 1, i))];
  return { idx, at, list };
}

export function forecastSchedule(activities, adjustments, calendar) {
  if (!activities.length) return { rows: activities, moved: 0 };
  let lo = activities[0].start, hi = activities[0].finish;
  activities.forEach((a) => { if (a.start < lo) lo = a.start; if (a.finish > hi) hi = a.finish; });
  const W = makeWorkdays(calendar, addDays(lo, -30), addDays(hi, 900));
  const own = new Map();
  adjustments.filter((x) => typeof x.target === 'number').forEach((x) => own.set(x.target, (own.get(x.target) || 0) + (+x.days || 0)));
  const byUid = new Map(activities.map((a) => [a.uid, a]));
  const shift = new Map(); const visiting = new Set();
  const get = (a) => {
    if (shift.has(a.uid)) return shift.get(a.uid);
    if (visiting.has(a.uid)) return 0; // a loop in the links: ignore rather than hang
    visiting.add(a.uid);
    let push = 0;
    (a.preds || []).forEach(([pu, type, lag]) => {
      const p = byUid.get(pu); if (!p) return;
      const sp = get(p); if (sp <= 0) return;
      let slack;
      if (type === 'SS') slack = W.idx(a.start) - (W.idx(p.start) + lag);
      else if (type === 'FF') slack = W.idx(a.finish) - (W.idx(p.finish) + lag);
      else slack = W.idx(a.start) - (W.idx(p.finish) + 1 + lag);
      push = Math.max(push, sp - Math.max(0, slack));
    });
    visiting.delete(a.uid);
    const s = Math.max(0, push) + (own.get(a.uid) || 0);
    shift.set(a.uid, s);
    return s;
  };
  let moved = 0;
  const rows = activities.map((a) => {
    const s = get(a);
    if (!s) return { ...a, baseStart: a.start, baseFinish: a.finish, shift: 0 };
    moved++;
    return { ...a, baseStart: a.start, baseFinish: a.finish, shift: s, start: W.at(W.idx(a.start) + s), finish: W.at(W.idx(a.finish) + s) };
  });
  return { rows, moved };
}

export const keyMilestones = (rows) => rows.filter((a) => /substantial completion|^occupancy$/i.test(a.name));
