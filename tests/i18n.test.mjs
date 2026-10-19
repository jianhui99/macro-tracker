import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createContext, SourceTextModule } from 'node:vm';

// Same loader as frontend.test.mjs: public/js is plain browser ESM, so it is linked in a vm context
const context = createContext({ localStorage: { getItem: () => null } });
const modules = new Map();
async function module(name) {
    if (!modules.has(name)) {
        const source = await readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8');
        modules.set(name, new SourceTextModule(source, { context, identifier: name }));
    }
    return modules.get(name);
}
const i18n = await module('i18n.js');
await i18n.link(specifier => module(specifier.slice(2)));
await i18n.evaluate();
const { lookup } = i18n.namespace;
const { EN } = (await module('i18n-en.js')).namespace;
const ZH = /[\u4e00-\u9fff]/;

test('every Chinese string in index.html has English', async () => {
    const html = (await readFile(new URL('../public/index.html', import.meta.url), 'utf8'))
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<fieldset[^>]*translate="no"[\s\S]*?<\/fieldset>/g, '');
    const strings = [
        ...[...html.matchAll(/>([^<>]+)</g)].map(m => m[1].trim()),
        ...[...html.matchAll(/\b(?:aria-label|placeholder|title|alt)="([^"]*)"/g)].map(m => m[1])
    ].filter(s => ZH.test(s));
    const missing = [...new Set(strings)].filter(s => lookup(s) === null);
    assert.deepEqual(missing, []);
});

test('pattern translations keep their placeholders', () => {
    for (const [zh, en] of Object.entries(EN)) {
        const holes = s => (s.match(/\{\d\}/g) || []).sort().join();
        if (typeof en === 'string') assert.equal(holes(en), holes(zh), zh);
    }
});

test('composite runtime strings translate piece by piece', () => {
    const cases = {
        '10月19日': 'Oct 19',
        '2025年3月1日': 'Mar 1, 2025',
        '2026年10月': 'Oct 2026',
        '10月19日 周一': 'Oct 19 Mon',
        '已记录「鸡胸肉」到午餐': 'Logged "鸡胸肉" to Lunch',
        '记录到练后餐': 'Log to Post-workout',
        '/ 30 天': '/ 30 days',
        '→ 24 以下': '→ 24 or below',
        '10月19日，2,000 kcal，3 星，饮水 2,500 ml，已喝够': 'Oct 19, 2,000 kcal, 3★, water 2,500 ml, goal hit',
        '蛋白 120 · 碳水 200 · 脂肪 50 g': 'Protein 120 · Carbs 200 · Fat 50 g',
        '备份中的食物仓库（存在重复记录）不完整或格式不正确，未导入。': 'The food pack (duplicate records) in this save is incomplete or malformed. Nothing was loaded.',
        '钻石 · Lv 30+': 'Diamond · Lv 30+',
        '10月19日解锁': 'Unlocked Oct 19',
        '删除 1,200 ml 饮水': 'Delete 1,200 ml of water'
    };
    for (const [zh, en] of Object.entries(cases)) assert.equal(lookup(zh), en, zh);
    assert.equal(lookup('鸡胸肉'), null, 'user text without an entry stays as written');
});
