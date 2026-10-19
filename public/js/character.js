import { api } from './api.js';
import { loadSession, initSession, expireSession } from './session.js';
import { startI18n, toggleLang } from './i18n.js';
import { withBusy } from './ui.js';

startI18n();
document.getElementById('lang-toggle').addEventListener('click', toggleLang);
const form = document.getElementById('character-form');
let timer, saving = Promise.resolve();
function draft() { return Object.fromEntries(new FormData(form)); }
function saveDraft() {
    clearTimeout(timer);
    const body = draft();
    saving = saving.catch(() => {}).then(async () => {
        await api('/api/profile', 'PUT', body);
        document.getElementById('draft-status').textContent = '草稿已保存';
    });
    return saving;
}
async function start() {
    const data = await loadSession();
    if (!data.account) return expireSession();
    if (data.account.onboarded) return location.replace('/');
    initSession();
    for (const [key, value] of Object.entries(data.draft)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value ?? '';
    document.body.removeAttribute('data-auth-loading');
    form.addEventListener('input', () => {
        clearTimeout(timer);
        document.getElementById('draft-status').textContent = '正在保存草稿';
        timer = setTimeout(() => saveDraft().catch(() => { document.getElementById('draft-status').textContent = '草稿未保存，请检查网络'; }), 800);
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        withBusy(event.submitter, async () => {
            clearTimeout(timer);
            await saving.catch(() => {});
            const body = draft();
            for (const key of ['height', 'weight', 'age', 'activity', 'targetWeight', 'waterTarget']) body[key] = body[key] === '' ? null : Number(body[key]);
            await api('/api/profile/complete', 'POST', body);
            location.replace('/');
        }).catch(() => {});
    });
    document.getElementById('leave-character').addEventListener('click', event => withBusy(event.currentTarget, async () => {
        await saveDraft();
        await api('/api/auth/logout', 'POST');
        try { localStorage.setItem('macro_tracker_account', ''); } catch { /* storage unavailable */ }
        expireSession();
    }).catch(() => {}));
}
start().catch(() => { location.replace('/login.html?error=login_failed'); });
