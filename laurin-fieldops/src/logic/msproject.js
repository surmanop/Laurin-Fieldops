// Reads an MS Project XML export (File › Save As › XML) in the browser.
// .mpp files are read by the server importer (server/importer), which uses MPXJ.
export function parseProjectXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('This file is not valid XML. In MS Project use File › Save As › XML.');
  const g = (el, n) => el.getElementsByTagName(n)[0]?.textContent ?? '';
  const statusDate = g(doc.documentElement, 'StatusDate').slice(0, 10);
  const tasks = [...doc.getElementsByTagName('Task')];
  if (!tasks.length) throw new Error('No tasks found. Is this an MS Project XML file?');
  const stack = []; const out = [];
  tasks.forEach((t) => {
    const lvl = +g(t, 'OutlineLevel') || 0, name = g(t, 'Name').replace(/\s+/g, ' ').trim();
    const summary = g(t, 'Summary') === '1';
    stack.length = Math.max(0, lvl - 1); stack[lvl - 1] = name;
    if (summary || lvl === 0 || !name) return;
    const path = stack.slice(1, lvl - 1).filter(Boolean).join(' › ');
    // PredecessorLink Type: 0 FF, 1 FS, 2 SF, 3 SS. LinkLag is in tenths of a minute: 4800 = one 8-hour working day,
    // 14400 = one elapsed (24-hour) day when LagFormat is an elapsed unit. Elapsed lags are then counted as working days.
    const preds = [...t.getElementsByTagName('PredecessorLink')].map((l) => [+g(l, 'PredecessorUID'), ['FF', 'FS', 'SF', 'SS'][+g(l, 'Type')] || 'FS', Math.round((+g(l, 'LinkLag') || 0) / ([4, 6, 8, 10, 12].includes(+g(l, 'LagFormat')) ? 14400 : 4800))]);
    out.push({ uid: +g(t, 'UID'), name, path, start: g(t, 'Start').slice(0, 10), finish: g(t, 'Finish').slice(0, 10), pct: +g(t, 'PercentComplete') || 0, milestone: g(t, 'Milestone') === '1', critical: g(t, 'Critical') === '1', trade: '', preds });
  });
  return { statusDate, tasks: out };
}

export function diffSchedules(oldRows, newRows) {
  const o = new Map(oldRows.map((a) => [a.uid, a]));
  const n = new Map(newRows.map((a) => [a.uid, a]));
  const added = newRows.filter((a) => !o.has(a.uid));
  const removed = oldRows.filter((a) => !n.has(a.uid));
  const moved = newRows.filter((a) => o.has(a.uid) && (o.get(a.uid).start !== a.start || o.get(a.uid).finish !== a.finish)).map((a) => ({ a, was: o.get(a.uid) }));
  return { added, removed, moved };
}
