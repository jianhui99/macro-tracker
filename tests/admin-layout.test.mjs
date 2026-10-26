import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { adminHtml } from '../lib/admin-page.js';

test('admin confirmation uses the shared dialog layout', () => {
    const html = adminHtml('panel');
    assert.match(html, /<dialog id="confirm-dialog" class="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-message"><form method="dialog" class="dialog-body">/);
    assert.match(html, /<h3 class="dialog-title" id="confirm-title">确认操作<\/h3>/);
    assert.match(html, /<div class="dialog-foot"><button class="btn btn-ghost" value="cancel">取消<\/button><button class="btn" value="ok">确认<\/button>/);
});

test('admin navigation selects one section, supports history and preserves unsaved fields', async () => {
    const html = adminHtml('panel');
    const sections = [...html.matchAll(/class="panel admin-section" id="([^"]+)"/g)].map(([, id]) => ({ id }));
    const links = [...html.matchAll(/<a href="(#[^"]+)"/g)].map(([, href]) => ({
        href, getAttribute() { return this.href; },
        setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; }
    }));
    assert.equal(sections.length, 4);
    assert.equal(links.length, 4);
    const fields = new Map();
    const element = id => {
        if (!fields.has(id)) fields.set(id, { addEventListener() {}, value: '' });
        return fields.get(id);
    };
    const events = {};
    const location = { hash: '#rules' };
    const context = createContext({
        document: { body: { dataset: { adminStage: 'panel' } }, querySelectorAll: selector => selector === '.admin-section' ? sections : links, addEventListener() {} },
        window: { addEventListener(name, callback) { events[name] = callback; } }, location
    });
    const noop = () => {};
    const mocks = {
        './api.js': { api: async () => ({ users: [], invites: [], rules: {}, logs: [] }), errorMessage: value => value },
        './session.js': { loadSession: async () => {}, initSession: noop, account: { id: 'owner' } },
        './i18n.js': { startI18n: noop, toggleLang: noop, lookup: noop, lang: 'zh' },
        './pixel-icons.js': { startPixelIcons: noop },
        './ui.js': { showConfirm: noop, showToast: noop, withBusy: noop },
        './helpers.js': { $: element, esc: value => value, fmt1: String, localDate: () => '2026-10-26' },
        './nutrition.js': { MEAL_ORDER: [], MEALS: {}, sumEntries: noop },
        './rules.js': { RULE_LABELS: {}, ruleBounds: noop }
    };
    const module = new SourceTextModule(await readFile(new URL('../public/js/admin.js', import.meta.url), 'utf8'), { context });
    await module.link(name => new SyntheticModule(Object.keys(mocks[name]), function () {
        for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
    }, { context }));
    await module.evaluate();
    const check = id => {
        assert.deepEqual(sections.filter(section => !section.hidden).map(section => section.id), [id]);
        assert.deepEqual(links.filter(link => link['aria-current'] === 'page').map(link => link.href), [`#${id}`]);
    };
    check('rules');
    element('rule-fields').value = 'unsaved';
    for (const hash of ['#invites', '#audit', '#users', '#rules', '#unknown', '']) {
        location.hash = hash;
        events.hashchange();
        check(['#unknown', ''].includes(hash) ? 'users' : hash.slice(1));
    }
    assert.equal(element('rule-fields').value, 'unsaved');
    for (const stage of ['denied', 'login']) assert.doesNotMatch(adminHtml(stage), /admin-shell|admin-nav/);
});

test('admin food viewer renders escaped meals, changes dates and ignores stale responses', async () => {
    const fields = new Map(), requests = [];
    const noop = () => {};
    const element = id => {
        if (!fields.has(id)) fields.set(id, { listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, scrollIntoView: noop });
        return fields.get(id);
    };
    const entry = { meal: 'lunch', name: '<img src=x onerror=alert(1)>', displayAmount: '<100g>', kcal: 120, protein: 23, carbs: 0, fat: 1 };
    const context = createContext({
        document: { body: { dataset: { adminStage: 'panel' } }, querySelectorAll: () => [], addEventListener: noop },
        window: { addEventListener: noop }, location: { hash: '#users' }
    });
    const mocks = {
        './api.js': { api: path => path === '/api/admin/state' ? Promise.resolve({
            users: [{ id: 'owner', nickname: 'Owner' }, { id: 'friend', nickname: '<Friend>' }], invites: [], rules: {}, logs: []
        }) : new Promise((resolve, reject) => requests.push({ path, resolve, reject })), errorMessage: () => '加载失败' },
        './session.js': { loadSession: async () => {}, initSession: noop, account: { id: 'owner' } },
        './i18n.js': { startI18n: noop, toggleLang: noop, lookup: noop, lang: 'zh' },
        './pixel-icons.js': { startPixelIcons: noop },
        './ui.js': { showConfirm: noop, showToast: noop, withBusy: noop },
        './helpers.js': { $: element, esc: value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'), fmt1: String, localDate: () => '2026-10-26' },
        './rules.js': { RULE_LABELS: {}, ruleBounds: noop },
        './nutrition.js': { MEAL_ORDER: ['lunch'], MEALS: { lunch: { label: '午餐' } }, sumEntries: () => entry }
    };
    const module = new SourceTextModule(await readFile(new URL('../public/js/admin.js', import.meta.url), 'utf8'), { context });
    await module.link(name => new SyntheticModule(Object.keys(mocks[name]), function () {
        for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
    }, { context }));
    await module.evaluate();
    const tick = () => new Promise(resolve => setImmediate(resolve));
    await tick();
    assert.match(element('user-list').innerHTML, /data-diary="friend"/);
    const click = id => element('user-list').listeners.click({ target: { closest: () => ({ dataset: { diary: id } }) } });
    click('owner');
    click('friend');
    assert.equal(requests[1].path, '/api/admin/users/friend/diary');
    requests[1].resolve({ date: '2026-10-25', entries: [entry] });
    await tick();
    assert.equal(element('user-diary').hidden, false);
    assert.equal(element('user-diary-name').textContent, '<Friend>');
    assert.equal(element('user-diary-date').value, '2026-10-25');
    const rendered = element('user-diary-content').innerHTML;
    assert.match(rendered, /当日合计.*120.*蛋白 23g/);
    assert.match(rendered, /午餐/);
    assert.match(rendered, /translate="no">&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(rendered, /&lt;100g&gt;/);
    assert.doesNotMatch(rendered, /<img/);
    requests[0].resolve({ date: '2026-10-24', entries: [] });
    await tick();
    assert.equal(element('user-diary-content').innerHTML, rendered);
    const changeDate = value => element('user-diary-date').listeners.change({ target: { value, validity: { valid: true } } });
    changeDate('2026-10-20');
    assert.equal(requests[2].path, '/api/admin/users/friend/diary?date=2026-10-20');
    requests[2].resolve({ date: '2026-10-20', entries: [] });
    await tick();
    assert.match(element('user-diary-content').innerHTML, /当天没有饮食记录/);
    changeDate('2026-10-21');
    requests[3].reject(new Error('network'));
    await tick();
    assert.equal(element('user-diary-content').textContent, '加载失败');
});
