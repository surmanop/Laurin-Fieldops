// Live sign-in through Supabase Auth. Signing in is only needed to edit; anyone can view the project.
//   1. Email + password: the everyday way in, once a password is set.
//   2. Email link: first time, or forgot password. Supabase emails a one-time link; the app then offers to set a password.
//   3. Microsoft (Laurin M365 / Entra ID) through Supabase's Azure provider. Off until VITE_MS_SIGNIN=true in Vercel.
// What a signed-in person can change is set by their membership row (Setup › People and roles).
import { supabase } from '../data/supabaseAdapter.js';
export const authMode = 'microsoft'; // "live" sign-in; the name is kept so the rest of the app is unchanged
export const microsoftEnabled = import.meta.env.VITE_MS_SIGNIN === 'true';
export const publicView = true; // visitors can view without signing in
const session = async () => (await supabase.auth.getSession()).data.session;
export async function getUser() { return (await session())?.user?.id || null; }
export async function getEmail() { return (await session())?.user?.email || ''; }
export async function hasPassword() { return !!(await session())?.user?.user_metadata?.has_password; }
export async function isTempPassword() { return !!(await session())?.user?.user_metadata?.temp_password; }
export async function signIn() { await supabase.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'email openid profile', redirectTo: window.location.origin } }); return null; }
export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password. First time, or no password yet? Use the emailed link below.' : error.message);
  return data.user.id;
}
export async function sendEmailLink(email) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: true } });
  if (error) throw new Error(/rate limit/i.test(error.message) ? 'Too many sign-in emails were sent in the last hour. Please try again later.' : error.message);
}
export async function setPassword(password) {
  const { error } = await supabase.auth.updateUser({ password, data: { has_password: true, temp_password: false } });
  if (error) throw new Error(error.message);
  await supabase.auth.refreshSession(); // new token without the temporary-password flag, so editing rights apply again
}
export async function signOut() { await supabase.auth.signOut(); }
