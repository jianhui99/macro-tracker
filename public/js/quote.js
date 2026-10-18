import { esc, $, reduceMotion } from './helpers.js';
import { authHeaders } from './api.js';

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
        const res = await fetch('/api/quote', { headers: authHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { text, author, image, source, zh } = await res.json();
        const words = text.split(/\s+/).filter(Boolean);
        $('quote-text').innerHTML = quoteLineHtml(words, ' ', 0);
        $('quote-author-name').textContent = author;
        $('quote-author').hidden = false;
        const photo = $('quote-photo');
        // if (image) {
        //     photo.onerror = () => { photo.hidden = true; $('quote-author').classList.remove('has-photo'); };
        //     photo.src = image;
        //     photo.alt = author;
        //     photo.style.setProperty('--photo-delay', `${words.length * 45 + 200}ms`);
        //     photo.hidden = false;
        //     $('quote-author').classList.add('has-photo');
        // }
        $('quote-credit').hidden = source !== 'zenquotes';
        if (zh) {
            // Chinese reveals phrase by phrase (punctuation stays attached, so no line starts with "，")
            const phrases = zh.text.match(/[^，。；！？、]+[，。；！？、]?/g) || [zh.text];
            $('quote-zh-text').innerHTML = quoteLineHtml(phrases, '', words.length + 4);
            $('quote-zh-author').textContent = zh.author;
            $('quote-zh').hidden = false;
        }
        card.setAttribute('aria-busy', 'false');
    } catch (err) {
        console.error('[quote] failed to load quote of the day', err);
        card.hidden = true;
    }
}

function initQuote() {
    document.querySelector('.quote-close').addEventListener('click', closeQuote);
}

export { initQuote, loadQuote };
