// Demo sign-in: pick a role to see what each person can do. The live app uses Microsoft sign-in (microsoftAuth.js).
let current = null;
export const authMode = 'demo';
export async function getUser() { try { const id = sessionStorage.getItem('lfo-user'); if (id) current = id; } catch (e) { /* ignore */ } return current; }
export async function signIn(userId) { current = userId; try { sessionStorage.setItem('lfo-user', userId); } catch (e) { /* ignore */ } return current; }
export async function signOut() { current = null; try { sessionStorage.removeItem('lfo-user'); } catch (e) { /* ignore */ } }
