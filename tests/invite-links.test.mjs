import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

async function loadPage(name, globals, mocks) {
    const context = createContext(globals);
    const module = new SourceTextModule(await readFile(new URL(`../public/js/${name}.js`, import.meta.url), 'utf8'), { context });
    await module.link(name => new SyntheticModule(Object.keys(mocks[name]), function () {
        for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
    }, { context }));
    await module.evaluate();
    await new Promise(resolve => setImmediate(resolve));
}

const noop = () => {};
const sharedMocks = {
    './i18n.js': { startI18n: noop, toggleLang: noop, lookup: noop, lang: 'zh' },
    './pixel-icons.js': { startPixelIcons: noop }
};

test('both admin copy buttons share an absolute login URL with the invitation code', async () => {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
        return elements.get(id);
    };
    const copied = [], toasts = [];
    let rejectCopy = false;
    await loadPage('admin', {
        document: { body: { dataset: { adminStage: 'panel' } }, querySelectorAll: () => [], addEventListener: noop },
        window: { addEventListener: noop }, location: { origin: 'https://tracker.example', hash: '#invites' },
        navigator: { clipboard: { writeText: async text => { if (rejectCopy) throw new Error('denied'); copied.push(text); } } },
        FormData: class { get() { return '1'; } }
    }, {
        ...sharedMocks,
        './api.js': { api: async path => path === '/api/admin/invites' ? { code: 'New123' } : {
            users: [], invites: [{ code: 'Saved456', code_hash: 'hash', uses: 0, max_uses: 1 }], rules: {}, logs: []
        }, errorMessage: value => value },
        './session.js': { loadSession: async () => {}, initSession: noop, account: { id: 'owner' } },
        './ui.js': { showConfirm: noop, showToast: (...args) => toasts.push(args), withBusy: (button, fn) => fn() },
        './helpers.js': { $: element, esc: value => value, fmt1: String, localDate: noop },
        './nutrition.js': { MEAL_ORDER: [], MEALS: {}, sumEntries: noop },
        './rules.js': { RULE_LABELS: {}, ruleBounds: noop }
    });
    await element('invite-form').listeners.submit({ preventDefault: noop, target: {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(element('invite-output').textContent, 'New123');
    assert.equal(element('invite-share').hidden, false);
    await element('invite-copy').listeners.click();
    const copySaved = () => element('invite-list').listeners.click({ target: { closest: () => ({ dataset: { copyCode: 'Saved456' } }) } });
    copySaved();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(copied, [
        'https://tracker.example/login?inv_code=New123',
        'https://tracker.example/login?inv_code=Saved456'
    ]);
    rejectCopy = true;
    await element('invite-copy').listeners.click();
    copySaved();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(toasts.filter(([, type]) => type === 'error').length, 2);
});

test('login prefills invitation links, opens registration and keeps legacy links working', async () => {
    for (const [search, expected] of [
        ['?inv_code=AbC123', 'AbC123'],
        ['?invite=Legacy123', 'Legacy123'],
        ['?inv_code=New123&invite=Legacy123', 'New123'],
        ['?inv_code=A%2BB%26C', 'A+B&C'],
        ['', ''], ['?inv_code=', '']
    ]) {
        const invite = { value: '', setAttribute(name, value) { this[name] = value; } };
        const elements = {
            'lang-toggle': { addEventListener: noop }, 'login-error': { hidden: true },
            'login-form': { hidden: false, addEventListener: noop },
            'register-form': { hidden: true, elements: { invite }, addEventListener: noop }
        };
        const tabs = ['login', 'register'].map(mode => ({ dataset: { mode }, setAttribute(name, value) { this[name] = value; } }));
        await loadPage('login', {
            URLSearchParams, location: { search },
            document: { querySelectorAll: () => tabs, querySelector: () => null, addEventListener: noop }
        }, {
            ...sharedMocks,
            './api.js': { api: noop, errorMessage: value => value },
            './ui.js': { withBusy: noop }, './helpers.js': { $: id => elements[id] }
        });
        assert.equal(invite.value, expected, search);
        assert.equal(elements['register-form'].hidden, !expected, search);
        assert.equal(elements['login-form'].hidden, !!expected, search);
        if (expected) assert.equal(tabs[1]['aria-pressed'], true, search);
    }
});
