import { renderHeroes } from './skins.js';
import { api } from './api.js';
import { account, expireSession } from './session.js';
import { showToast, withBusy } from './ui.js';
import { $ } from './helpers.js';

function initAccount() {
    $('account-nickname').value = account.nickname;
    $('account-username').textContent = account.username || '';
    $('admin-link').hidden = account.role !== 'admin';
    $('account-form').addEventListener('submit', event => {
        event.preventDefault();
        withBusy($('save-nickname'), async () => {
            const nickname = $('account-nickname').value.trim();
            await api('/api/profile', 'PUT', { nickname });
            account.nickname = nickname;
            renderHeroes();
            showToast('角色昵称已保存');
        }).catch(() => {});
    });
    $('logout').addEventListener('click', () => withBusy($('logout'), async () => {
        await api('/api/auth/logout', 'POST');
        try { localStorage.setItem('macro_tracker_account', ''); } catch { /* storage unavailable */ }
        expireSession();
    }).catch(() => {}));
    $('password-form').addEventListener('submit', event => {
        event.preventDefault();
        withBusy($('change-password'), async () => {
            await api('/api/auth/password', 'POST', Object.fromEntries(new FormData(event.target)));
            event.target.reset();
            showToast('密码已修改，其他设备已退出');
        }).catch(() => {});
    });
}
export { initAccount };
