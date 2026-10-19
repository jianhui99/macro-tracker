import { timingSafeEqual } from 'node:crypto';
import { cookie, cookieValue, digest, fail, json, now, randomToken, rateLimit, readBody, sameOrigin } from './http.js';

const SESSION = '__Host-macro-session';
const GATE = '__Host-macro-gate';
const encode = value => new TextEncoder().encode(value);
const sameSecret = async (provided, expected) => timingSafeEqual(encode(await digest(provided)), encode(await digest(expected)));
const clientIp = request => request.headers.get('CF-Connecting-IP') || 'local';

// ponytail: salted SHA-256 fits the 10 ms free-plan CPU limit but is weak against offline cracking; move to scrypt on Workers Paid if that matters.
export async function hashPassword(password, salt = randomToken()) {
    return `${salt}:${await digest(`${salt}:${password}`)}`;
}

async function checkPassword(password, stored) {
    if (typeof password !== 'string' || typeof stored !== 'string') return false;
    return timingSafeEqual(encode(await hashPassword(password, stored.split(':')[0])), encode(stored));
}

export function validPassword(password) {
    if (typeof password !== 'string' || password.length < 4 || password.length > 128) fail(400, 'invalid_password');
    return password;
}

export async function getSession(request, db) {
    const token = cookieValue(request, SESSION);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    return db.prepare(`SELECT a.*, s.token_hash, s.csrf, s.authenticated_at, s.admin_until FROM sessions s
        JOIN accounts a ON a.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND a.disabled = 0`)
        .bind(await digest(token), now()).first();
}

export async function requireSession(request, db) {
    const session = await getSession(request, db);
    if (!session) fail(401, 'login_required');
    const expected = request.headers.get('X-Account-Id');
    if (expected && expected !== session.id) fail(409, 'account_changed');
    if (!['GET', 'HEAD'].includes(request.method)) {
        sameOrigin(request);
        if (request.headers.get('X-CSRF-Token') !== session.csrf || expected !== session.id) fail(403, 'csrf_rejected');
    }
    return session;
}

export async function hasGate(request, db) {
    const token = cookieValue(request, GATE);
    if (!token) return false;
    return !!await db.prepare('SELECT 1 FROM admin_gates WHERE token_hash = ? AND expires_at > ?')
        .bind(await digest(token), now()).first();
}

export async function requireAdmin(request, db) {
    const session = await requireSession(request, db);
    if (session.role !== 'admin' || session.admin_until <= now() || !await hasGate(request, db)) fail(403, 'admin_required');
    return session;
}

export async function openGate(request, env) {
    sameOrigin(request);
    await rateLimit(env.DB, 'admin-gate', clientIp(request), 5);
    const { key } = await readBody(request);
    if (!env.ADMIN_ACCESS_KEY) fail(503, 'admin_not_configured');
    if (typeof key !== 'string' || key.length > 256 || !await sameSecret(key, env.ADMIN_ACCESS_KEY)) fail(403, 'invalid_key');
    const token = randomToken();
    await env.DB.batch([
        env.DB.prepare('DELETE FROM admin_gates WHERE expires_at <= ?').bind(now()),
        env.DB.prepare('INSERT INTO admin_gates VALUES (?, ?)').bind(await digest(token), now() + 1800)
    ]);
    const response = json({ ok: true });
    response.headers.set('Set-Cookie', cookie(GATE, token, 1800));
    return response;
}

async function startSession(request, env, accountId, admin) {
    const token = randomToken();
    await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE token_hash = ? OR expires_at <= ?').bind(await digest(cookieValue(request, SESSION)), now()),
        env.DB.prepare('DELETE FROM request_limits WHERE expires_at <= ?').bind(now()),
        env.DB.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)')
            .bind(await digest(token), accountId, randomToken(), now() + 604800, now(), admin ? now() + 1800 : 0)
    ]);
    const response = json({ ok: true });
    response.headers.set('Set-Cookie', cookie(SESSION, token, 604800));
    return response;
}

async function login(request, env) {
    sameOrigin(request);
    const { username, password, admin } = await readBody(request);
    await rateLimit(env.DB, 'login', clientIp(request), 20);
    if (typeof username !== 'string' || username.length > 32) fail(403, 'invalid_login');
    await rateLimit(env.DB, 'login-user', username.toLowerCase(), 10);
    const account = await env.DB.prepare('SELECT id, role, disabled, password_hash FROM accounts WHERE username = ?').bind(username).first();
    if (!await checkPassword(password, account?.password_hash)) fail(403, 'invalid_login');
    if (account.disabled) fail(403, 'account_disabled');
    if (admin === true && (account.role !== 'admin' || !await hasGate(request, env.DB))) fail(403, 'admin_required');
    return startSession(request, env, account.id, admin === true);
}

// The invite field also accepts ADMIN_ACCESS_KEY once, so the owner can claim the migrated legacy account.
async function register(request, env) {
    sameOrigin(request);
    const { username, password, invite } = await readBody(request);
    await rateLimit(env.DB, 'register', clientIp(request), 10);
    if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,32}$/.test(username)) fail(400, 'invalid_username');
    const hash = await hashPassword(validPassword(password));
    if (typeof invite !== 'string' || !invite.trim() || invite.length > 256) fail(400, 'invite_required');
    const ownerClaim = !!env.ADMIN_ACCESS_KEY && await sameSecret(invite.trim(), env.ADMIN_ACCESS_KEY);
    const statement = ownerClaim
        ? env.DB.prepare("UPDATE accounts SET username = ?, password_hash = ? WHERE id = 'owner' AND username IS NULL RETURNING id").bind(username, hash)
        : env.DB.prepare('INSERT INTO accounts (id, username, password_hash, invite_hash, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
            .bind(crypto.randomUUID(), username, hash, await digest(invite.trim()), now());
    let account;
    try { account = await statement.first(); }
    catch (error) {
        const message = String(error.message);
        if (message.includes('invite_unavailable')) fail(400, 'invite_unavailable');
        if (message.includes('UNIQUE')) fail(409, 'username_taken');
        throw error;
    }
    if (!account) fail(400, 'invite_unavailable');
    return startSession(request, env, account.id, false);
}

async function changePassword(request, env) {
    const session = await requireSession(request, env.DB);
    const { current, next } = await readBody(request);
    await rateLimit(env.DB, 'password', session.id, 10);
    if (!await checkPassword(current, session.password_hash)) fail(403, 'wrong_password');
    await env.DB.batch([
        env.DB.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').bind(await hashPassword(validPassword(next)), session.id),
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(session.id, session.token_hash)
    ]);
    return json({ ok: true });
}

export async function handleAuth(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST') {
        if (path === '/api/auth/login') return login(request, env);
        if (path === '/api/auth/register') return register(request, env);
        if (path === '/api/auth/password') return changePassword(request, env);
        if (path === '/api/auth/gate') return openGate(request, env);
    }
    if (path === '/api/auth/me' && request.method === 'GET') {
        const session = await getSession(request, env.DB);
        if (!session) return json({ account: null });
        return json({ account: { id: session.id, username: session.username, nickname: session.nickname, role: session.role, onboarded: !!session.onboarded },
            csrf: session.csrf, draft: JSON.parse(session.draft) });
    }
    if (path === '/api/auth/logout' && request.method === 'POST') {
        const session = await requireSession(request, env.DB);
        await env.DB.batch([
            env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.token_hash),
            env.DB.prepare('DELETE FROM admin_gates WHERE token_hash = ?').bind(await digest(cookieValue(request, GATE)))
        ]);
        const response = json({ ok: true });
        response.headers.append('Set-Cookie', cookie(SESSION, '', 0));
        response.headers.append('Set-Cookie', cookie(GATE, '', 0));
        return response;
    }
    fail(404, 'not_found');
}
