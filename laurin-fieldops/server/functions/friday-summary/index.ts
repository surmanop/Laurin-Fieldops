// Supabase Edge Function: emails the week's PPC, misses by reason and constraints coming due.
// Schedule it for Fridays 15:00 Calgary time (README › "Friday email").
// Sends through Microsoft Graph from a Laurin mailbox; needs an Entra app with Mail.Send (application) and admin consent.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

const iso = (d: Date) => d.toISOString().slice(0, 10);
function mondayOf(d: Date) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; }

async function graphToken() {
  const r = await fetch(`https://login.microsoftonline.com/${env('MS_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({ client_id: env('MS_CLIENT_ID'), client_secret: env('MS_CLIENT_SECRET'), scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  if (!r.ok) throw new Error('Microsoft token request failed: ' + (await r.text()));
  return (await r.json()).access_token as string;
}

Deno.serve(async () => {
  const project = env('PROJECT') || 'WCHS';
  const week = iso(mondayOf(new Date()));
  const in7 = iso(new Date(Date.now() + 7 * 86400000));
  const { data: cm } = await db.from('commitments').select('*').eq('project', project).eq('week', week);
  const { data: cons } = await db.from('constraints').select('*').eq('project', project).eq('status', 'Open').lte('need_by', in7).order('need_by');
  const done = (cm ?? []).filter((c) => c.status === 'Complete').length;
  const total = (cm ?? []).length;
  const misses = (cm ?? []).filter((c) => c.status === 'Not complete');
  const reasons = Object.entries(misses.reduce((m: Record<string, number>, c) => ({ ...m, [c.reason || 'No reason given']: (m[c.reason || 'No reason given'] || 0) + 1 }), {}));
  const html = `<h2>${project} weekly summary, week of ${week}</h2>
<p><b>PPC ${total ? Math.round((100 * done) / total) + '%' : '—'}</b> (${done} of ${total} commitments complete${total - done - misses.length ? `, ${total - done - misses.length} still open` : ''}).</p>
${reasons.length ? `<p>Misses by reason:</p><ul>${reasons.map(([r, n]) => `<li>${r}: ${n}</li>`).join('')}</ul>` : '<p>No misses recorded.</p>'}
<p>Open constraints due by ${in7}: ${(cons ?? []).length}</p>
${(cons ?? []).length ? `<ul>${(cons ?? []).map((c) => `<li>${c.need_by} · ${c.zone} · ${c.type}: ${c.what}${c.responsible ? ' (' + c.responsible + ')' : ''}</li>`).join('')}</ul>` : ''}`;
  const token = await graphToken();
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${env('MS_SENDER')}/sendMail`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { subject: `${project} PPC and constraints, week of ${week}`, body: { contentType: 'HTML', content: html }, toRecipients: env('MS_RECIPIENTS').split(',').filter(Boolean).map((a) => ({ emailAddress: { address: a.trim() } })) }, saveToSentItems: true }),
  });
  if (!r.ok) return new Response('Send failed: ' + (await r.text()), { status: 500 });
  return new Response(`Sent: PPC ${done}/${total}, ${(cons ?? []).length} constraints due`);
});
