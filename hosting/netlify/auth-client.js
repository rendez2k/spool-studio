'use strict';
window.addEventListener('load', async () => {
  const status = document.getElementById('auth-status');
  const requested = new URLSearchParams(location.search).get('return_to');
  const destination = (['/', '/index.html', '/nfc.html', '/import.html', '/app.html', '/reels.html'].includes(requested) || /^\/reels\.html#r=[a-f0-9-]{36}$/.test(requested || '')) ? requested : '/';
  try {
    if (!window.Clerk || !window.__internal_ClerkUICtor) throw Error('Sign-in could not load. Check your connection and refresh.');
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
    if (location.pathname === '/sign-out') {
      if (!window.Clerk.user) { location.replace('/'); return; }
      status.textContent = 'Sign out of Spool Studio on this device?';
      const button = document.getElementById('sign-out');
      button.hidden = false;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await window.Clerk.signOut({ redirectUrl: '/' }); }
        catch { button.disabled = false; status.textContent = 'Could not sign out. Please try again.'; }
      });
    } else if (location.pathname === '/sign-in') {
      if (window.Clerk.user) { location.replace(destination); return; }
      status.textContent = '';
      window.Clerk.mountSignIn(document.getElementById('sign-in'), { routing: 'hash', forceRedirectUrl: destination, signUpForceRedirectUrl: destination });
    } else {
      const initial = window.Clerk.user?.id || '';
      const account = document.getElementById('auth-account');
      if (account && JSON.parse(account.textContent).userId !== initial) { location.reload(); return; }
      window.Clerk.addListener(({ user }) => { if ((user?.id || '') !== initial) location.reload(); }); if (status) status.textContent = initial ? 'Signed in to Spool Studio on this device.' : 'Sign in to sync your private library and phone batch.'; const accountLink = document.getElementById('app-account-link'); if (accountLink) { accountLink.href = initial ? '/sign-out' : '/sign-in?return_to=%2Fapp.html'; accountLink.textContent = initial ? 'Sign out of this device' : 'Sign in or create an account'; }
    }
  } catch (error) {
    if (status) status.textContent = error.message;
  }
});
