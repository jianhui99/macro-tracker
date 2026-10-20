import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backend } from './helpers/backend.mjs';
import { digest, now } from '../lib/http.js';

const origin = 'https://example.test';
function post(app, path, body, headers = {}) {
    return app.raw(`/api/auth/${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
const sessionCookie = response => response.headers.get('set-cookie')?.match(/__Host-macro-session=([a-f0-9]{64})/)?.[1];
async function invite(app, code, maxUses = 1) {
    await app.db.prepare('INSERT INTO invitations (code_hash, max_uses, created_at) VALUES (?, ?, ?)').bind(await digest(code), maxUses, now()).run();
}

test('registration consumes an invitation once and rejects bad input without spending it', async t => {
    const app = await backend(t);
    await invite(app, 'join-us', 2);
    const used = async () => app.sqlite.prepare('SELECT uses FROM invitations WHERE code_hash = ?').get(await digest('join-us')).uses;
    assert.equal((await post(app, 'register', { username: 'Ranger', password: 'secret1' })).status, 400);
    assert.equal((await post(app, 'register', { username: 'Ranger', password: 'secret1', invite: 'wrong' })).status, 400);
    assert.equal((await post(app, 'register', { username: 'ab', password: 'secret1', invite: 'join-us' })).status, 400);
    assert.equal((await post(app, 'register', { username: 'Ranger', password: '123', invite: 'join-us' })).status, 400);
    assert.equal((await post(app, 'register', { username: 'Ranger', password: 'secret1', invite: 'join-us' }, { Origin: 'https://evil.test' })).status, 403);
    assert.equal(await used(), 0);

    const response = await post(app, 'register', { username: 'Ranger', password: 'secret1', invite: ' join-us ' });
    assert.equal(response.status, 200);
    const token = sessionCookie(response);
    assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax; Max-Age=604800/);
    assert.equal(app.sqlite.prepare('SELECT COUNT(*) n FROM sessions WHERE token_hash = ?').get(token).n, 0, 'only the token digest is stored');
    const me = await (await app.raw('/api/auth/me', { headers: { Cookie: `__Host-macro-session=${token}` } })).json();
    assert.equal(me.account.username, 'Ranger');
    assert.equal(me.account.onboarded, false);
    const stored = app.sqlite.prepare("SELECT password_hash FROM accounts WHERE username = 'Ranger'").get().password_hash;
    assert.ok(!stored.includes('secret1'));
    assert.equal(await used(), 1);

    const taken = await post(app, 'register', { username: 'ranger', password: 'secret2', invite: 'join-us' });
    assert.equal(taken.status, 409);
    assert.equal((await taken.json()).error, 'username_taken');
    assert.equal(await used(), 1, 'a failed insert rolls back the invitation trigger');
    assert.equal((await post(app, 'register', { username: 'Mage', password: 'secret2', invite: 'join-us' })).status, 200);
    assert.equal((await post(app, 'register', { username: 'Rogue', password: 'secret3', invite: 'join-us' })).status, 400, 'exhausted');
});

test('login checks the password, ignores username case, refuses disabled accounts and limits guessing', async t => {
    const app = await backend(t);
    await app.addUser('friend');
    const wrong = await post(app, 'login', { username: 'friend', password: 'nope' });
    assert.equal(wrong.status, 403);
    assert.equal((await wrong.json()).error, 'invalid_login');
    assert.equal((await post(app, 'login', { username: 'ghost', password: 'password-friend' })).status, 403);
    const response = await post(app, 'login', { username: 'FRIEND', password: 'password-friend' });
    assert.equal(response.status, 200);
    assert.ok(sessionCookie(response));
    app.sqlite.exec("UPDATE accounts SET disabled = 1 WHERE id = 'friend'");
    assert.equal((await (await post(app, 'login', { username: 'friend', password: 'password-friend' })).json()).error, 'account_disabled');
    for (let i = 0; i < 8; i++) await post(app, 'login', { username: 'friend', password: 'nope' });
    assert.equal((await post(app, 'login', { username: 'friend', password: 'password-friend' })).status, 429);
});

test('the admin key claims the legacy owner account exactly once', async t => {
    const app = await backend(t);
    const response = await post(app, 'register', { username: 'feiii', password: 'owner-pass', invite: app.env.ADMIN_ACCESS_KEY });
    assert.equal(response.status, 200);
    const me = await (await app.raw('/api/auth/me', { headers: { Cookie: `__Host-macro-session=${sessionCookie(response)}` } })).json();
    assert.equal(me.account.id, 'owner');
    assert.equal(me.account.role, 'admin');
    assert.equal((await post(app, 'register', { username: 'intruder', password: 'owner-pass', invite: app.env.ADMIN_ACCESS_KEY })).status, 400);
    assert.equal(app.sqlite.prepare("SELECT username FROM accounts WHERE id = 'owner'").get().username, 'feiii');
});

test('normal admin login grants backend access without a gate; admin login rejects members', async t => {
    const app = await backend(t);
    await app.addUser('friend');
    await post(app, 'register', { username: 'admin', password: 'admin', invite: app.env.ADMIN_ACCESS_KEY });
    assert.equal((await post(app, 'login', { username: 'friend', password: 'password-friend', admin: true })).status, 403);
    for (const extra of [{}, { admin: true }]) {
        const response = await post(app, 'login', { username: 'admin', password: 'admin', ...extra });
        assert.equal(response.status, 200);
        const Cookie = `__Host-macro-session=${sessionCookie(response)}`;
        assert.equal((await app.raw('/api/admin/state', { headers: { Cookie } })).status, 200);
        app.sqlite.exec('UPDATE sessions SET expires_at = 0');
        assert.equal((await app.raw('/api/admin/state', { headers: { Cookie } })).status, 401);
    }
});

test('changing the password needs the current one and signs out other sessions only', async t => {
    const app = await backend(t);
    await app.addUser('friend');
    const other = await post(app, 'login', { username: 'friend', password: 'password-friend' });
    const change = body => app.request('auth/password', body, 'friend');
    assert.equal((await (await change({ current: 'nope', next: 'brand-new' })).json()).error, 'wrong_password');
    assert.equal((await change({ current: 'password-friend', next: '123' })).status, 400);
    assert.equal((await change({ current: 'password-friend', next: 'brand-new' })).status, 200);
    assert.ok((await app.request('auth/me', undefined, 'friend')).ok);
    const stale = await app.raw('/api/auth/me', { headers: { Cookie: `__Host-macro-session=${sessionCookie(other)}` } });
    assert.equal((await stale.json()).account, null);
    assert.equal((await post(app, 'login', { username: 'friend', password: 'password-friend' })).status, 403);
    assert.equal((await post(app, 'login', { username: 'friend', password: 'brand-new' })).status, 200);
});

test('admin reset issues a working temporary password and signs the member out', async t => {
    const app = await backend(t);
    await app.addUser('friend');
    const gate = (await post(app, 'gate', { key: app.env.ADMIN_ACCESS_KEY })).headers.get('set-cookie').split(';')[0];
    app.sqlite.exec(`UPDATE sessions SET admin_until = ${now() + 600} WHERE user_id = 'owner'`);
    const headers = { Cookie: `__Host-macro-session=${app.tokens.get('owner')}; ${gate}` };
    const response = await app.request('admin/users/friend/reset', {}, 'owner', 'POST', headers);
    assert.equal(response.status, 200);
    const { username, password } = await response.json();
    assert.equal(username, 'friend');
    assert.equal(password.length, 12);
    assert.equal((await app.request('state', undefined, 'friend')).status, 401);
    assert.equal((await post(app, 'login', { username, password })).status, 200);
    assert.equal((await app.request('admin/users/owner/reset', {}, 'owner', 'POST', headers)).status, 400);
});
