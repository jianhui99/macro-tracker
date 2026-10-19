import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../../functions/api/[[path]].js';
import { digest, now } from '../../lib/http.js';
import { hashPassword } from '../../lib/auth.js';

export const fixture = JSON.parse(readFileSync(new URL('../fixtures/state.json', import.meta.url)));
export const businessTables = ['user_settings', 'foods', 'diary_entries', 'achievements', 'weight_log', 'day_types', 'day_plan', 'water_log'];

export async function backend(t, beforeAccounts) {
    const sqlite = new DatabaseSync(':memory:');
    t.after(() => sqlite.close());
    sqlite.exec('PRAGMA foreign_keys = ON');
    const migrations = new URL('../../db/migrations/', import.meta.url);
    for (const file of readdirSync(migrations).sort()) {
        if (file === '0007_accounts.sql') beforeAccounts?.(sqlite);
        sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
    }
    let batches = 0, failAt = -1;
    const statement = (sql, values = []) => ({
        sql, values, bind(...next) { return statement(sql, next); },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        async run() { return { meta: sqlite.prepare(sql).run(...values) }; }
    });
    const db = {
        prepare: statement,
        async batch(statements) {
            batches++;
            sqlite.exec('BEGIN');
            try {
                const results = statements.map(({ sql, values }, index) => {
                    if (index === failAt) throw new Error('simulated database failure');
                    return { results: sqlite.prepare(sql).all(...values) };
                });
                sqlite.exec('COMMIT');
                return results;
            } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
        }
    };
    const env = { DB: db, ADMIN_ACCESS_KEY: 'synthetic-admin-key-32-characters-only' };
    const tokens = new Map();
    async function session(id, admin = false) {
        const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
        tokens.set(id, token);
        await db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)').bind(await digest(token), id, `csrf-${id}`, now() + 3600, now(), admin ? now() + 1800 : 0).run();
        return token;
    }
    async function addUser(id, onboarded = true) {
        const hash = await digest(`invite-${id}`);
        await db.prepare('INSERT INTO invitations (code_hash, max_uses, created_at) VALUES (?, 1, ?)').bind(hash, now()).run();
        await db.prepare('INSERT INTO accounts (id, username, password_hash, invite_hash, onboarded, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(id, id, await hashPassword(`password-${id}`), hash, Number(onboarded), now()).run();
        await session(id);
    }
    await session('owner');
    const raw = (path, options = {}) => onRequest({ request: new Request(`https://example.test${path}`, options), env });
    const request = (path, body, key = 'test', method = body === undefined ? 'GET' : 'POST', extraHeaders = {}) => {
        const id = key === 'test' ? 'owner' : key;
        const token = tokens.get(id) || 'a'.repeat(64);
        return raw(`/api/${path}`, { method,
            headers: { Cookie: `__Host-macro-session=${token}`, 'X-Account-Id': id, 'X-CSRF-Token': `csrf-${id}`, Origin: 'https://example.test',
                ...(method !== 'GET' && { 'Content-Type': 'application/json' }), ...extraHeaders },
            ...(method !== 'GET' && { body: JSON.stringify(body ?? {}) }) });
    };
    const snapshot = () => Object.fromEntries(businessTables.map(name => [name, sqlite.prepare(`SELECT * FROM ${name}`).all()
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
    return { sqlite, db, env, raw, request, session, addUser, tokens, snapshot, batches: () => batches, fail: index => { failAt = index; } };
}
