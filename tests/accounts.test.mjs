import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backend, fixture } from './helpers/backend.mjs';
import { businessTables } from './helpers/backend.mjs';
import { digest } from '../lib/http.js';
import { DEFAULT_RULES } from '../public/js/rules.js';
import { adminPage } from '../lib/admin-page.js';

test('deleted record IDs are never reused, including after importing older saves', async t => {
    const app = await backend(t);
    await app.request('import', fixture);
    for (const [path, body] of [['water', { date: '2026-10-19', ml: 250 }], ['diary', {
        ...fixture.diary[Object.keys(fixture.diary)[0]][0], date: '2026-10-19', isTemporary: true
    }]]) {
        const first = await (await app.request(path, body)).json();
        assert.ok(first.id);
        await app.request(`${path}/${first.id}`, {}, 'owner', 'DELETE');
        await app.request('import', fixture);
        const next = await (await app.request(path, body)).json();
        assert.ok(next.id > first.id, `${path} must not reuse an ID that another tab may still hold`);
    }
});

test('migration preserves every legacy business row and assigns it only to owner', async t => {
    let before;
    const app = await backend(t, sqlite => {
        sqlite.exec(`INSERT INTO diary_entries (date, name, raw_amount, display_amount, kcal, protein, carbs, fat) VALUES ('2026-10-18', 'legacy', 100, '100g', 120, 23, 0, 1);
            INSERT INTO water_log (date, ml) VALUES ('2026-10-18', 250);
            INSERT INTO achievements VALUES ('record_streak:3', '2026-10-18');
            INSERT INTO weight_log VALUES ('2026-10-18', 70);
            INSERT INTO day_plan VALUES ('2026-10-18', 'high');`);
        before = Object.fromEntries(businessTables.map(table => [table, sqlite.prepare(`SELECT * FROM ${table}`).all().map(row => {
            if (table === 'user_settings') delete row.id;
            return { ...row };
        })]));
    });
    for (const table of businessTables) {
        // skin, max_level and level arrive in later migrations with their defaults
        const rows = app.sqlite.prepare(`SELECT * FROM ${table}`).all().map(({ user_id, skin, max_level, level, ...row }) => { assert.equal(user_id, 'owner'); return row; });
        assert.deepEqual(rows, before[table]);
    }
    await app.addUser('friend', false);
    for (const table of businessTables) assert.equal(app.sqlite.prepare(`SELECT COUNT(*) n FROM ${table} WHERE user_id = 'friend'`).get().n, 0);
});

test('onboarding saves drafts, validates boundaries and creates independent defaults atomically', async t => {
    const app = await backend(t);
    const existingFoods = (await (await app.request('state')).json()).foods;
    await app.addUser('new', false);
    assert.equal((await app.request('state', undefined, 'new')).status, 409);
    const draft = { nickname: 'Ranger', height: '175', role: 'admin', weight: '' };
    assert.equal((await app.request('profile', draft, 'new', 'PUT')).status, 200);
    const me = await (await app.request('auth/me', undefined, 'new')).json();
    assert.equal(me.draft.height, '175');
    assert.equal(me.draft.role, undefined);
    assert.equal(me.account.role, 'user');
    const profile = { ...fixture.user, nickname: 'Ranger' };
    assert.equal((await app.request('profile/complete', { ...profile, age: 2 }, 'new')).status, 400);
    app.fail(3);
    assert.equal((await app.request('profile/complete', profile, 'new')).status, 500);
    assert.equal(app.sqlite.prepare("SELECT COUNT(*) n FROM foods WHERE user_id = 'new'").get().n, 0);
    app.fail(-1);
    assert.equal((await app.request('profile/complete', profile, 'new')).status, 200);
    const state = await (await app.request('state', undefined, 'new')).json();
    assert.equal(state.foods.length, 6);
    assert.deepEqual(Object.fromEntries(state.foods.map(food => [food.id, food.category])), {
        '1': '补剂', '2': '蛋类', '2_b': '蛋类', '3': '肉类', '4': '饭类', '5': '燕麦类'
    });
    assert.deepEqual((await (await app.request('state')).json()).foods, existingFoods);
    assert.deepEqual(state.diary, {});
    assert.equal((await app.request('profile/complete', profile, 'new')).status, 409);
});

test('all business mutations and backup replacement stay inside the current account', async t => {
    const app = await backend(t);
    await app.addUser('friend');
    for (const id of ['owner', 'friend']) assert.equal((await app.request('import', fixture, id)).status, 204);
    const friend = await (await app.request('state', undefined, 'friend')).json();
    const food = fixture.foods[0], date = Object.keys(fixture.diary)[0], entry = fixture.diary[date][0];
    const mutations = [
        ['user', { ...fixture.user, height: 180 }, 'PUT'],
        [`foods/${food.id}`, { ...food, name: 'Only owner', kcal: 555 }, 'PUT'],
        [`foods/${food.id}/active`, { active: false }, 'PATCH'],
        [`diary/${entry.id}`, { ...entry, name: 'Only owner' }, 'PUT'],
        [`weights/${date}`, { weight: 65 }, 'PUT'],
        ['water', { date, ml: 300, customUnit: 'ml' }, 'POST'],
        ['day-types', { high: { carbs: 20, fat: 0 }, medium: { carbs: 0, fat: 0 }, low: { carbs: -20, fat: 0 } }, 'PUT'],
        [`day-plan/${date}`, { type: 'low' }, 'PUT'],
        ['achievements', { unlocks: [{ id: 'record_streak:100', date }] }, 'POST'],
        [`foods/${food.id}`, {}, 'DELETE'], [`diary/${entry.id}`, {}, 'DELETE'],
        [`weights/${date}`, {}, 'DELETE'], [`day-plan/${date}`, {}, 'DELETE'],
        [`water/${Object.values(fixture.water).flat()[0].id}`, {}, 'DELETE'], ['import', fixture, 'POST']
    ];
    for (const [path, body, method] of mutations) {
        const response = await app.request(path, body, 'owner', method);
        assert.ok(response.ok, `${method} ${path}: ${response.status}`);
        assert.deepEqual(await (await app.request('state', undefined, 'friend')).json(), friend, path);
    }
    const otherFood = await (await app.request('foods', food, 'friend')).json();
    assert.equal((await app.request(`foods/${otherFood.id}`, food, 'owner', 'PUT')).status, 404);
    assert.equal((await app.request('diary', { ...entry, date, isTemporary: false, foodId: otherFood.id })).status, 404);
    const onlyOther = await (await app.request('diary', { ...entry, date, isTemporary: true }, 'friend')).json();
    assert.equal((await app.request(`diary/${onlyOther.id}`, entry, 'owner', 'PUT')).status, 404);
    const before = app.snapshot();
    assert.equal((await app.request('import', fixture, 'owner', 'POST', { 'X-Account-Id': 'friend' })).status, 409);
    assert.deepEqual(app.snapshot(), before);
    const exported = await (await app.request('state')).json();
    assert.deepEqual(Object.keys(exported).sort(), Object.keys(fixture).sort());
});

test('food cascades return exactly the persisted macros and preserve temporary history', async t => {
    const app = await backend(t);
    await app.request('import', fixture);
    const food = fixture.foods[0];
    const result = await (await app.request(`foods/${food.id}`, { ...food, kcal: 133, unit: '35g' }, 'owner', 'PUT')).json();
    const saved = await (await app.request('state')).json();
    for (const entry of result.updatedEntries) assert.deepEqual(saved.diary[entry.date].find(e => e.id === entry.id), (({ date, ...data }) => data)(entry));
});

test('invalid food units and foreign identifier types fail before changing history', async t => {
    const app = await backend(t);
    await app.request('import', fixture);
    const before = app.snapshot();
    for (const unit of ['-100g', '0g', '1e999g']) {
        assert.equal((await app.request(`foods/${fixture.foods[0].id}`, { ...fixture.foods[0], unit }, 'owner', 'PUT')).status, 400);
    }
    const entry = Object.values(fixture.diary).flat()[0];
    assert.equal((await app.request('diary', { ...entry, date: '2026-10-19', foodId: { id: 'other' } })).status, 400);
    assert.deepEqual(app.snapshot(), before);
});

test('sessions require origin and CSRF on writes and reject legacy keys, expiry and disabled users', async t => {
    const app = await backend(t);
    assert.equal((await app.raw('/api/state', { headers: { Authorization: 'Bearer old-key' } })).status, 401);
    const before = app.snapshot();
    for (const headers of [{ Origin: 'https://evil.test' }, { 'X-CSRF-Token': 'bad' }, { 'X-Account-Id': '' }]) {
        assert.equal((await app.request('import', fixture, 'owner', 'POST', headers)).status, 403);
        assert.deepEqual(app.snapshot(), before);
    }
    app.sqlite.exec('UPDATE sessions SET expires_at = 0');
    assert.equal((await app.request('state')).status, 401);
    await app.session('owner');
    app.sqlite.exec("UPDATE accounts SET disabled = 1 WHERE id = 'owner'");
    assert.equal((await app.request('state')).status, 401);
});

async function admin(app) {
    return { Cookie: `__Host-macro-session=${app.tokens.get('owner')}` };
}

test('admin food logs are read-only, scoped by user and date and require an admin session', async t => {
    const app = await backend(t);
    await app.addUser('friend');
    await app.addUser('empty', false);
    for (const user of ['owner', 'friend']) await app.request('import', fixture, user);
    const date = '2026-10-26';
    const entry = { ...Object.values(fixture.diary).flat()[0], date, meal: 'lunch', name: '<script>food</script>', isTemporary: true };
    await app.request('diary', entry, 'friend');
    const before = app.snapshot();
    const path = 'admin/users/friend/diary';
    const latest = await app.request(path);
    assert.equal(latest.status, 200);
    assert.equal(latest.headers.get('Cache-Control'), 'no-store');
    const result = await latest.json();
    assert.equal(result.date, date);
    assert.deepEqual(result.entries.map(({ id, ...row }) => row), [{
        meal: entry.meal, name: entry.name, displayAmount: entry.displayAmount,
        kcal: entry.kcal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat
    }]);
    assert.deepEqual(await (await app.request(`${path}?date=2026-10-25`)).json(), { date: '2026-10-25', entries: [] });
    const historicalDate = Object.keys(fixture.diary)[0];
    const historical = await (await app.request(`${path}?date=${historicalDate}`)).json();
    assert.equal(historical.entries.length, fixture.diary[historicalDate].length);
    assert.deepEqual(await (await app.request('admin/users/empty/diary')).json(), { date: null, entries: [] });
    assert.equal((await app.request('admin/users/missing/diary')).status, 404);
    for (const invalid of ['', '2026-02-30', 'invalid']) assert.equal((await app.request(`${path}?date=${invalid}`)).status, 400);
    assert.equal((await app.request(path, undefined, 'friend')).status, 403);
    assert.equal((await app.raw(`/api/${path}`)).status, 401);
    assert.equal((await app.request(path, {})).status, 404);
    assert.deepEqual(app.snapshot(), before);
});

test('admin pages and APIs use the logged-in account role and reject logged-out sessions', async t => {
    const app = await backend(t);
    await app.addUser('friend');
    const page = cookie => adminPage(new Request('https://example.test/admin', { headers: { Cookie: cookie || '' } }), app.env);
    assert.match(await (await page()).text(), /id="admin-login"/);
    assert.equal((await app.raw('/api/admin/state')).status, 401);
    const headers = await admin(app);
    assert.match(await (await page(headers.Cookie)).text(), /id="user-list"/);
    assert.equal((await app.request('admin/state')).status, 200);
    const friend = `__Host-macro-session=${app.tokens.get('friend')}`;
    assert.equal((await page(friend)).status, 403);
    assert.equal((await app.request('admin/state', undefined, 'friend')).status, 403);
    assert.equal((await app.request('admin/invites', { maxUses: 1 }, 'friend')).status, 403);
    assert.equal((await app.request('admin/invites', { maxUses: 1 }, 'owner', 'POST', { 'X-CSRF-Token': 'wrong' })).status, 403);
    assert.equal((await app.request('auth/logout', {})).status, 200);
    assert.match(await (await page(headers.Cookie)).text(), /id="admin-login"/);
    assert.equal((await app.request('admin/state')).status, 401);
    assert.equal((await app.request('admin/invites', { maxUses: 1 })).status, 401);
});

test('admin invitations, disable/restore and rules are audited without exposing secrets', async t => {
    const app = await backend(t);
    await app.addUser('friend');
    const headers = await admin(app);
    const post = (path, body) => app.request(`admin/${path}`, body, 'owner', 'POST', headers);
    const { code } = await (await post('invites', { maxUses: 1 })).json();
    assert.equal(code.length, 16);
    const hash = await digest(code);
    assert.equal(app.sqlite.prepare('SELECT max_uses FROM invitations WHERE code_hash = ?').get(hash).max_uses, 1);
    assert.equal((await post(`invites/${hash}/disable`, {})).status, 200);
    assert.equal((await post('users/owner/status', { disabled: true })).status, 400);
    assert.equal((await post('users/friend/status', { disabled: true })).status, 200);
    assert.equal((await app.request('auth/me', undefined, 'friend')).status, 200);
    assert.equal((await (await app.request('auth/me', undefined, 'friend')).json()).account, null);
    assert.equal((await post('users/friend/status', { disabled: false })).status, 200);
    assert.equal((await app.request('state', undefined, 'friend')).status, 401);
    assert.equal((await post('rules', { version: 0, rules: { ...DEFAULT_RULES, levelBase: 0 } })).status, 400);
    const rules = { ...DEFAULT_RULES, star: 20 };
    assert.equal((await post('rules', { version: 0, rules })).status, 200);
    assert.equal((await post('rules', { version: 0, rules: DEFAULT_RULES })).status, 409);
    assert.deepEqual(await (await app.request('rules')).json(), { version: 1, rules });
    const state = await (await app.request('admin/state', undefined, 'owner', 'GET', headers)).json();
    assert.equal(state.logs.filter(log => log.action === 'rules_updated').length, 1);
    assert.equal(state.invites.find(invite => invite.code_hash === hash).code, code);
    assert.ok(!JSON.stringify(state.logs).includes(code));
    assert.equal(state.users[0].draft, undefined);
    assert.ok(!JSON.stringify(state).includes('password_hash'));
});

test('gate rate limit and request size validation reject abusive writes', async t => {
    const app = await backend(t);
    for (let i = 0; i < 6; i++) {
        const response = await app.raw('/api/auth/gate', { method: 'POST', headers: { Origin: 'https://example.test', 'Content-Type': 'application/json' }, body: '{"key":"wrong"}' });
        assert.equal(response.status, i === 5 ? 429 : 403);
    }
    assert.equal((await app.request('profile', { nickname: 'x'.repeat(70000) }, 'owner', 'PUT')).status, 413);
    const response = await app.request('auth/logout', {});
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax; Max-Age=0/);
    assert.equal((await app.request('state')).status, 401);
});

test('skins unlock with the highest level reached, which never drops', async t => {
    const app = await backend(t);
    const user = async () => (await (await app.request('state')).json()).user;
    assert.equal((await app.request('skin', { skin: 3 }, 'test', 'PUT')).status, 403);
    assert.equal((await app.request('level', { level: 5 })).status, 204);
    assert.equal((await app.request('skin', { skin: 3 }, 'test', 'PUT')).status, 204);
    assert.equal((await app.request('level', { level: 2 })).status, 204);
    assert.deepEqual(await user().then(u => [u.skin, u.maxLevel]), [3, 5]);
    for (const skin of [0, 31, 2.5, '4']) assert.equal((await app.request('skin', { skin }, 'test', 'PUT')).status, 400);
    for (const level of [0, -1, 1.5, '9']) assert.equal((await app.request('level', { level })).status, 400);
    assert.equal((await app.request('skin', { skin: 6 }, 'test', 'PUT')).status, 403);
    assert.equal((await app.request('skin', { skin: null }, 'test', 'PUT')).status, 204);
    assert.equal((await user()).skin, null);
});

test('guild members see levels, join dates, streaks and medals; only the leader sees accounts, activity and weight', async t => {
    const app = await backend(t);
    app.env.TIME_ZONE = 'UTC';
    for (const id of ['friend', 'pending']) await app.addUser(id, false);
    assert.equal((await app.request('profile/complete', { ...fixture.user, nickname: 'Ranger' }, 'friend')).status, 200);
    assert.equal((await app.request('level', { level: 7 })).status, 204);
    assert.equal((await app.request('level', { level: 3 }, 'friend')).status, 204);
    assert.equal((await app.request('level', { level: 2 }, 'friend')).status, 204);
    const day = offset => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
    for (const offset of [1, 2, 4]) {
        app.sqlite.prepare("INSERT INTO diary_entries (user_id, id, date, name, raw_amount, display_amount, kcal, protein, carbs, fat) VALUES ('friend', ?, ?, 'x', 1, '1', 1, 1, 1, 1)").run(offset, day(offset));
    }
    app.sqlite.prepare("INSERT INTO weight_log (user_id, date, weight) VALUES ('friend', ?, 80), ('friend', ?, 78)").run(day(9), day(2));

    const memberView = (await (await app.request('guild', undefined, 'friend')).json()).members;
    for (const { avatar } of memberView) assert.deepEqual(Object.keys(avatar).sort(), ['age', 'build', 'gender', 'height', 'job', 'skin']);
    assert.equal(memberView[1].avatar.skin, 2, 'with no skin picked the hero wears its current level');
    assert.deepEqual(memberView.map(({ joinedAt, avatar, ...m }) => (assert.ok(Number.isInteger(joinedAt)), m)), [
        { nickname: '冒险者', level: 7, leader: true, me: false, streak: 0, medals: 0 },
        { nickname: 'Ranger', level: 2, leader: false, me: true, streak: 2, medals: 0 }
    ]);
    const leaderView = (await (await app.request('guild')).json()).members;
    const ranger = leaderView.find(m => m.nickname === 'Ranger');
    assert.equal(ranger.username, 'friend');
    assert.equal(ranger.streak, 2);
    assert.equal(ranger.lastActive, day(1));
    assert.deepEqual(ranger.weight, { first: 80, latest: 78, target: fixture.user.targetWeight });
    assert.equal(leaderView.length, 2, 'accounts that have not finished onboarding are not members yet');
    assert.equal((await (await app.request('state', undefined, 'friend')).json()).user.maxLevel, 3);
});
