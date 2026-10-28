// Live sign-in with Laurin Microsoft 365 accounts (Microsoft Entra ID) through Supabase Auth's Azure provider.
// Setup: README › "Microsoft sign-in". Only people with a membership row for the project get in.
import { supabase } from '../data/supabaseAdapter.js';
export const authMode = 'microsoft';
export async function getUser() { const { data } = await supabase.auth.getSession(); return data.session?.user?.id || null; }
export async function signIn() { await supabase.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'email openid profile', redirectTo: window.location.origin } }); return null; }
export async function signOut() { await supabase.auth.signOut(); }
