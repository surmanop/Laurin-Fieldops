// Dates are handled as ISO strings (YYYY-MM-DD) in UTC so a day never shifts with the browser's time zone.
export const iso = (d) => d.toISOString().slice(0, 10);
export const parse = (s) => new Date(s + 'T00:00:00Z');
export const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const mondayOf = (s) => { const d = parse(s); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); };
export const localToday = () => { const n = new Date(); return iso(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))); };
const f = (o) => new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', ...o });
const F = { short: f({ month: 'short', day: 'numeric' }), shortY: f({ month: 'short', day: 'numeric', year: 'numeric' }), long: f({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), wk: f({ weekday: 'short', month: 'short', day: 'numeric' }), my: f({ month: 'short', year: '2-digit' }) };
export const fmt = (s, k = 'short') => (s ? F[k].format(parse(s)) : '—');
export const shutdownOn = (day, calendar) => calendar.find((c) => day >= c.from && day <= c.to) || null;
export const isWorking = (day, calendar) => { const w = parse(day).getUTCDay(); return w !== 0 && w !== 6 && !shutdownOn(day, calendar); };
export const offReason = (day, calendar) => { const s = shutdownOn(day, calendar); if (s) return s.name; const w = parse(day).getUTCDay(); return w === 0 || w === 6 ? 'Weekend' : ''; };
export const stepWorking = (day, dir, calendar) => { let d = day; for (let i = 0; i < 30; i++) { d = addDays(d, dir); if (isWorking(d, calendar)) return d; } return d; };
export const weekDays = (mon) => [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
