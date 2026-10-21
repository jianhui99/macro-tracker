import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backend, fixture } from './helpers/backend.mjs';

const profile = { nickname: '新冒险者', height: 170, weight: 65, age: 28, gender: 'female', activity: 1.55 };
const entry = { date: '2026-10-21', name: '午餐', rawAmount: 1, displayAmount: '1份', meal: 'lunch', isTemporary: true, kcal: 400, protein: 20, carbs: 50, fat: 10 };
const read = async (app, id = 'owner') => (await app.request('onboarding', undefined, id)).json();
const patch = (app, body, id = 'owner') => app.request('onboarding', body, id, 'PATCH');

test('only newly completed profiles automatically receive onboarding, atomically', async t => {
    const app = await backend(t);
    assert.deepEqual(await read(app), { enabled: false, presented: false, completed: [] });
    await app.addUser('new', false);
    assert.equal((await app.request('onboarding', undefined, 'new')).status, 409);
    app.fail(1);
    assert.equal((await app.request('profile/complete', profile, 'new')).status, 500);
    assert.equal(app.sqlite.prepare('SELECT COUNT(*) n FROM user_onboarding').get().n, 0);
    app.fail(-1);
    assert.equal((await app.request('profile/complete', profile, 'new')).status, 200);
    assert.deepEqual(await read(app, 'new'), { enabled: true, presented: false, completed: [] });
    assert.deepEqual(await read(app), { enabled: false, presented: false, completed: [] });
});

test('progress is additive, validates input, and is isolated by session', async t => {
    const app = await backend(t);
    await app.addUser('friend');
    assert.equal((await patch(app, { enabled: true, presented: true })).status, 200);
    await Promise.all([patch(app, { completed: ['targets'] }), patch(app, { completed: ['growth'] })]);
    await patch(app, { completed: ['targets', 'meal', 'water'] });
    assert.deepEqual(await read(app), { enabled: true, presented: true, completed: ['targets', 'growth'] });
    assert.equal((await patch(app, { completed: ['unknown'] })).status, 400);
    assert.equal((await patch(app, { presented: false })).status, 400);
    assert.equal((await patch(app, { userId: 'friend', completed: ['meal'] })).status, 400);
    assert.equal((await app.request('onboarding', { enabled: true }, 'owner', 'PATCH', { 'X-CSRF-Token': 'wrong' })).status, 403);
    assert.equal((await app.raw('/api/onboarding')).status, 401);
    assert.deepEqual(await read(app, 'friend'), { enabled: false, presented: false, completed: [] });
    await app.session('owner');
    assert.deepEqual((await read(app)).completed, ['targets', 'growth']);
});

test('only saved records complete tasks and deletion or import never resets progress', async t => {
    const app = await backend(t);
    await patch(app, { enabled: true });
    assert.equal((await app.request('diary', { ...entry, kcal: -1 })).status, 400);
    assert.equal((await app.request('water', { date: entry.date, ml: 0 })).status, 400);
    assert.deepEqual((await read(app)).completed, []);
    app.fail(1);
    assert.equal((await app.request('diary', entry)).status, 500);
    assert.deepEqual((await read(app)).completed, []);
    app.fail(-1);
    const meal = await (await app.request('diary', entry)).json();
    const water = await (await app.request('water', { date: entry.date, ml: 250 })).json();
    assert.deepEqual((await read(app)).completed, ['meal', 'water']);
    await app.request(`diary/${meal.id}`, {}, 'owner', 'DELETE');
    await app.request(`water/${water.id}`, {}, 'owner', 'DELETE');
    await patch(app, { completed: ['targets'] });
    await app.request('import', { ...fixture, diary: {}, water: {} });
    assert.deepEqual((await read(app)).completed, ['targets', 'meal', 'water']);
});

test('manual opening credits existing records without changing business data', async t => {
    const app = await backend(t);
    await app.request('import', fixture);
    await app.request('water', { date: entry.date, ml: 250 });
    const before = app.snapshot();
    assert.equal((await read(app)).enabled, false);
    await patch(app, { enabled: true, presented: true });
    assert.deepEqual((await read(app)).completed, ['meal', 'water']);
    assert.deepEqual(app.snapshot(), before);
});
