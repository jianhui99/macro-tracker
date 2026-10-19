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
            setAttribute(name, value) { this[name] = value; },
            showModal() { this.open = true; this.openCount = (this.openCount || 0) + 1; },
            close() { this.open = false; (this.listeners.close || []).forEach(fn => fn()); },
            appendChild(child) { this.children.push(child); },
            get firstElementChild() { return { remove: () => this.children.shift() }; },
            click() { this.clicked = true; }, remove() {},
            classList: { add() {} }, lastChild: {},
            querySelector(selector) { return element(`${id} ${selector}`); }
        });
        return elements.get(id);
    }
    const context = createContext({
        matchMedia: () => ({ matches: true }),
        localStorage: { getItem: () => null, setItem() {} },
        document: { getElementById: element, createElement: tag => element(tag === 'a' ? 'download' : 'toast'), body: { appendChild() {} } },
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

test('export fetches fresh complete data and prevents duplicate downloads', async () => {
    let resolveFetch, blob, requests = 0;
    const app = await loadApp({
        Blob, URL: { createObjectURL(value) { blob = value; return 'blob:test'; }, revokeObjectURL() {} },
        fetch: async url => {
            assert.equal(url, '/api/state');
            requests++;
            await new Promise(resolve => { resolveFetch = resolve; });
            return { ok: true, status: 200, json: async () => structuredClone(fixture) };
        }
    });
    const { exportData } = await app.get('backup.js');
    const pending = exportData();
    assert.equal(app.element('export-data').disabled, true);
    await exportData();
    assert.equal(requests, 1);
    assert.equal(blob, undefined);
    resolveFetch();
    await pending;
    const { schemaVersion, exportedAt, ...data } = JSON.parse(await blob.text());
    assert.equal(schemaVersion, 1);
    assert.ok(Number.isFinite(Date.parse(exportedAt)));
    assert.deepEqual(data, fixture);
    assert.equal(app.element('download').clicked, true);
    assert.equal(app.element('export-data').disabled, false);
});

test('export failure never downloads defaults and releases the button', async () => {
    for (const failure of ['http', 'network']) {
        const app = await loadApp({ fetch: async () => {
            if (failure === 'network') throw new Error('offline');
            return { ok: false, status: 500, json: async () => ({ error: 'internal_error' }) };
        } });
        await (await app.get('backup.js')).exportData();
        assert.equal(app.element('download').clicked, undefined);
        assert.equal(app.element('export-data').disabled, false);
        assert.match(app.element('toast').className, /t-error/);
    }
});

test('import validates and previews before confirmation, blocks duplicates and reloads on success', async () => {
    let resolveFetch, reloads = 0;
    const calls = [];
    const app = await loadApp({
        location: { reload() { reloads++; } },
        fetch: async (url, options) => {
            calls.push({ url, ...options });
            await new Promise(resolve => { resolveFetch = resolve; });
            return { ok: true, status: 204 };
        }
    });
    const backup = await app.get('backup.js');
    backup.initBackup();
    app.element('import-file').files = [{ text: async () => JSON.stringify(fixture) }];
    await backup.previewImport();
    assert.equal(calls.length, 0);
    assert.equal(app.element('import-dialog').open, true);
    assert.match(app.element('import-summary').textContent, /饮食 6 条、饮水 3 条、体重 3 条/);
    const pending = backup.importData();
    await backup.importData();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/import');
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].body), fixture);
    assert.equal(app.element('confirm-import').disabled, true);
    assert.equal(app.element('cancel-import').disabled, true);
    let cancelled = false;
    app.element('import-dialog').listeners.cancel[0]({ preventDefault() { cancelled = true; } });
    assert.equal(cancelled, true);
    resolveFetch();
    await pending;
    assert.equal(reloads, 1);
    assert.equal(app.element('import-dialog').open, false);
});

test('invalid files and cancelling import leave server data untouched', async () => {
    let requests = 0;
    const app = await loadApp({ fetch: async () => { requests++; throw new Error('unexpected request'); } });
    const backup = await app.get('backup.js');
    backup.initBackup();
    for (const content of ['not json', '{}', JSON.stringify({ ...fixture, water: null })]) {
        app.element('import-file').files = [{ text: async () => content }];
        await backup.previewImport();
        assert.notEqual(app.element('import-dialog').open, true);
        assert.equal(app.element('import-data').disabled, false);
        assert.equal(app.element('import-file').value, '');
    }
    app.element('import-file').files = [{ text: async () => JSON.stringify(fixture) }];
    await backup.previewImport();
    app.element('cancel-import').listeners.click[0]();
    await backup.importData();
    assert.equal(requests, 0);
});

test('failed import keeps the confirmation open with an error and does not reload', async () => {
    const app = await loadApp({
        location: { reload() { assert.fail('must not reload on failure'); } },
        fetch: async () => ({ ok: false, status: 500, json: async () => ({ error: 'internal_error' }) })
    });
    const backup = await app.get('backup.js');
    backup.initBackup();
    app.element('import-file').files = [{ text: async () => JSON.stringify(fixture) }];
    await backup.previewImport();
    await backup.importData();
    assert.equal(app.element('import-dialog').open, true);
    assert.equal(app.element('import-error').hidden, false);
    assert.equal(app.element('confirm-import').disabled, false);
    assert.equal(app.element('cancel-import').disabled, false);
});

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

test('quotes display only Chinese and cycle once per local day across years', async () => {
    const pool = JSON.parse(await readFile(new URL('data/quote.json', root), 'utf8'));
    assert.equal(pool.quotes.length, 100);
    assert.equal(new Set(pool.quotes.map(quote => quote.id)).size, 100);
    assert.ok(pool.quotes.every(quote => typeof quote.zh === 'string' && quote.zh.trim()));
    let now = new Date(2026, 11, 31, 0, 1);
    const calls = [];
    const app = await loadApp({
        Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } },
        fetch: async (...args) => {
            calls.push(args);
            return { ok: true, json: async () => pool };
        }
    });
    const { loadQuote } = await app.get('quote.js');
    const { esc } = await app.get('helpers.js');
    const rendered = [];
    for (let day = 0; day <= pool.quotes.length; day++) {
        now = new Date(2026, 11, 31 + day, 0, 1);
        await loadQuote();
        const html = app.element('quote-text').innerHTML;
        const text = html.replace(/<[^>]*>/g, '');
        const quote = pool.quotes.find(quote => esc(quote.zh) === text);
        assert.ok(quote);
        assert.equal(app.element('quote-card').hidden, false);
        assert.equal(app.element('quote-card')['aria-busy'], 'false');
        rendered.push(text);
        now.setHours(23, 59);
        await loadQuote();
        assert.equal(app.element('quote-text').innerHTML, html);
    }
    assert.equal(new Set(rendered.slice(0, 100)).size, 100);
    assert.equal(rendered[0], rendered[100]);
    assert.ok(calls.every(args => args.length === 1 && args[0] === '/data/quote.json'));
});

test('quote loading hides the card on failure and escapes quote markup', async () => {
    for (const payload of [null, {}, { quotes: [] }, { quotes: [{ zh: '' }] }, { quotes: [{ zh: 1 }] }]) {
        const app = await loadApp({ fetch: async () => ({ ok: payload !== null, status: 500, json: async () => payload }) });
        await (await app.get('quote.js')).loadQuote();
        assert.equal(app.element('quote-card').hidden, true);
        assert.equal(app.element('quote-card')['aria-busy'], 'false');
    }
    const app = await loadApp({ fetch: async () => ({ ok: true, json: async () => ({ quotes: [{ zh: '<img src=x onerror=alert(1)>你好。', en: 'English' }] }) }) });
    await (await app.get('quote.js')).loadQuote();
    assert.match(app.element('quote-text').innerHTML, /&lt;img/);
    assert.doesNotMatch(app.element('quote-text').innerHTML, /<img|English/);
});

test('concurrent 401 responses leave once without replaying mutations under another account', async () => {
    const calls = [], redirects = [];
    const app = await loadApp({ location: { replace(url) { redirects.push(url); } }, fetch: async (url, options) => {
        calls.push({ url, ...options }); return { ok: false, status: 401 };
    } });
    (await app.get('session.js')).setSession({ account: { id: 'alice' }, csrf: 'csrf-a' });
    const { api } = await app.get('api.js');
    const results = await Promise.allSettled([api('/api/one', 'POST', { amount: 1 }), api('/api/two', 'DELETE')]);
    assert.ok(results.every(r => r.status === 'rejected'));
    assert.deepEqual(redirects, ['/login.html']);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(c => c.headers['X-Account-Id'] === 'alice' && c.headers['X-CSRF-Token'] === 'csrf-a'));
    assert.ok(calls.every(c => !c.headers.Authorization));
});

test('API failures still reject and show an error without replacing state', async () => {
    for (const failure of ['http', 'network']) {
        const app = await loadApp({ fetch: async () => {
            if (failure === 'network') throw new Error('offline');
            return { ok: false, status: 500, json: async () => ({ error: 'internal_error' }) };
        } });
        const store = await app.get('state.js');
        const initial = store.state;
        await assert.rejects(store.loadState());
        assert.equal(store.state, initial);
        assert.equal(app.element('toast-container').children.length, 1);
        assert.match(app.element('toast').className, /t-error/);
    }
});

test('an in-flight response cannot replace state after account changes', async () => {
    let resolve;
    const redirects = [];
    const app = await loadApp({ location: { replace(url) { redirects.push(url); } }, fetch: () => new Promise(done => { resolve = done; }) });
    const session = await app.get('session.js');
    session.setSession({ account: { id: 'alice' }, csrf: 'a' });
    const store = await app.get('state.js'), before = store.state;
    const pending = store.loadState();
    session.setSession({ account: { id: 'bob' }, csrf: 'b' });
    resolve({ status: 200, ok: true, json: async () => fixture });
    await assert.rejects(pending);
    assert.equal(store.state, before);
    assert.deepEqual(redirects, ['/login.html']);
});

test('storage and focus detect account changes between tabs', async () => {
    for (const event of ['storage', 'focus']) {
        const listeners = {}, redirects = [];
        const app = await loadApp({ window: { addEventListener(name, fn) { listeners[name] = fn; } },
            location: { replace(url) { redirects.push(url); } },
            fetch: async () => ({ ok: true, json: async () => ({ account: { id: 'bob' }, csrf: 'b' }) }) });
        const session = await app.get('session.js');
        session.setSession({ account: { id: 'alice' }, csrf: 'a' });
        session.initSession();
        await listeners[event]({ key: 'macro_tracker_account', newValue: 'bob' });
        assert.deepEqual(redirects, ['/login.html']);
    }
});

test('global reward changes affect stars, achievements and XP without changing nutrition targets or old medals', async () => {
    const app = await loadApp();
    const store = await app.get('state.js'); await store.loadState();
    const config = await app.get('rules.js');
    const nutrition = await app.get('nutrition.js');
    const level = await app.get('level.js');
    const achievements = await app.get('achievements.js');
    const plan = plain(nutrition.targetsFor('2026-10-17'));
    const oldMedals = plain(store.state.achievements);
    store.state.diary = { '2026-10-17': [{ kcal: plan.kcal, protein: plan.protein / 2, carbs: 0, fat: 0 }] };
    assert.equal(nutrition.dayStars('2026-10-17'), 2);
    config.setRules({ ...config.DEFAULT_RULES, proteinPercent: 50, star: 25, levelBase: 1, levelStep: 0 }, 1);
    assert.equal(nutrition.dayStars('2026-10-17'), 3);
    assert.deepEqual(plain(nutrition.targetsFor('2026-10-17')), plan);
    assert.deepEqual(plain(store.state.achievements), oldMedals);
    assert.equal(level.levelFor(1000000000).level, 1000000001);
    assert.equal(level.XP.star, 25);
    const stats = achievements.evaluateAchievements(store.state.diary, [], {}, store.state.user, [], nutrition.targetsFor, '2026-10-18');
    assert.equal(stats.star_days.value, 1);
    assert.equal(stats.star_total.value, 3);
    for (const changes of [{ levelBase: 0 }, { proteinPercent: 201 }, { star: -1 }, { levelStep: 0.5 }, { arbitrary: 2 }]) {
        assert.equal(config.validateRules({ ...config.DEFAULT_RULES, ...changes }), false);
    }
    config.setRules({ ...config.DEFAULT_RULES, kcalBelow: 10, kcalAbove: 20 }, 2);
    assert.equal(nutrition.kcalStatus(plan.kcal - 11, plan.kcal), 'under');
    assert.equal(nutrition.kcalStatus(plan.kcal + 21, plan.kcal), 'over');
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

test('star achievements count finished days, and today only earns its recording star', async () => {
    const app = await loadApp();
    const { evaluateAchievements } = await app.get('achievements.js');
    const targets = { kcal: 2000, protein: 150, carbs: 200, fat: 60, water: 2000 };
    const day = (kcal, protein) => [{ meal: 'lunch', kcal, protein, carbs: 0, fat: 0 }];
    const diary = {
        '2030-01-01': day(2000, 150), // 3 stars
        '2030-01-02': day(2000, 100), // 2 stars, breaks the streak
        '2030-01-03': day(2000, 150), // 3 stars
        '2030-01-04': day(1900, 160), // 3 stars
        '2030-01-05': day(2000, 150)  // today: unfinished, recording star only
    };
    const p = evaluateAchievements(diary, [], {}, { height: 175 }, [], () => targets, '2030-01-05');
    assert.equal(p.star_streak.value, 2);
    assert.equal(p.star_days.value, 3);
    assert.equal(p.star_total.value, 12);
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

test('level curve: Lv L to L+1 costs 100 + 25 x (L - 1) XP', async () => {
    const app = await loadApp();
    const { levelFor, levelStart } = await app.get('level.js');
    assert.deepEqual(plain(levelFor(0)), { level: 1, into: 0, need: 100, title: '新手村民', metal: '' });
    assert.equal(levelFor(99).level, 1);
    assert.deepEqual(plain(levelFor(100)), { level: 2, into: 0, need: 125, title: '拾荒学徒', metal: '' });
    assert.equal(levelFor(549).level, 4);
    assert.equal(levelFor(550).title, '见习冒险者');
    assert.equal(levelFor(1800).metal, 'bronze');
    assert.deepEqual([levelFor(13049).level, levelFor(13050).level, levelFor(13050).metal], [29, 30, 'diamond']);
    assert.deepEqual([levelFor(13050).title, levelFor(13050 + 825).title], ['钻石传奇', '钻石传奇 +1']);
    for (const level of [1, 2, 5, 10, 30, 31]) assert.equal(levelFor(levelStart(level)).level, level);
});

test('XP sums stars, water, weigh-ins and unlocked medal tiers', async () => {
    const app = await loadApp();
    const store = await app.get('state.js');
    await store.loadState();
    const nutrition = await app.get('nutrition.js');
    const { xpTotals } = await app.get('level.js');
    const day = '2030-01-01';
    const t = nutrition.targetsFor(day);
    Object.assign(store.state, {
        diary: { [day]: [{ kcal: t.kcal, protein: t.protein, carbs: 0, fat: 0 }] },
        water: { [day]: [{ ml: t.water }], '2030-01-02': [{ ml: 1 }] },
        weights: [{ date: '2030-01-03', weight: 80 }],
        // record_streak has 7 tiers: the first is bronze, the last diamond
        achievements: { 'record_streak:3': day, 'record_streak:365': '2030-01-03', 'gone:1': day }
    });
    assert.deepEqual(plain(xpTotals(day)), { total: 30 + 10 + 5 + 50 + 400, today: 30 + 10 + 50 });
});

test('level badge unlocks from replayed XP and its own tiers give no XP', async () => {
    const app = await loadApp();
    const store = await app.get('state.js');
    await store.loadState();
    const nutrition = await app.get('nutrition.js');
    const helpers = await app.get('helpers.js');
    const { evaluateAchievements } = await app.get('achievements.js');
    const { xpTotals, levelFor } = await app.get('level.js');
    const diary = {};
    const d = helpers.parseLocalDate('2030-01-01');
    for (let i = 0; i < 60; i++, d.setDate(d.getDate() + 1)) {
        const t = nutrition.targetsFor(helpers.localDate(d));
        diary[helpers.localDate(d)] = [{ kcal: t.kcal, protein: t.protein, carbs: 0, fat: 0, meal: 'lunch' }];
    }
    const { level_rank } = evaluateAchievements(diary, [], {}, store.state.user, [], nutrition.targetsFor, helpers.localDate(d));
    assert.ok(level_rank.value >= 10);
    assert.ok(level_rank.reached.length >= 1 && level_rank.reached[0] > '2030-01-01');

    Object.assign(store.state, { diary: {}, water: {}, weights: [], achievements: { 'level_rank:10': '2030-01-01', 'level_rank:30': '2030-01-01' } });
    assert.equal(xpTotals('2030-01-01').total, 0);
    assert.equal(levelFor(0).level, 1);
});

test('food sprites are complete 16x16 grids and keywords beat the macro fallback', async () => {
    const { SPRITES, spriteKey, spriteSvg } = await (await loadApp()).get('sprites.js');
    for (const [key, { pal, px }] of Object.entries(SPRITES)) {
        assert.equal(px.length, 16, key);
        for (const row of px) {
            assert.equal(row.length, 16, `${key}: ${row}`);
            for (const ch of row) assert.ok(ch === '.' || ch === 'k' || pal[ch], `${key}: unknown colour ${ch}`);
        }
        assert.match(spriteSvg(key), /^<svg viewBox="0 0 16 16"[^>]*>(<rect [^>]+\/>)+<\/svg>$/);
    }
    const cases = {
        鸡胸肉: 'meat', 鸡蛋: 'egg', 牛奶: 'milk', 乳清蛋白粉: 'shake', 蛋糕: 'sweet', 饼干: 'sweet',
        牛油果: 'fruit', 橄榄油: 'oil', 油条: 'bread', 土豆: 'potato', 豆腐: 'tofu', 四季豆: 'veg',
        全麦面包: 'bread', 牛肉面: 'noodle', 米粉: 'noodle', 米饭: 'rice', 燕麦片: 'oats', 玉米: 'corn',
        猪里脊: 'pork', 培根: 'pork', 牛排: 'meat',
        酱油: 'sauce', 蚝油: 'sauce', 番茄酱: 'sauce', 蛋黄酱: 'sauce', 花生酱: 'sauce', 香醋: 'sauce', 酱牛肉: 'meat',
        三文鱼: 'fish', 杏仁: 'nuts', 西兰花: 'veg', 黄瓜: 'veg', 西瓜: 'fruit', 美式咖啡: 'drink'
    };
    for (const [name, key] of Object.entries(cases)) assert.equal(spriteKey({ name, category: '' }, 'kcal'), key, name);
    // The category wins over the name; a category with no keyword (蛋白质 is not an egg) defers to the name
    assert.equal(spriteKey({ name: '里脊', category: '猪肉类' }, 'protein'), 'pork');
    assert.equal(spriteKey({ name: '鸡蛋燕麦', category: '燕麦类' }, 'carbs'), 'oats');
    assert.equal(spriteKey({ name: '鸡蛋', category: '蛋白质' }, 'protein'), 'egg');
    assert.equal(spriteKey({ name: '芝麻油', category: '酱类' }, 'fat'), 'sauce');
    assert.equal(spriteKey({ name: '神秘食物', category: '蛋白质' }, 'protein'), 'meat');
    assert.equal(spriteKey({ name: '神秘食物', category: '其他' }, 'carbs'), 'rice');
    assert.equal(spriteKey({ name: '神秘食物', category: '' }, 'fat'), 'oil');
    assert.equal(spriteKey({ name: '神秘食物' }, 'kcal'), 'sweet');
});
