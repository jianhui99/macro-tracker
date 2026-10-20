import { api, errorMessage } from './api.js';
import { loadSession, initSession, account } from './session.js';
import { startI18n, toggleLang, lookup, lang } from './i18n.js';
import { startPixelIcons } from './pixel-icons.js';
import { showConfirm, showToast, withBusy } from './ui.js';
import { $, esc } from './helpers.js';
import { RULE_LABELS, ruleBounds } from './rules.js';

startI18n();
startPixelIcons();
$('lang-toggle').addEventListener('click', toggleLang);
const stage = document.body.dataset.adminStage;
let current;
const actions = { invite_created: '生成邀请链接', invite_disabled: '停用邀请码', user_disabled: '停用用户', user_enabled: '恢复用户', password_reset_requested: '请求密码重置', rules_updated: '修改奖励规则' };

async function refresh() {
    current = await api('/api/admin/state');
    $('user-list').innerHTML = current.users.map(user => `<div class="admin-row"><b translate="no">${esc(user.nickname || user.username || user.id)}</b> <span>${user.role === 'admin' ? '管理员' : user.disabled ? '已停用' : '正常'}</span>
        <small translate="no">${esc(user.username || '-')} · ${esc(user.id)}</small><div class="auth-actions">${user.role === 'admin' ? '' : `<button class="btn btn-ghost" data-user="${esc(user.id)}" data-disabled="${!user.disabled}">${user.disabled ? '恢复用户' : '停用用户'}</button>`}
        ${user.id === account.id ? '' : `<button class="btn btn-ghost" data-reset="${esc(user.id)}">重置为临时密码</button>`}</div></div>`).join('');
    $('invite-list').innerHTML = current.invites.map(invite => `<div class="admin-row"><small translate="no">${esc(invite.code_hash.slice(0, 12))}</small> <span>已使用 ${invite.uses} / ${invite.max_uses}</span>
        ${invite.disabled ? '<span>已停用</span>' : `<button class="btn btn-ghost" data-invite="${esc(invite.code_hash)}">停用邀请码</button>`}</div>`).join('');
    $('rule-fields').innerHTML = Object.entries(RULE_LABELS).map(([key, label]) => {
        const [min, max] = ruleBounds(key);
        return `<label class="field"><span>${label}</span><input class="input" name="${key}" type="number" required min="${min}" max="${max}" step="1" value="${current.rules[key]}"></label>`;
    }).join('');
    $('audit-list').innerHTML = current.logs.map(log => `<div class="admin-row"><span>${actions[log.action] || esc(log.action)}</span> <time>${new Date(log.created_at * 1000).toISOString()}</time>
        <small translate="no">${esc(log.actor)} / ${esc(log.target)}</small><pre translate="no">${esc(log.details)}</pre></div>`).join('');
}

async function start() {
    if (stage === 'gate') {
        $('gate-form').addEventListener('submit', event => {
            event.preventDefault();
            withBusy(event.submitter, async () => { await api('/api/auth/gate', 'POST', { key: $('gate-key').value }); location.reload(); }).catch(() => {});
        });
        return;
    }
    if (stage === 'login') {
        $('admin-login').addEventListener('submit', event => {
            event.preventDefault();
            const body = { ...Object.fromEntries(new FormData(event.target)), admin: true };
            withBusy(event.submitter, async () => { await api('/api/auth/login', 'POST', body); location.reload(); }).catch(() => {});
        });
        return;
    }
    await loadSession();
    initSession();
    await refresh();
    $('invite-form').addEventListener('submit', event => {
        event.preventDefault();
        withBusy(event.submitter, async () => {
            const { code } = await api('/api/admin/invites', 'POST', { maxUses: Number(new FormData(event.target).get('maxUses')) });
            $('invite-output').textContent = `${location.origin}/login?invite=${code}`;
            $('invite-share').hidden = false;
            await refresh();
        }).catch(() => {});
    });
    $('invite-copy').addEventListener('click', () => navigator.clipboard.writeText($('invite-output').textContent)
        .then(() => showToast('邀请链接已复制'), () => showToast('复制失败，请手动选择链接', 'error')));
    $('rules-form').addEventListener('submit', event => {
        event.preventDefault();
        const rules = Object.fromEntries([...new FormData(event.target)].map(([key, value]) => [key, Number(value)]));
        const changes = Object.keys(rules).filter(key => rules[key] !== current.rules[key]).map(key => `${RULE_LABELS[key]}：${current.rules[key]} → ${rules[key]}`);
        if (!changes.length) return;
        withBusy(event.submitter, async () => {
            const lines = [...changes, '将重新计算全站历史经验、等级和星星，已解锁成就保留。'];
            const message = lines.map(line => lang === 'en' ? lookup(line) || line : line).join('\n');
            if (!await showConfirm(message)) return;
            await api('/api/admin/rules', 'POST', { rules, version: current.version });
            showToast('奖励规则已保存');
            await refresh();
        }).catch(() => {});
    });
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-user], [data-reset], [data-invite]');
        if (!button) return;
        withBusy(button, async () => {
            if (!await showConfirm('确认执行这项管理操作？')) return;
            const { user, disabled, reset, invite } = button.dataset;
            if (user) await api(`/api/admin/users/${encodeURIComponent(user)}/status`, 'POST', { disabled: disabled === 'true' });
            if (invite) await api(`/api/admin/invites/${invite}/disable`, 'POST');
            if (reset) {
                const { username, password } = await api(`/api/admin/users/${encodeURIComponent(reset)}/reset`, 'POST');
                $('reset-output').innerHTML = `<span>临时密码</span> <b translate="no">${esc(username)} / ${esc(password)}</b>`;
                $('reset-output').hidden = false;
            }
            await refresh();
        }).catch(() => {});
    });
}
start().catch(error => { $('admin-error').textContent = errorMessage(error.message); $('admin-error').hidden = false; });
