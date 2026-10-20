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
        './helpers.js': { $: element, esc: value => value },
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
