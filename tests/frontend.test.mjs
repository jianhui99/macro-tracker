import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { createContext, SourceTextModule } from 'node:vm';

const root = new URL('../public/', import.meta.url);
const fixture = JSON.parse(await readFile(new URL('./fixtures/state.json', import.meta.url)));
// Golden results were captured from the original single-file implementation before extraction.
const expected = JSON.parse(await readFile(new URL('./fixtures/expected.json', import.meta.url)));
const plain = value => JSON.parse(JSON.stringify(value));

async function loadApp(overrides = {}) {
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) elements.set(id, {
            value: id === 'diary-date' ? '2026-10-18' : '', hidden: false, listeners: {}, children: [],
            addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
            showModal() { this.open = true; this.openCount = (this.openCount || 0) + 1; },
            close() { this.open = false; },
            appendChild(child) { this.children.push(child); },
            classList: { add() {} }, lastChild: {},
            querySelector(selector) { return element(`${id} ${selector}`); }
        });
        return elements.get(id);
    }
    const context = createContext({
        matchMedia: () => ({ matches: true }),
        localStorage: { getItem: () => null, setItem() {} },
        document: { getElementById: element, createElement: () => element('toast') },
        console: { error() {} }, setTimeout() {},
        fetch: async () => ({ ok: true, status: 200, json: async () => structuredClone(fixture) }),
        ...overrides
    });
    const modules = new Map();
    async function module(name) {
        if (!modules.has(name)) {
            const source = await readFile(new URL(`js/${name}`, root), 'utf8');
            modules.set(name, new SourceTextModule(source, { context, identifier: name }));
        }
        return modules.get(name);
    }
    async function get(name) {
        const mod = await module(name);
        if (mod.status === 'unlinked') await mod.link(specifier => module(specifier.slice(2)));
        if (mod.status === 'linked') await mod.evaluate();
        return mod.namespace;
    }
    return { get, element };
}

test('calculations match the original single-file baseline', async () => {
    const app = await loadApp();
    const store = await app.get('state.js');
    await store.loadState();
    const nutrition = await app.get('nutrition.js');
    const foods = await app.get('foods.js');
    const summary = await app.get('summary.js');
    const achievements = await app.get('achievements.js');
    const { state } = store;
    const actual = {
        plan: nutrition.computePlan(state.user),
        femalePlan: nutrition.computePlan({ ...state.user, gender: 'female', waterTarget: 2400 }),
        targets: ['2026-10-01', '2026-10-02', '2026-10-18'].map(nutrition.targetsFor),
        clamped: nutrition.applyOffset(nutrition.computePlan(state.user), { carbs: -999, fat: -999 }),
        statuses: [-301, -300, 0, 50, 51].map(diff => nutrition.kcalStatus(2000 + diff, 2000)),
        units: ['100g', '2粒', '份', '0g', '0.5L'].map(unit => [foods.unitBase(unit), foods.unitText(unit)]),
        scaled: foods.scaleFood(state.foods[0], 150),
        month: summary.periodStats('2026-10-01', '2026-10-31'),
        empty: summary.periodStats('2025-01-01', '2025-01-31'),
        water: summary.waterStats('2026-10-01', '2026-10-31'),
        achievements: achievements.evaluateAchievements(state.diary, state.weights, state.water, state.user, state.foods, nutrition.targetsFor, '2026-10-18')
    };
    assert.deepEqual(plain(actual), expected);
});

test('state replacement stays visible to already-imported consumers', async () => {
    const app = await loadApp();
    const nutrition = await app.get('nutrition.js');
    const store = await app.get('state.js');
    const initial = store.state;
    await store.loadState();
    assert.notEqual(store.state, initial);
    assert.deepEqual(plain(nutrition.targetsFor('2026-10-01')), expected.targets[0]);
    store.state.user.weight = 80;
    assert.equal(nutrition.targetsFor('2026-10-18').protein, 168);
});

test('local calendar dates round-trip without UTC conversion', async () => {
    const app = await loadApp();
    const helpers = await app.get('helpers.js');
    for (const date of ['2024-02-29', '2026-01-01', '2026-12-31']) {
        assert.equal(helpers.localDate(helpers.parseLocalDate(date)), date);
    }
});

test('concurrent 401 responses share one dialog and retry the original payload', async () => {
    const calls = [];
    const app = await loadApp({ fetch: async (url, options) => {
        calls.push({ url, ...options });
        return options.headers.Authorization === 'Bearer test-key'
            ? { ok: true, status: 204 }
            : { ok: false, status: 401 };
    } });
    const api = await app.get('api.js');
    api.initApi();
    const requests = [api.api('/api/one', 'POST', { amount: 1 }), api.api('/api/two', 'DELETE')];
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.element('key-dialog').openCount, 1);
    app.element('key-input').value = ' test-key ';
    let prevented = false;
    app.element('key-dialog form').listeners.submit[0]({ preventDefault() { prevented = true; } });
    assert.deepEqual(await Promise.all(requests), [null, null]);
    assert.equal(prevented, true);
    assert.equal(calls.length, 4);
    assert.deepEqual(calls.filter(c => c.url === '/api/one').map(c => c.body), ['{"amount":1}', '{"amount":1}']);
    assert.ok(calls.slice(2).every(c => c.headers.Authorization === 'Bearer test-key'));
});

test('API failures still reject and show an error without replacing state', async () => {
    for (const failure of ['http', 'network']) {
        const app = await loadApp({ fetch: async () => {
            if (failure === 'network') throw new Error('offline');
            return { ok: false, status: 500, text: async () => 'failed' };
        } });
        const store = await app.get('state.js');
        const initial = store.state;
        await assert.rejects(store.loadState());
        assert.equal(store.state, initial);
        assert.equal(app.element('toast-container').children.length, 1);
        assert.match(app.element('toast').className, /t-error/);
    }
});

test('HTML and rendered templates contain no inline event handlers', async () => {
    const html = await readFile(new URL('index.html', root), 'utf8');
    assert.match(html, /<script type="module" src="\/js\/app.js"><\/script>/);
    assert.match(html, /<link rel="stylesheet" href="\/css\/app.css">/);
    assert.doesNotMatch(html, /<style[\s>]|\sstyle\s*=/i);
    const sources = await Promise.all((await readdir(new URL('js/', root))).map(name => readFile(new URL(`js/${name}`, root), 'utf8')));
    for (const source of [html, ...sources]) {
        assert.doesNotMatch(source, /\son(?:click|change|submit|input|focus|keydown)\s*=/i);
        assert.doesNotMatch(source, /\beval\s*\(|new Function\s*\(|Object\.assign\(window/);
    }
});

test('calendar stars: one for recording, one for kcal in range, one for protein met', async () => {
    const app = await loadApp();
    const store = await app.get('state.js');
    await store.loadState();
    const nutrition = await app.get('nutrition.js');
    const date = '2030-01-01';
    const t = nutrition.targetsFor(date);
    const stars = (kcal, protein) => {
        store.state.diary[date] = [{ kcal, protein, carbs: 0, fat: 0 }];
        return nutrition.dayStars(date);
    };
    assert.equal(nutrition.dayStars('2030-01-02'), 0);
    assert.equal(stars(t.kcal, t.protein), 3);
    assert.equal(stars(t.kcal, t.protein - 1), 2);
    assert.equal(stars(t.kcal + 51, t.protein), 2);
    assert.equal(stars(t.kcal - 301, t.protein - 1), 1);
});

test('weight goal progress counts toward loss or gain goals and clamps', async () => {
    const app = await loadApp();
    const { weightProgress } = await app.get('settings.js');
    assert.equal(weightProgress(85, 81, 75), 0.4);
    assert.equal(weightProgress(60, 62, 65), 0.4);
    assert.equal(weightProgress(85, 74, 75), 1);
    assert.equal(weightProgress(85, 87, 75), 0);
    assert.equal(weightProgress(85, 80, null), null);
    assert.equal(weightProgress(80, 80, 80), null);
});
