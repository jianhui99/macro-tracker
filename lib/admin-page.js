import { getSession } from './auth.js';

export function adminHtml(stage) {
    const panel = stage === 'panel';
    const languageButton = '<button type="button" class="icon-btn panel-lang" id="lang-toggle" aria-label="切换语言" title="切换语言"><span class="ms" aria-hidden="true">translate</span></button>';
    const content = stage === 'login' ? `<h1>验证管理员身份</h1><p>请使用管理员账号登录。</p>
        <form id="admin-login"><label class="field"><span>用户名</span><input class="input" name="username" required maxlength="32" autocomplete="username" autocapitalize="none" spellcheck="false" translate="no"></label>
        <label class="field"><span>密码</span><input class="input" name="password" type="password" required maxlength="128" autocomplete="current-password"></label><button class="btn">管理员登录</button></form>`
        : stage === 'denied' ? `<h1>验证管理员身份</h1><p>当前账号没有管理员权限。</p>`
        : `
            <section class="panel admin-section" id="invites" aria-labelledby="invites-title" hidden><h2 id="invites-title">邀请码管理</h2><form id="invite-form"><label class="field"><span>可使用次数</span><input class="input" name="maxUses" type="number" min="1" max="100" value="1" required></label><button class="btn">生成邀请码</button></form>
            <p>复制邀请码发给朋友，注册时填入即可。生成后可随时在这里查看和复制。</p><div class="auth-actions" id="invite-share" hidden><output class="auth-output" id="invite-output" translate="no"></output><button class="btn btn-ghost" type="button" id="invite-copy">复制邀请码</button></div><div id="invite-list"></div></section>
            <section class="panel admin-section" id="users" aria-labelledby="users-title"><h2 id="users-title">用户管理</h2><p>重置后该用户的现有会话会退出，请把临时密码发给对方，登录后在账号设置里修改。</p><output class="auth-output" id="reset-output" hidden></output><div id="user-list"></div></section>
            <section class="panel admin-section" id="rules" aria-labelledby="rules-title" hidden><h2 id="rules-title">全站奖励规则</h2><p>修改会重新计算所有账号的历史经验、等级和星星，已解锁成就保留。已打开的页面会提示刷新。</p>
            <form id="rules-form"><div class="auth-grid" id="rule-fields"></div><button class="btn">预览并保存规则</button></form></section>
            <section class="panel admin-section" id="audit" aria-labelledby="audit-title" hidden><h2 id="audit-title">关键操作记录</h2><div id="audit-list"></div></section>`;
    const layout = panel ? `<div class="admin-shell">
        <aside class="admin-sidebar"><div class="admin-brand"><b translate="no">MacroTracker</b><span>管理公会</span></div>
            <nav class="admin-nav" aria-label="管理公会">
                <a href="#users" aria-current="page"><span class="ms" aria-hidden="true">group</span><span>用户管理</span></a>
                <a href="#invites"><span class="ms" aria-hidden="true">mail</span><span>邀请码管理</span></a>
                <a href="#rules"><span class="ms" aria-hidden="true">stars</span><span>全站奖励规则</span></a>
                <a href="#audit"><span class="ms" aria-hidden="true">history</span><span>关键操作记录</span></a>
            </nav><a class="admin-return" href="/">返回冒险</a>
        </aside>
        <main class="admin-main"><header class="admin-header"><div><h1>管理公会</h1><p>仅显示账号状态，不展示私人饮食和身体记录。列表最多显示最近 500 个账号、500 个邀请码及 100 条操作。</p></div>${languageButton}</header>
            <p id="admin-error" role="alert" hidden></p>${content}</main></div>`
        : `<main><section class="panel">${languageButton}${content}<p><a href="/">返回冒险</a></p><p id="admin-error" role="alert" hidden></p></section></main>`;
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>MacroTracker</title>
        <script src="/js/theme.js"></script><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400,0..1,0"><link rel="stylesheet" href="/css/app.css"><link rel="stylesheet" href="/css/auth.css">${panel ? '<link rel="stylesheet" href="/css/admin.css">' : ''}</head>
        <body class="auth-page${panel ? ' admin-page' : ''}" data-admin-stage="${stage}"><div id="toast-container" role="status" aria-live="polite"></div>${layout}
        <dialog id="confirm-dialog" class="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-message"><form method="dialog" class="dialog-body"><h3 class="dialog-title" id="confirm-title">确认操作</h3><p id="confirm-message" class="auth-output"></p><div class="dialog-foot"><button class="btn btn-ghost" value="cancel">取消</button><button class="btn" value="ok">确认</button></div></form></dialog>
        <script type="module" src="/js/admin.js"></script></body></html>`;
}

export async function adminPage(request, env) {
    const session = await getSession(request, env.DB);
    const stage = !session ? 'login' : session.role === 'admin' ? 'panel' : 'denied';
    return new Response(adminHtml(stage), { status: stage === 'denied' ? 403 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' } });
}
