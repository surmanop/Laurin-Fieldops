// Microsoft 365 sign-in (Entra ID) with MSAL. The signed-in person's own SharePoint permissions apply:
// they see and change only what their access to the Field Operations site allows.
// Setup: README › "SharePoint version". Entra app: "Laurin Field Ops (SharePoint)", single-page app.
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';

export const authMode = 'microsoft';
export const microsoftEnabled = true;
export const sharepoint = true;
export const SCOPES = ['https://graph.microsoft.com/Sites.ReadWrite.All', 'https://graph.microsoft.com/User.Read'];

const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })(); // Teams website tab
const msal = new PublicClientApplication({
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: 'localStorage' },
});
const ready = msal.initialize().then(() => msal.handleRedirectPromise()).then((r) => { if (r?.account) msal.setActiveAccount(r.account); }).catch(() => {});

const account = () => msal.getActiveAccount() || msal.getAllAccounts()[0] || null;

export async function getUser() {
  await ready;
  const a = account();
  if (a) msal.setActiveAccount(a);
  return a ? a.username.toLowerCase() : null;
}
export async function getName() { await ready; return account()?.name || ''; }

export async function signIn() {
  await ready;
  if (inFrame) {
    const r = await msal.loginPopup({ scopes: SCOPES, prompt: 'select_account' });
    msal.setActiveAccount(r.account);
    return r.account.username.toLowerCase();
  }
  await msal.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
  return null;
}

export async function getToken() {
  await ready;
  const a = account();
  if (!a) throw new Error('Not signed in');
  try {
    return (await msal.acquireTokenSilent({ scopes: SCOPES, account: a })).accessToken;
  } catch (e) {
    if (!(e instanceof InteractionRequiredAuthError)) throw e;
    if (inFrame) return (await msal.acquireTokenPopup({ scopes: SCOPES, account: a })).accessToken;
    await msal.acquireTokenRedirect({ scopes: SCOPES, account: a });
    throw new Error('Redirecting to sign in');
  }
}

export async function signOut() {
  await ready;
  const a = account();
  if (!a) return;
  if (inFrame) await msal.logoutPopup({ account: a }); else await msal.logoutRedirect({ account: a });
}
