import { esc, $, reduceMotion, localDate } from './helpers.js';
import { lang } from './i18n.js';

// ── Quote of the day ──
// Pieces rise in one by one from `offset`, then a highlighter sweeps under the whole line
function quoteLineHtml(pieces, joiner, offset) {
    const markDelay = (offset + pieces.length) * 45 + 450;
    return `<span class="quote-mark-line" style="--mark-delay:${markDelay}ms">${pieces.map((p, i) => `<span class="qw" style="--i:${offset + i}">${esc(p)}</span>`).join(joiner)}</span>`;
}

async function closeQuote() {
    const card = $('quote-card');
    if (!reduceMotion.matches) {
        card.classList.add('is-leaving');
        await new Promise(r => setTimeout(r, 200));
    }
    card.hidden = true;
    card.classList.remove('is-leaving');
}

async function loadQuote() {
    const card = $('quote-card');
    try {
        const res = await fetch('/data/quote.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { quotes } = await res.json();
        if (!Array.isArray(quotes) || !quotes.length) throw new Error('Empty quote pool');
        const dayIndex = Math.floor(Date.parse(`${localDate()}T00:00:00Z`) / 86400000);
        const quote = quotes[dayIndex % quotes.length];
        const text = quote[lang];
        if (typeof text !== 'string' || !text.trim()) throw new Error(`Missing ${lang} quote #${quote.id}`);
        const el = $('quote-text');
        if (lang === 'en') {
            el.classList.remove('is-zh');
            el.lang = 'en';
            el.innerHTML = quoteLineHtml(text.split(/\s+/), ' ', 0);
            return;
        }
        // Keep punctuation attached to each phrase during the reveal.
        const phrases = text.match(/[^，。；！？、]+[，。；！？、]?/g) || [text];
        el.innerHTML = quoteLineHtml(phrases, '', 0);
    } catch (err) {
        console.error('[quote] failed to load quote of the day', err);
        card.hidden = true;
    } finally {
        card.setAttribute('aria-busy', 'false');
    }
}

function initQuote() {
    document.querySelector('.quote-close').addEventListener('click', closeQuote);
}

export { initQuote, loadQuote };
