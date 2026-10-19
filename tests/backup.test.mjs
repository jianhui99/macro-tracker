import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { timingSafeEqual } from 'node:crypto';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { validateBackup } from '../public/js/backup-format.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/state.json', import.meta.url)));

async function backend(t) {
    const sqlite = new DatabaseSync(':memory:');
    t.after(() => sqlite.close());
    const migrations = new URL('../db/migrations/', import.meta.url);
    for (const file of readdirSync(migrations).sort()) sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
    let batches = 0, failAt = -1;
    const db = {
        prepare(sql) {
            return { sql, values: [], bind(...values) { return { sql, values }; } };
        },
        async batch(statements) {
            batches++;
            sqlite.exec('BEGIN');
            try {
                const results = statements.map(({ sql, values }, i) => {
                    if (i === failAt) throw new Error('simulated database failure');
                    return { results: sqlite.prepare(sql).all(...values) };
                });
                sqlite.exec('COMMIT');
                return results;
            } catch (err) {
                sqlite.exec('ROLLBACK');
                throw err;
            }
        }
    };
    const context = createContext({ Response, URL, TextEncoder, crypto: { subtle: { timingSafeEqual } }, console: { error() {} } });
    const mod = new SourceTextModule(readFileSync(new URL('../functions/api/[[path]].js', import.meta.url), 'utf8'), { context });
    await mod.link(() => new SyntheticModule(['validateBackup'], function () { this.setExport('validateBackup', validateBackup); }, { context }));
    await mod.evaluate();
    const request = (path, body, key = 'test') => mod.namespace.onRequest({
        request: new Request(`https://example.test/api/${path}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
            body: body === undefined ? undefined : JSON.stringify(body)
        }),
        env: { DB: db, API_KEY: 'test' }
    });
    const snapshot = () => Object.fromEntries(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
        .map(({ name }) => [name, sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]));
    return { sqlite, request, snapshot, batches: () => batches, fail: index => { failAt = index; } };
}

test('import restores all eight tables and round-trips a server export', async t => {
    const api = await backend(t);
    const data = structuredClone(fixture);
    data.achievements = { 'first_entry:1': '2026-09-30', 'level_rank:10': '2026-10-18' };
    assert.equal((await api.request('import', data)).status, 204);
    const exported = await (await api.request('state')).json();
    assert.deepEqual(exported, { ...data, foods: data.foods.map(f => ({ ...f, lastAmount: f.lastAmount ?? null })) });
    const before = api.snapshot();
    const newer = structuredClone(exported);
    newer.user.weight = 81;
    newer.water['2026-10-19'] = [{ id: 99, time: '12:34', ml: 500 }];
    assert.equal((await api.request('import', newer)).status, 204);
    assert.equal((await api.request('import', { schemaVersion: 1, exportedAt: new Date().toISOString(), ...exported })).status, 204);
    // AUTOINCREMENT may retain a higher counter after replacement; all business rows must match.
    const after = api.snapshot();
    delete before.sqlite_sequence; delete after.sqlite_sequence;
    assert.deepEqual(after, before);
    const next = api.sqlite.prepare("INSERT INTO water_log(date,time,ml) VALUES ('2026-10-20',NULL,250) RETURNING id").get();
    assert.ok(next.id > 99);
});

test('invalid and unauthorized imports never write, and database failures roll back deletions', async t => {
    const api = await backend(t);
    const before = api.snapshot();
    assert.equal((await api.request('import', fixture, 'wrong')).status, 401);
    for (const data of [{}, { ...fixture, water: null }, { ...fixture, schemaVersion: 9 }]) {
        assert.equal((await api.request('import', data)).status, 400);
        assert.deepEqual(api.snapshot(), before);
    }
    assert.equal(api.batches(), 0);
    api.fail(10);
    assert.equal((await api.request('import', fixture)).status, 500);
    assert.equal(api.batches(), 1);
    assert.deepEqual(api.snapshot(), before);
});

test('large imports use bounded JSON chunks within one transaction', async t => {
    const api = await backend(t);
    const data = structuredClone(fixture);
    data.diary = { '2026-10-18': Array.from({ length: 6000 }, (_, i) => ({
        ...fixture.diary['2026-10-18'][0], id: i + 1, name: '临时食物'.repeat(40)
    })) };
    assert.equal((await api.request('import', data)).status, 204);
    assert.equal(api.batches(), 1);
    const response = await api.request('state');
    assert.equal(response.status, 200);
    const restored = (await response.json()).diary['2026-10-18'];
    assert.equal(restored.length, data.diary['2026-10-18'].length);
    restored.forEach((row, i) => assert.deepEqual(row, data.diary['2026-10-18'][i]));
});

test('backup validation accepts current exports and versioned backups without altering data', () => {
    for (const data of [structuredClone(fixture), { schemaVersion: 1, exportedAt: new Date().toISOString(), ...structuredClone(fixture) }]) {
        const before = structuredClone(data);
        assert.equal(validateBackup(data), data);
        assert.deepEqual(data, before);
    }
});

test('backup validation rejects incomplete, corrupt and duplicate records', () => {
    const invalid = [
        d => { delete d.water; },
        d => { d.schemaVersion = 2; },
        d => { d.unrecognizedData = []; },
        d => { d.user.weight = '89'; },
        d => { d.user.lastWater.unit = 'cups'; },
        d => { d.foods[0].kcal = null; },
        d => { d.foods[0].id = '__proto__'; },
        d => { d.foods.push(d.foods[0]); },
        d => { d.diary['2026-10-18'][0].id = 1; },
        d => { d.diary['2026-10-18'][0].meal = '<script>'; },
        d => { d.diary['2026-02-30'] = []; },
        d => { d.weights.push(d.weights[0]); },
        d => { d.achievements['first_entry:1'] = 'not-a-date'; },
        d => { delete d.dayTypes.high; },
        d => { d.dayTypes.high.carbs = 501; },
        d => { d.dayPlan['2026-10-01'] = 'unknown'; },
        d => { d.water['2026-10-18'][0].time = '25:00'; },
        d => { d.water['2026-10-18'][0].ml = -1; },
        d => { d.water['2026-10-18'][0].id = 1; }
    ];
    for (const change of invalid) {
        const data = structuredClone(fixture);
        change(data);
        assert.throws(() => validateBackup(data), /未导入/, change.toString());
    }
    for (const data of [null, [], {}, 'backup']) assert.throws(() => validateBackup(data), /未导入/);
});
