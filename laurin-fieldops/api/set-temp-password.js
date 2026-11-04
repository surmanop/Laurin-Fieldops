// Owner-only: give a person a temporary password, no email needed.
// Creates the account if it doesn't exist (confirmed), or resets the password if it does,
// and adds or updates their project membership. The person sets their own password at next sign-in.
// Needs SUPABASE_SERVICE_ROLE_KEY in Vercel (Settings › Environment Variables). Never sent to the browser.
import { createClient } from '@supabase/supabase-js';

const ROLES = ['Owner', 'Super', 'Viewer'];
const json = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
const readBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = ''; for await (const c of req) { raw += c; if (raw.length > 10000) throw new Error('Too large'); }
  return raw ? JSON.parse(raw) : {};
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(res, 500, { error: 'Not set up yet: add SUPABASE_SERVICE_ROLE_KEY in Vercel, then redeploy.' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Who is asking? Must be signed in and an Owner of the project.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(res, 401, { error: 'Sign in first.' });
  const { data: me, error: meErr } = await admin.auth.getUser(token);
  if (meErr || !me?.user) return json(res, 401, { error: 'Your sign-in has expired. Sign in again.' });

  let b; try { b = await readBody(req); } catch (e) { return json(res, 400, { error: 'Bad request' }); }
  const project = String(b.project || process.env.VITE_PROJECT || 'WCHS');
  const { data: mine } = await admin.from('memberships').select('role').eq('project', project).eq('user_id', me.user.id).maybeSingle();
  if (mine?.role !== 'Owner') return json(res, 403, { error: 'Only an owner can set passwords.' });

  const password = String(b.password || '');
  if (password.length < 8 || password.length > 72) return json(res, 400, { error: 'Temporary password must be 8 to 72 characters.' });
  const role = b.role == null ? null : String(b.role);
  if (role && !ROLES.includes(role)) return json(res, 400, { error: 'Role must be Owner, Super or Viewer.' });
  const name = String(b.name || '').trim().slice(0, 100);

  // Find the person: by account id (existing member) or by email.
  let user = null;
  if (b.userId) {
    const { data, error } = await admin.auth.admin.getUserById(String(b.userId));
    if (error || !data?.user) return json(res, 404, { error: 'No such account.' });
    user = data.user;
    const { data: m } = await admin.from('memberships').select('role').eq('project', project).eq('user_id', user.id).maybeSingle();
    if (!m) return json(res, 404, { error: 'That person is not on this project.' });
  } else {
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: 'That is not an email address.' });
    for (let page = 1; page <= 20 && !user; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return json(res, 500, { error: error.message });
      user = data.users.find((u) => (u.email || '').toLowerCase() === email) || null;
      if (data.users.length < 200) break;
    }
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { has_password: false, temp_password: true } });
      if (error) return json(res, 400, { error: error.message });
      user = data.user; // the claim_invites trigger turns any waiting invite into a membership
    }
  }
  if (user.id === me.user.id) return json(res, 400, { error: 'Use the Password link in the header to change your own password.' });

  const { error: upErr } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true, user_metadata: { ...(user.user_metadata || {}), has_password: false, temp_password: true } });
  if (upErr) return json(res, 400, { error: upErr.message });

  // Membership: role given here wins; otherwise keep theirs (or the invite's); default Viewer.
  const { data: inv } = await admin.from('invites').select('role, display_name').eq('project', project).eq('email', (user.email || '').toLowerCase()).maybeSingle();
  const { data: cur } = await admin.from('memberships').select('role, display_name').eq('project', project).eq('user_id', user.id).maybeSingle();
  const finalRole = role || cur?.role || inv?.role || 'Viewer';
  const finalName = name || cur?.display_name || inv?.display_name || user.email;
  const { error: mErr } = await admin.from('memberships').upsert({ project, user_id: user.id, display_name: finalName, role: finalRole });
  if (mErr) return json(res, 500, { error: mErr.message });
  await admin.from('invites').delete().eq('project', project).eq('email', (user.email || '').toLowerCase());
  return json(res, 200, { ok: true, email: user.email, role: finalRole });
}
