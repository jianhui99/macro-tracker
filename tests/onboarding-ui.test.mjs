import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

async function guide(initial, { failSave = false, missingDriver = false } = {}) {
    let data = structuredClone(initial), config, tour, widget, fail = failSave;
    const nodes = new Map(), writes = [];
    const element = id => {
        if (!nodes.has(id)) nodes.set(id, { hidden: true, handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; },
            getClientRects: () => [{}], closest: () => null, focus() {}, click() {}, setAttribute() {}, remove() {} });
        return nodes.get(id);
    };
    const api = async (_url, method, body) => {
        if (method === 'PATCH') {
            writes.push(structuredClone(body));
            if (fail) throw new Error('offline');
            data = { enabled: data.enabled || !!body.enabled, presented: data.presented || !!body.presented,
                completed: [...new Set([...data.completed, ...body.completed.filter(id => ['targets', 'growth'].includes(id))])] };
        }
        return structuredClone(data);
    };
    const window = { addEventListener() {}, driver: { js: { driver: value => { tour = value; return { drive() {} }; } } },
        driverChecklist: { checklist: value => {
            config = value;
            const completed = new Set(config.completed);
            widget = { visible: false, opened: false, show() { this.visible = true; }, hide() { this.visible = false; },
                open() { this.opened = true; }, close() { this.opened = false; },
                complete(id) { completed.add(id); }, completed };
            return widget;
        } } };
    if (missingDriver) delete window.driver;
    const context = createContext({ window, document: { querySelector: element, querySelectorAll: () => [],
        createElement: () => element('script'), head: { append: node => node.onerror() } },
        requestAnimationFrame: fn => fn(), setTimeout: () => 1, clearTimeout() {} });
    const stubs = { './api.js': { api }, './helpers.js': { $: element, reduceMotion: { matches: true } },
        './i18n.js': { lang: 'zh', lookup: value => value } };
    const mod = new SourceTextModule(await readFile(new URL('../public/js/onboarding.js', import.meta.url), 'utf8'), { context });
    await mod.link(name => new SyntheticModule(Object.keys(stubs[name]), function () {
        for (const [key, value] of Object.entries(stubs[name])) this.setExport(key, value);
    }, { context }));
    await mod.evaluate();
    await mod.namespace.initOnboarding(() => {});
    const settle = () => new Promise(resolve => setImmediate(resolve));
    return { nodes, writes, get data() { return data; }, get widget() { return widget; },
        setFail: value => { fail = value; },
        start: async id => { config.items.find(item => item.id === id).action(); await settle(); },
        end: async reason => { tour.onDestroyStarted(null, null, { reason, driver: { destroy() {} } }); await settle(); },
        retry: () => element('retry-onboarding').handlers.click(),
        open: () => element('open-onboarding').handlers.click() };
}

test('new users see the checklist once, existing users opt in', async () => {
    const fresh = await guide({ enabled: true, presented: false, completed: [] });
    assert.equal(fresh.widget.opened, true);
    const returning = await guide({ enabled: true, presented: true, completed: ['targets'] });
    assert.equal(returning.widget.opened, false);
    const old = await guide({ enabled: false, presented: false, completed: [] });
    assert.equal(old.widget, undefined);
    assert.equal(old.writes.length, 0);
    await old.open();
    assert.equal(old.widget.opened, true);
    assert.equal(old.data.enabled, true);
});

test('closing a tour and finishing a practice tour do not complete a task', async () => {
    const ui = await guide({ enabled: true, presented: true, completed: [] });
    await ui.start('targets');
    await ui.end('close');
    await ui.start('meal');
    await ui.end('done');
    await ui.start('water');
    await ui.end('done');
    assert.deepEqual(ui.data.completed, []);
    await ui.start('targets');
    await ui.end('done');
    assert.deepEqual(ui.data.completed, ['targets']);
});

test('failed progress remains pending and retry saves it without repeating the tour', async () => {
    const ui = await guide({ enabled: true, presented: true, completed: [] });
    ui.setFail(true);
    await ui.start('growth');
    await ui.end('done');
    assert.deepEqual(ui.data.completed, []);
    assert.equal(ui.nodes.get('onboarding-error').hidden, false);
    ui.setFail(false);
    await ui.retry();
    assert.deepEqual(ui.data.completed, ['growth']);
    assert.equal(ui.nodes.get('onboarding-error').hidden, true);
});

test('a missing library does not reject app initialization, and completed users see no launcher', async () => {
    const missing = await guide({ enabled: true, presented: false, completed: [] }, { missingDriver: true });
    assert.equal(missing.nodes.get('onboarding-error').hidden, false);
    const done = await guide({ enabled: true, presented: true, completed: ['targets', 'meal', 'water', 'growth'] });
    assert.equal(done.widget, undefined);
});
