import { hashPassword, requireAdmin } from './auth.js';
import { digest, fail, json, now, randomToken, rateLimit, readBody } from './http.js';
import { DEFAULT_RULES, validateRules } from '../public/js/rules.js';
import { validDate } from './account.js';

export async function getRules(db) {
    const row = await db.prepare('SELECT version, config FROM game_rules WHERE id = 1').first();
    return row ? { version: row.version, rules: JSON.parse(row.config) } : { version: 0, rules: DEFAULT_RULES };
}

function audit(db, actor, action, target, details = {}) {
    return db.prepare('INSERT INTO audit_log (actor, action, target, details, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(actor, action, target, JSON.stringify(details), now());
}

export async function handleAdmin(request, env) {
    const session = await requireAdmin(request, env.DB);
    const db = env.DB, url = new URL(request.url), path = url.pathname;
    const diary = path.match(/^\/api\/admin\/users\/([^/]+)\/diary$/);
    if (request.method === 'GET' && diary) {
        const userId = decodeURIComponent(diary[1]);
        let date = url.searchParams.get('date');
        if (date !== null && !validDate(date)) fail(400, 'invalid_entry');
        if (!await db.prepare('SELECT id FROM accounts WHERE id = ?').bind(userId).first()) fail(404, 'user_not_found');
        if (date === null) date = (await db.prepare('SELECT MAX(date) AS date FROM diary_entries WHERE user_id = ?').bind(userId).first()).date;
        const entries = await db.prepare(`SELECT id, meal, name, display_amount AS displayAmount, kcal, protein, carbs, fat
            FROM diary_entries WHERE user_id = ? AND date = ? ORDER BY id`).bind(userId, date).all();
        return json({ date, entries: entries.results });
    }
    if (request.method === 'GET' && path === '/api/admin/state') {
        const [users, invites, logs] = await db.batch([
            db.prepare('SELECT id, username, nickname, role, disabled, onboarded, created_at FROM accounts ORDER BY created_at DESC LIMIT 500'),
            db.prepare('SELECT code_hash, code, max_uses, uses, disabled, created_at FROM invitations ORDER BY created_at DESC LIMIT 500'),
            db.prepare('SELECT actor, action, target, details, created_at FROM audit_log ORDER BY id DESC LIMIT 100')
        ]);
        return json({ users: users.results, invites: invites.results, logs: logs.results, ...await getRules(db) });
    }
    if (request.method !== 'POST') fail(404, 'not_found');
    await rateLimit(db, 'admin', session.id, 30, 60);
    const body = await readBody(request);
    if (path === '/api/admin/invites') {
        if (!Number.isInteger(body.maxUses) || body.maxUses < 1 || body.maxUses > 100) fail(400, 'invalid_limit');
        const code = randomToken().slice(0, 16), hash = await digest(code);
        await db.batch([
            db.prepare('INSERT INTO invitations (code_hash, code, max_uses, created_at) VALUES (?, ?, ?, ?)').bind(hash, code, body.maxUses, now()),
            audit(db, session.id, 'invite_created', hash, { maxUses: body.maxUses })
        ]);
        return json({ code }, 201);
    }
    const invite = path.match(/^\/api\/admin\/invites\/([a-f0-9]{64})\/disable$/);
    if (invite) {
        await db.batch([db.prepare('UPDATE invitations SET disabled = 1 WHERE code_hash = ?').bind(invite[1]), audit(db, session.id, 'invite_disabled', invite[1])]);
        return json({ ok: true });
    }
    const match = path.match(/^\/api\/admin\/users\/([^/]+)\/(status|reset)$/);
    if (match) {
        const target = await db.prepare('SELECT id, role, username FROM accounts WHERE id = ?').bind(match[1]).first();
        if (!target) fail(404, 'user_not_found');
        if (match[2] === 'status') {
            if (typeof body.disabled !== 'boolean' || target.role === 'admin') fail(400, 'invalid_status');
            await db.batch([
                db.prepare('UPDATE accounts SET disabled = ? WHERE id = ?').bind(Number(body.disabled), target.id),
                db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
                audit(db, session.id, body.disabled ? 'user_disabled' : 'user_enabled', target.id)
            ]);
            return json({ ok: true });
        }
        if (target.id === session.id) fail(400, 'use_account_password');
        if (!target.username) fail(400, 'identity_missing');
        await rateLimit(db, 'password-reset', target.id, 3, 3600);
        const password = randomToken().slice(0, 12);
        await db.batch([
            db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').bind(await hashPassword(password), target.id),
            db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
            audit(db, session.id, 'password_reset_requested', target.id)
        ]);
        return json({ username: target.username, password });
    }
    if (path === '/api/admin/rules') {
        if (!validateRules(body.rules) || !Number.isInteger(body.version) || body.version < 0) fail(400, 'invalid_rules');
        const [updated] = await db.batch([
            db.prepare(`INSERT INTO game_rules (id, version, config) SELECT 1, 1, ? WHERE ? = 0 OR EXISTS (SELECT 1 FROM game_rules WHERE id = 1)
                ON CONFLICT(id) DO UPDATE SET config = excluded.config, version = game_rules.version + 1 WHERE game_rules.version = ? RETURNING version`)
                .bind(JSON.stringify(body.rules), body.version, body.version),
            db.prepare(`INSERT INTO audit_log (actor, action, target, details, created_at)
                SELECT ?, 'rules_updated', 'global', ?, ? WHERE changes() > 0`).bind(session.id, JSON.stringify({ fromVersion: body.version, rules: body.rules }), now())
        ]);
        if (!updated.results.length) fail(409, 'rules_changed');
        return json(await getRules(db));
    }
    fail(404, 'not_found');
}
