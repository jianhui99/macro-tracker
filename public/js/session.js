let account = null;
let csrf = '';
let leaving = false;

function setSession(data) { account = data.account; csrf = data.csrf || ''; }
function authHeaders() { return account ? { 'X-Account-Id': account.id, 'X-CSRF-Token': csrf } : {}; }
function expireSession() {
    if (leaving) return;
    leaving = true;
    account = null; csrf = '';
    document.body.hidden = true;
    location.replace('/login.html');
}
async function loadSession() {
    const response = await fetch('/api/auth/me', { cache: 'no-store' });
    if (!response.ok) throw new Error('session_failed');
    const data = await response.json();
    setSession(data);
    if (account) {
        try { localStorage.setItem('macro_tracker_account', account.id); localStorage.removeItem('macro_tracker_api_key'); } catch { /* storage unavailable */ }
    }
    return data;
}
function initSession() {
    window.addEventListener('storage', event => {
        if (event.key === 'macro_tracker_account' && event.newValue !== account?.id) expireSession();
    });
    window.addEventListener('focus', async () => {
        if (!account) return;
        try {
            const response = await fetch('/api/auth/me', { cache: 'no-store' });
            if (!response.ok) return;
            const data = await response.json();
            if (data.account?.id !== account.id || data.csrf !== csrf) expireSession();
        } catch { /* An offline tab keeps its current state until the next request. */ }
    });
}
export { account, setSession, authHeaders, loadSession, expireSession, initSession };
