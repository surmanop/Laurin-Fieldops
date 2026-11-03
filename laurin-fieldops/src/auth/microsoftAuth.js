// Live sign-in through Supabase Auth. Two ways in:
//   1. Email link (on by default): Supabase emails a one-time sign-in link. No Microsoft account needed.
//   2. Microsoft (Laurin M365 / Entra ID) through Supabase's Azure provider. Off until VITE_MS_SIGNIN=true in Vercel.
// Setup: README › "Sign-in". Only people with a membership row for the project can see any data.
import { supabase } from '../data/supabaseAdapter.js';
export const authMode = 'microsoft'; // "live" sign-in; the name is kept so the rest of the app is unchanged
export const microsoftEnabled = import.meta.env.VITE_MS_SIGNIN === 'true';
export async function getUser() { const { data } = await supabase.auth.getSession(); return data.session?.user?.id || null; }
export async function signIn() { await supabase.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'email openid profile', redirectTo: window.location.origin } }); return null; }
export async function sendEmailLink(email) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: true } });
  if (error) throw new Error(error.message);
}
export async function signOut() { await supabase.auth.signOut(); }
