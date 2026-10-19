// UI language. The markup and modules are written in Chinese; in English mode the page is translated in place:
// one pass over the document at boot, then a MutationObserver catches everything rendered later.
// Lookup order: exact entry, date rule, `{n}` pattern (captures translated recursively), then per-segment on
// Chinese punctuation, so composite labels like "10月19日，2,000 kcal，3 星" still resolve piece by piece.
import { EN } from './i18n-en.js';

const LANG_KEY = 'macro_tracker_lang';
const ZH = /[\u4e00-\u9fff]/;
const ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEGMENT = /(，|、|：|；|。| · )/;
const JOINERS = { '，': ', ', '、': ', ', '：': ': ', '；': '; ', '。': '. ', ' · ': ' · ' };

const lang = (() => {
    try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh'; } catch { return 'zh'; }
})();

function setLang(next) {
    try { localStorage.setItem(LANG_KEY, next); } catch { /* storage unavailable */ }
    location.reload();
}

const month = m => MONTHS[Number(m) - 1];
const DATE_RULES = [
    [/^(\d{4})年(\d{1,2})月(\d{1,2})日$/, (y, m, d) => `${month(m)} ${d}, ${y}`],
    [/^(\d{1,2})月(\d{1,2})日$/, (m, d) => `${month(m)} ${d}`],
    [/^(\d{4})年(\d{1,2})月$/, (y, m) => `${month(m)} ${y}`],
    [/^(\d{1,2})月$/, month],
    [/^(\d{4})年$/, y => y],
    [/^(\d{1,2})日$/, d => d],
    // A date followed by more text, like a weekday or a weight: "10月19日 周一", "10月1日 80 kg", "10月 没有记录"
    [/^((?:\d{4}年)?\d{1,2}月(?:\d{1,2}日)?) (.+)$/, (date, rest) => `${lookup(date)} ${lookup(rest) ?? rest}`]
];

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EXACT = new Map();
const PATTERNS = [];
for (const [zh, en] of Object.entries(EN)) {
    if (!/\{\d\}/.test(zh)) { EXACT.set(zh, en); continue; }
    const re = new RegExp(`^${escapeRe(zh).replace(/\\\{(\d)\\\}/g, '(.+?)')}$`);
    PATTERNS.push([re, en, zh.replace(/\{\d\}/g, '').length]);
}
// Most literal text first, so "删除 {0} ml 饮水" wins over the looser "删除 {0}"
PATTERNS.sort((a, b) => b[2] - a[2]);

function lookup(s) {
    if (EXACT.has(s)) return EXACT.get(s);
    for (const [re, fn] of DATE_RULES) {
        const m = s.match(re);
        if (m) return fn(...m.slice(1));
    }
    for (const [re, en] of PATTERNS) {
        const m = s.match(re);
        if (!m) continue;
        const args = m.slice(1).map(a => (ZH.test(a) && lookup(a)) || a);
        return typeof en === 'function' ? en(...args) : en.replace(/\{(\d)\}/g, (_, i) => args[i]);
    }
    const parts = s.split(SEGMENT);
    if (parts.length === 1) return null;
    let changed = false;
    const out = parts.map(p => {
        if (p in JOINERS) { changed = true; return JOINERS[p]; }
        const t = ZH.test(p) ? lookup(p.trim()) : null;
        if (t === null) return p;
        changed = true;
        return p.replace(p.trim(), t);
    }).join('');
    return changed ? out.trim() : null;
}

// Translates one string, keeping its surrounding whitespace; untouched when nothing matches (e.g. a food name)
function translate(text) {
    if (!ZH.test(text)) return text;
    const core = text.trim();
    const out = lookup(core);
    if (out === null) {
        if (location.hostname === 'localhost') warnMissing(core);
        return text;
    }
    return text.replace(core, out);
}

const missing = new Set();
function warnMissing(s) {
    if (missing.has(s)) return;
    missing.add(s);
    console.warn('[i18n] no English for', JSON.stringify(s));
}

function translateText(node) {
    const out = translate(node.data);
    if (out !== node.data) node.data = out;
}

function translateAttrs(el) {
    for (const name of ATTRS) {
        const v = el.getAttribute(name);
        if (v === null || !ZH.test(v)) continue;
        const out = translate(v);
        if (out !== v) el.setAttribute(name, out);
    }
}

// translate="no" (the native HTML hint) marks text that must stay as written, like the language names
function translateTree(root) {
    if (root.nodeType === Node.TEXT_NODE) {
        if (!root.parentElement?.closest('[translate="no"], script, style')) translateText(root);
        return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest('[translate="no"]')) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: n => n.nodeType === Node.ELEMENT_NODE && (n.matches('script, style') || n.getAttribute('translate') === 'no')
            ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    for (let n = root; n; n = walker.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) translateText(n); else translateAttrs(n);
    }
}

function startI18n() {
    if (lang !== 'en') return;
    document.documentElement.lang = 'en';
    translateTree(document.documentElement);
    new MutationObserver(records => {
        for (const r of records) {
            if (r.type === 'childList') r.addedNodes.forEach(translateTree);
            else if (r.type === 'characterData') translateTree(r.target);
            else if (!r.target.closest('[translate="no"]')) translateAttrs(r.target);
        }
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    document.documentElement.classList.add('i18n-ready');
}

const toggleLang = () => setLang(lang === 'en' ? 'zh' : 'en');

export { lang, setLang, toggleLang, startI18n, lookup };
