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

async function tooltipUi() {
    const listeners = new Map();
    const surface = name => ({ addEventListener(type, fn) { listeners.set(`${name}:${type}`, fn); } });
    const main = surface('main');
    const app = await loadApp({
        document: { ...surface('document'), querySelector: () => main, getElementById: () => app.element('float-tip') },
        window: surface('window'), innerWidth: 390
    });
    const tip = app.element('float-tip');
    Object.assign(tip, { hidden: true, style: {}, offsetWidth: 160, offsetHeight: 40 });
    const ui = await app.get('ui.js');
    ui.initTips();
    const hint = text => ({ dataset: { tip: text },
        closest(selector) { return ['.hint-info', '[data-tip]'].includes(selector) ? this : null; },
        getBoundingClientRect: () => ({ left: 100, top: 100, bottom: 124, width: 24 }) });
    const outside = { closest: () => null };
    const fire = (name, type, target = outside, extra = {}) => {
        const event = { target, preventDefault() { this.defaultPrevented = true; }, ...extra };
        listeners.get(`${name}:${type}`)?.(event);
        return event;
    };
    const click = target => {
        const event = fire('main', 'click', target);
        listeners.get('document:click')?.(event);
        return event;
    };
    return { tip, ui, hint, fire, click, outside };
}

test('touch hints stay open after release, toggle and switch without activating their label', async () => {
    const { tip, hint, fire, click } = await tooltipUi();
    const first = hint('First'), second = hint('Second');
    const tap = target => {
        fire('main', 'pointerover', target, { pointerType: 'touch' });
        fire('main', 'pointerleave', target, { pointerType: 'touch' });
        return click(target);
    };
    assert.equal(tap(first).defaultPrevented, true);
    assert.equal(tip.hidden, false);
    fire('main', 'pointerleave', first, { pointerType: 'touch' });
    assert.equal(tip.hidden, false);
    tap(second);
    assert.equal(tip.innerHTML, 'Second');
    assert.equal(tip.hidden, false);
    tap(second);
    assert.equal(tip.hidden, true);
});

test('hints dismiss on outside click, nested scroll, Escape and explicit navigation cleanup', async () => {
    const { tip, ui, hint, fire, click, outside } = await tooltipUi();
    const target = hint('Hint');
    for (const dismiss of [() => click(outside), () => fire('document', 'scroll'),
        () => fire('document', 'keydown', outside, { key: 'Escape' }), () => ui.hideFloatTip()]) {
        click(target);
        assert.equal(tip.hidden, false);
        dismiss();
        assert.equal(tip.hidden, true);
        click(target);
        assert.equal(tip.hidden, false);
        ui.hideFloatTip();
    }
});

test('mouse hover, chart tooltips and keyboard focus still work', async () => {
    const { tip, ui, hint, fire, click, outside } = await tooltipUi();
    const target = hint('Hint');
    fire('main', 'pointerover', target, { pointerType: 'mouse' });
    assert.equal(tip.hidden, false);
    fire('main', 'pointerleave', target, { pointerType: 'mouse' });
    assert.equal(tip.hidden, true);
    fire('main', 'focusin', target);
    assert.equal(tip.hidden, false);
    fire('main', 'focusout', target);
    assert.equal(tip.hidden, true);
    click(target);
    fire('main', 'focusin', outside);
    assert.equal(tip.hidden, true);
    click(target);
    ui.showFloatTipAt('Chart', 100, 100);
    fire('main', 'pointerover', outside, { pointerType: 'mouse' });
    assert.equal(tip.hidden, true);
    const chart = { ...target, closest: selector => selector === '[data-tip]' ? chart : null };
    fire('main', 'pointerover', chart, { pointerType: 'touch' });
    assert.equal(tip.hidden, false);
    fire('main', 'pointerleave', chart, { pointerType: 'touch' });
    assert.equal(tip.hidden, true);
});

test('avatar traits are stable, bounded and ignore incomplete or invalid attributes', async () => {
    const { avatarTraits, CLASSES } = await (await loadApp()).get('avatar.js');
    const profile = { height: '170', weight: '64', age: '27', gender: 'female', activity: '1.55' };
    assert.deepEqual(plain(avatarTraits(profile)), plain(avatarTraits({ ...profile, height: 170, weight: 64, age: 27, activity: 1.55 })));
    assert.deepEqual(plain(avatarTraits({})), { height: 'normal', build: 'normal', age: 'neutral', gender: 'neutral', job: '', skin: 0 });
    for (const skin of [0, 31, 2.5, '3', null]) assert.equal(avatarTraits({ skin }).skin, 0);
    for (const skin of [1, 30]) assert.equal(avatarTraits({ skin }).skin, skin);
    assert.deepEqual(plain(avatarTraits({ height: '', weight: Infinity, age: 25.5, gender: 'invalid', activity: '__proto__' })), plain(avatarTraits({})));
    assert.equal(avatarTraits({ height: 100, weight: 400 }).build, 'broad');
    assert.equal(avatarTraits({ height: 250, weight: 20 }).build, 'slim');
    assert.equal(avatarTraits({ height: 170, weight: 64 }).build, 'normal');
    assert.equal(avatarTraits({ height: 99, weight: 64 }).build, 'normal');
    for (const [height, bucket] of [[159, 'short'], [160, 'normal'], [180, 'normal'], [181, 'tall']]) assert.equal(avatarTraits({ height }).height, bucket);
    assert.equal(avatarTraits({ age: 17 }).age, 'young');
    assert.equal(avatarTraits({ age: 18 }).age, 'adult');
    assert.equal(avatarTraits({ age: 50 }).age, 'mature');
    for (const job of Object.keys(CLASSES)) assert.equal(avatarTraits({ activity: job }).job, job);
});

test('peeking home avatar is cropped at the card edge, grips it with both hands and escapes its tip', async () => {
    const { renderAvatar } = await (await loadApp()).get('avatar.js');
    const nodes = { b: {}, '.avatar-caption span': {} };
    let html = '';
    const container = { dataset: { pose: 'peek', tip: '' }, set innerHTML(value) { html = value; }, querySelector(selector) { return nodes[selector]; } };
    for (const height of [150, 170, 200]) {
        renderAvatar(container, { height, weight: 64, age: 27, gender: 'female', activity: '1.725' }, '<b>"Feiii"</b>');
        const [, top, rows] = html.match(/viewBox="0 (\d+) 32 (\d+)"/).map(Number);
        assert.equal(rows, 21);
        const edge = top + 19;
        assert.match(html, new RegExp(`height="${edge - top}" viewBox="0 ${top} 32 ${edge - top}"`));
        assert.equal(html.match(new RegExp(`translate\\(\\d+ ${edge - 2}\\)" class="avatar-hand"`, 'g')).length, 2);
        assert.doesNotMatch(html, /avatar-gear/);
    }
    assert.equal(container.dataset.tip, '&lt;b&gt;&quot;Feiii&quot;&lt;/b&gt; · 战士');
});

test('avatar updates safely and retains its animation DOM when appearance is unchanged', async () => {
    const { renderAvatar, CLASSES } = await (await loadApp()).get('avatar.js');
    const nodes = { b: {}, '.avatar-caption span': {} };
    let html = '', writes = 0;
    const container = {
        dataset: {},
        set innerHTML(value) { html = value; writes++; },
        querySelector(selector) { return nodes[selector]; }
    };
    const profile = { height: 170, weight: 64, age: 27, gender: 'male', activity: 1.55 };
    const nickname = '<img src=x onerror=alert(1)>';
    renderAvatar(container, profile, nickname);
    assert.equal(nodes.b.textContent, nickname);
    assert.ok(!html.includes(nickname));
    renderAvatar(container, { ...profile }, nickname);
    assert.equal(writes, 1);
    const original = html;
    renderAvatar(container, { ...profile, weight: 90 }, nickname);
    assert.notEqual(html, original);
    renderAvatar(container, { ...profile, gender: 'female' }, nickname);
    assert.notEqual(html, original);
    const variants = [];
    for (const activity of Object.keys(CLASSES)) {
        renderAvatar(container, { ...profile, activity }, nickname);
        assert.equal(nodes['.avatar-caption span'].textContent, CLASSES[activity][0]);
        assert.ok(!html.includes('undefined'));
        assert.match(html, /shape-rendering="crispEdges"/);
        assert.doesNotMatch(html, /<(?:circle|ellipse)\b/);
        variants.push(html);
    }
    assert.equal(new Set(variants).size, 4);
    renderAvatar(container, profile, 'Updated');
    assert.equal(nodes.b.textContent, 'Updated');
});

test('avatar pixel parts use rectangular grids with complete palette keys', async () => {
    const { AVATAR_PARTS } = await (await loadApp()).get('avatar.js');
    for (const [name, rows] of Object.entries(AVATAR_PARTS)) {
        assert.ok(rows.length > 0, name);
        for (const row of rows) {
            assert.equal(row.length, rows[0].length, name);
            assert.match(row, /^[.khHsSwcClgGbBpPaAryYdDez]+$/, name);
        }
    }
});

test('saved profile refreshes the home and character-sheet avatars from current state including weight changes', async () => {
    const app = await loadApp({ cancelAnimationFrame() {} });
    const store = await app.get('state.js');
    const session = await app.get('session.js');
    session.setSession({ account: { id: 'hero', nickname: 'Hero' } });
    const home = app.element('home-avatar');
    const sheet = app.element('char-avatar');
    home.dataset = {};
    sheet.dataset = {};
    app.element('char-panel').classList.remove = () => {};
    for (const id of ['plan-bmr', 'plan-tdee', 'plan-kcal', 'plan-deficit']) app.element(id).dataset = {};
    app.element('pool-bar').style = { setProperty() {} };
    app.element('split-bar').querySelectorAll = () => [];
    const { fillSettingsForm } = await app.get('settings.js');
    store.state.user = { height: 170, weight: 64, age: 27, gender: 'male', activity: 1.2 };
    fillSettingsForm();
    const first = home.innerHTML;
    assert.equal(home.querySelector('.avatar-caption span').textContent, '学者');
    store.state.user = { ...store.state.user, weight: 100, activity: 1.725 };
    fillSettingsForm();
    assert.notEqual(home.innerHTML, first);
    assert.equal(home.querySelector('.avatar-caption span').textContent, '战士');
    assert.equal(sheet.querySelector('.avatar-caption span').textContent, '战士');
    store.state.user = { ...store.state.user, weight: 64, activity: 1.2 };
    fillSettingsForm();
    assert.equal(home.innerHTML, first);
    assert.equal(sheet.querySelector('.avatar-caption span').textContent, '学者');
});

test('nickname changes reach the avatar only after a successful save', async () => {
    for (const ok of [true, false]) {
        const app = await loadApp({ fetch: async () => ({ ok, status: ok ? 200 : 500, json: async () => ({ ok }) }) });
        const session = await app.get('session.js');
        session.setSession({ account: { id: 'hero', nickname: 'Before', username: 'hero', role: 'user' } });
        app.element('home-avatar').dataset = {};
        app.element('char-avatar').dataset = {};
        (await app.get('account.js')).initAccount();
        app.element('account-nickname').value = '  After  ';
        app.element('account-form').listeners.submit[0]({ preventDefault() {} });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(session.account.nickname, ok ? 'After' : 'Before');
        assert.equal(app.element('home-avatar').querySelector('b').textContent, ok ? 'After' : undefined);
        assert.equal(app.element('char-avatar').querySelector('b').textContent, ok ? 'After' : undefined);
        assert.equal(app.element('save-nickname').disabled, false);
    }
});

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

test('BMI medals require a drop from the first weigh-in across each threshold', async () => {
    const app = await loadApp();
    const { evaluateAchievements } = await app.get('achievements.js');
    const evaluate = values => evaluateAchievements({}, values.map((bmi, i) => ({
        date: `2030-01-0${i + 1}`, weight: bmi * 4
    })), {}, { height: 200 }, [], () => ({ kcal: 2000, protein: 150, carbs: 200, fat: 60, water: 2000 }), '2030-01-08');
    assert.deepEqual(plain(evaluate([22]).bmi.reached), []);
    assert.deepEqual(plain(evaluate([26]).bmi.reached), []);
    assert.deepEqual(plain(evaluate([22, 29, 23]).bmi.reached), []);
    assert.deepEqual(plain(evaluate([28, 28, 27.9, 24, 23.9]).bmi.reached), ['2030-01-03', '2030-01-05']);
    assert.deepEqual(plain(evaluate([30, 23]).bmi.reached), ['2030-01-02', '2030-01-02']);
    const secondOnly = evaluate([26, 23]);
    assert.equal(secondOnly.bmi.reached[0], undefined);
    assert.equal(secondOnly.bmi.reached[1], '2030-01-02');
    assert.equal(evaluate([22]).level_rank.value, 1);
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

test('BMI display supports the second tier alone and preserves existing medal XP', async () => {
    const app = await loadApp({
        document: {
            getElementById: id => app.element(id),
            querySelector: () => ({ value: 'all' }),
            querySelectorAll: () => []
        }
    });
    const store = await app.get('state.js');
    await store.loadState();
    const { state } = store;
    Object.assign(state, {
        diary: {}, water: {}, foods: [], user: { ...fixture.user, height: 200 },
        weights: [{ date: '2020-01-01', weight: 104 }, { date: '2020-01-02', weight: 92 }],
        achievements: { 'bmi:24': '2020-01-02' }
    });
    const { renderAchievements, evaluateAchievements, ACHIEVEMENTS } = await app.get('achievements.js');
    app.element('badge-grid').classList.remove = () => {};
    renderAchievements();
    const bmiCard = app.element('badge-grid').innerHTML.match(/<li class="badge m-diamond[^>]*data-id="bmi">[\s\S]*?<\/li>/);
    assert.ok(bmiCard);
    assert.match(bmiCard[0], /首次称重已达标的档位不重复奖励/);
    assert.doesNotMatch(bmiCard[0], /已满级/);
    const { targetsFor } = await app.get('nutrition.js');
    const p = evaluateAchievements({}, state.weights, {}, state.user, [], targetsFor, '2020-01-02');
    const bmi = ACHIEVEMENTS.find(a => a.id === 'bmi');
    const unlocks = [bmi].flatMap(a => p[a.id].reached.map((date, i) => ({ id: `${a.id}:${a.tiers[i]}`, date })));
    assert.deepEqual(plain(unlocks), [{ id: 'bmi:24', date: '2020-01-02' }]);
    state.weights = [{ date: '2020-01-01', weight: 88 }];
    state.achievements = { 'bmi:28': '2020-01-01', 'bmi:24': '2020-01-01' };
    const { xpTotals, XP } = await app.get('level.js');
    const before = plain(state.achievements);
    renderAchievements();
    assert.deepEqual(plain(state.achievements), before);
    assert.equal(xpTotals().total, XP.weigh + XP.medal.bronze + XP.medal.diamond);
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

test('every icon the pages request has a 12x12 pixel drawing', async () => {
    const { ICONS } = await import('../public/js/pixel-icons.js');
    const pages = await Promise.all(['public/index.html', 'public/login.html', 'lib/admin-page.js']
        .map(file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')));
    const requested = pages.flatMap(page => [...page.matchAll(/icon_names=([a-z_,0-9]+)/g)]).flatMap(match => match[1].split(','));
    assert.ok(requested.length > 50);
    for (const name of requested) assert.ok(Object.hasOwn(ICONS, name), `${name} has no pixel drawing`);
    for (const [name, rows] of Object.entries(ICONS)) {
        assert.equal(rows.length, 12, name);
        for (const row of rows) assert.match(row, /^[#.]{12}$/, name);
    }
});
