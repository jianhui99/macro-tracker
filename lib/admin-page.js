import { getSession, hasGate } from './auth.js';
import { now } from './http.js';

export function adminHtml(stage) {
    const content = stage === 'gate' ? `<h1>公会管理入口</h1><p>输入独立管理密钥后，再验证管理员身份。</p>
        <form id="gate-form"><label class="field"><span>管理密钥</span><input class="input" id="gate-key" type="password" required maxlength="256" autocomplete="off"></label><button class="btn">验证管理密钥</button></form>`
        : stage === 'login' ? `<h1>验证管理员身份</h1><p>入口验证已通过，请输入管理员账号的用户名和密码。</p>
        <form id="admin-login"><label class="field"><span>用户名</span><input class="input" name="username" required maxlength="32" autocomplete="username" autocapitalize="none" spellcheck="false" translate="no"></label>
        <label class="field"><span>密码</span><input class="input" name="password" type="password" required maxlength="128" autocomplete="current-password"></label><button class="btn">管理员登录</button></form>`
        : `<h1>管理公会</h1><p>仅显示账号状态，不展示私人饮食和身体记录。列表最多显示最近 500 个账号、500 个邀请码及 100 条操作。</p>
            <section class="admin-section"><h2>邀请码管理</h2><form id="invite-form"><label class="field"><span>可使用次数</span><input class="input" name="maxUses" type="number" min="1" max="100" value="1" required></label><button class="btn">生成邀请链接</button></form>
            <p>邀请链接仅显示一次，请复制后发给朋友。</p><div class="auth-actions" id="invite-share" hidden><output class="auth-output" id="invite-output" translate="no"></output><button class="btn btn-ghost" type="button" id="invite-copy">复制链接</button></div><div id="invite-list"></div></section>
            <section class="admin-section"><h2>用户管理</h2><p>重置后该用户的现有会话会退出，请把临时密码发给对方，登录后在账号设置里修改。</p><output class="auth-output" id="reset-output" hidden></output><div id="user-list"></div></section>
            <section class="admin-section"><h2>全站奖励规则</h2><p>修改会重新计算所有账号的历史经验、等级和星星，已解锁成就保留。已打开的页面会提示刷新。</p>
            <form id="rules-form"><div class="auth-grid" id="rule-fields"></div><button class="btn">预览并保存规则</button></form></section>
            <section class="admin-section"><h2>关键操作记录</h2><div id="audit-list"></div></section>`;
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>MacroTracker</title>
        <script src="/js/theme.js"></script><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400,0..1,0"><link rel="stylesheet" href="/css/app.css"><link rel="stylesheet" href="/css/auth.css"></head>
        <body class="auth-page" data-admin-stage="${stage}"><div id="toast-container" role="status" aria-live="polite"></div><main>
        <section class="panel"><button type="button" class="icon-btn panel-lang" id="lang-toggle" aria-label="切换语言" title="切换语言"><span class="ms" aria-hidden="true">translate</span></button>${content}<p><a href="/">返回冒险</a></p><p id="admin-error" role="alert" hidden></p></section></main>
        <dialog id="confirm-dialog"><form method="dialog"><h3>确认操作</h3><p id="confirm-message" class="auth-output"></p><div class="auth-actions"><button class="btn btn-ghost" value="cancel">取消</button><button class="btn" value="ok">确认</button></div></form></dialog>
        <script type="module" src="/js/admin.js"></script></body></html>`;
}

export async function adminPage(request, env) {
    let stage = 'gate';
    if (await hasGate(request, env.DB)) {
        const session = await getSession(request, env.DB);
        stage = session?.role === 'admin' && session.admin_until > now() ? 'panel' : 'login';
    }
    return new Response(adminHtml(stage), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' } });
}
