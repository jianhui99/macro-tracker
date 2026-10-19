import { showToast } from './ui.js';
import { account, authHeaders, expireSession } from './session.js';

const ERRORS = {
    admin_not_configured: '管理入口尚未配置', invite_unavailable: '邀请码无效或已用完', invite_required: '需要邀请码才能加入',
    invalid_login: '用户名或密码不对', wrong_password: '当前密码不对', username_taken: '这个用户名已被使用',
    invalid_username: '用户名需要 3 到 32 个字母、数字或下划线', invalid_password: '密码需要 4 到 128 个字符',
    account_disabled: '账号已停用', invalid_profile: '请检查角色属性的填写范围',
    invalid_nickname: '角色昵称需要 1 到 40 个字符', invalid_entry: '请检查记录内容',
    rate_limited: '操作太频繁，请稍后再试', invalid_key: '密钥不对，请重新输入',
    admin_required: '请重新验证管理入口和管理员身份', rules_changed: '规则已被修改，请刷新后再试',
    request_too_large: '请求内容过大，请缩小后再试', too_many_records: '记录数量超过限制', login_failed: '登录失败，请重新开始'
};
const errorMessage = code => ERRORS[code] || '操作失败，请稍后再试';

async function api(url, method = 'GET', body) {
    const sentAccount = account?.id;
    let response;
    try {
        response = await fetch(url, { method, cache: 'no-store',
            headers: { ...authHeaders(), ...(method !== 'GET' && { 'Content-Type': 'application/json' }) },
            body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
    } catch (error) {
        showToast('连不上服务器，请检查网络', 'error');
        throw error;
    }
    if (response.status === 401 || sentAccount !== account?.id) {
        expireSession();
        throw new Error('login_required');
    }
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.error === 'account_changed') expireSession();
        showToast(errorMessage(data.error), 'error');
        throw new Error(data.error || `${method} ${url} -> ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
}

export { api, authHeaders, errorMessage };
