import { $, fmt, reduceMotion, esc } from './helpers.js';
import { sfx } from './sound.js';

// ── Toasts ──
const TOAST_SOUNDS = { success: 'save', error: 'error', warning: 'over', info: 'delete', award: 'award' };

function showToast(message, type = 'success', sound = TOAST_SOUNDS[type]) {
    sfx(sound);
    const icons = { success: 'check_circle', error: 'error', warning: 'error', info: 'info', award: 'military_tech' };
    const toast = document.createElement('div');
    toast.className = `toast t-${type}`;
    toast.innerHTML = `<span class="ms" aria-hidden="true">${icons[type] || icons.info}</span><span></span>`;
    toast.lastChild.textContent = message;
    const container = $('toast-container');
    container.appendChild(toast);
    while (container.children.length > 2) container.firstElementChild.remove();
    setTimeout(() => {
        toast.classList.add('is-leaving');
        setTimeout(() => toast.remove(), 220);
    }, 2800);
}

function showConfirm(message) {
    const dlg = $('confirm-dialog');
    $('confirm-message').textContent = message;
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise(resolve =>
        dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true }));
}

// Re-triggers a CSS animation class even if it is already applied
function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
}

function tweenNumber(el, to, format = fmt) {
    const from = parseFloat(el.dataset.v ?? 0);
    el.dataset.v = to;
    cancelAnimationFrame(el._raf);
    if (reduceMotion.matches || Math.abs(from - to) < 0.5) { el.textContent = format(to); return; }
    const start = performance.now();
    const dur = 750;
    const step = now => {
        const t = Math.min((now - start) / dur, 1);
        el.textContent = format(from + (to - from) * (1 - Math.pow(1 - t, 3)));
        if (t < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
}

function moveSegThumb(seg) {
    const label = seg.querySelector('input:checked')?.parentElement;
    const thumb = seg.querySelector('.seg-thumb');
    thumb.hidden = !label;
    // Hidden (e.g. closed modal): measure later, the ResizeObserver re-runs this once it shows
    if (!label || !label.offsetWidth) return;
    // First placement snaps instead of growing in from the corner
    if (!thumb.style.width) thumb.style.transition = 'none';
    thumb.style.width = `${label.offsetWidth}px`;
    thumb.style.height = `${label.offsetHeight}px`;
    thumb.style.transform = `translate(${label.offsetLeft}px, ${label.offsetTop}px)`;
    thumb.offsetWidth;
    thumb.style.transition = '';
}

// ── Diary: mutations ──
async function withBusy(btn, fn) {
    btn.disabled = true;
    try { await fn(); } finally { btn.disabled = false; }
}

// One floating tooltip for charts and hint icons: any [data-tip] shows it on hover, tap or keyboard focus
function showFloatTipAt(html, cx, top, bottom = top) {
    const tip = $('float-tip');
    tip.innerHTML = html;
    tip.hidden = false;
    const above = top - tip.offsetHeight - 10;
    tip.style.top = `${above >= 8 ? above : bottom + 10}px`;
    tip.style.left = `${Math.min(Math.max(cx - tip.offsetWidth / 2, 8), innerWidth - tip.offsetWidth - 8)}px`;
}

function showFloatTip(el) {
    const r = el.getBoundingClientRect();
    showFloatTipAt(el.dataset.tip, r.left + r.width / 2, r.top, r.bottom);
}

function hideFloatTip() { $('float-tip').hidden = true; }

// ── Collapsible panels ──
// Keyed by panel title, which is static markup
const PANEL_STORAGE = 'macro_tracker_collapsed_panels';

let collapsedPanels = new Set();

function setPanelCollapsed(panel, collapsed) {
    panel.classList.toggle('is-collapsed', collapsed);
    panel.querySelector('.panel-toggle').setAttribute('aria-expanded', String(!collapsed));
}

function initTips() {
    const tipScope = document.querySelector('main');

    tipScope.addEventListener('pointerover', e => {
        if (e.target.closest('[data-tip-host]')) return;
        const el = e.target.closest('[data-tip]');
        if (el) showFloatTip(el); else hideFloatTip();
    });

    tipScope.addEventListener('pointerleave', hideFloatTip);

    tipScope.addEventListener('focusin', e => { const el = e.target.closest('[data-tip]'); if (el) showFloatTip(el); });

    tipScope.addEventListener('focusout', hideFloatTip);

    // The icon can sit inside clickable headers or option labels; tapping it shows the tip without toggling them
    tipScope.addEventListener('click', e => { if (e.target.closest('.hint-info')) e.preventDefault(); });

    tipScope.addEventListener('scroll', hideFloatTip, { passive: true });

    window.addEventListener('scroll', hideFloatTip, { passive: true });
}

function initUi() {
    // ── Dialogs ──
    // Clicking the backdrop lands on the <dialog> itself (content lives in an inner form).
    // The badge dialog animates its own close.
    document.querySelectorAll('dialog:not(#badge-dialog):not(#import-dialog)').forEach(d =>
        d.addEventListener('click', e => { if (e.target === d) d.close('cancel'); }));

    initTips();

    // Options are watched too: they can resize while the control doesn't, e.g. when the icon font
    // arrives and a ligature like "free_breakfast" collapses from text width to one glyph
    const segThumbObserver = new ResizeObserver(entries =>
        new Set(entries.map(e => e.target.closest('.seg'))).forEach(moveSegThumb));

    document.querySelectorAll('.seg').forEach(seg => {
        seg.insertAdjacentHTML('afterbegin', '<span class="seg-thumb" aria-hidden="true" hidden></span>');
        seg.addEventListener('change', () => moveSegThumb(seg));
        segThumbObserver.observe(seg);
        seg.querySelectorAll('label').forEach(label => segThumbObserver.observe(label));
    });

    try {
        collapsedPanels = new Set(JSON.parse(localStorage.getItem(PANEL_STORAGE) || '[]'));
    } catch { collapsedPanels = new Set(); }

    document.querySelectorAll('.panel > .panel-head').forEach(head => {
        const title = head.querySelector('h2').textContent;
        head.insertAdjacentHTML('beforeend', `<button type="button" class="icon-btn panel-toggle" aria-label="${esc(title)}"><span class="ms" aria-hidden="true">chevron_right</span></button>`);
        setPanelCollapsed(head.parentElement, collapsedPanels.has(title));
    });

    // Static hints become an info icon; hints with an id show live data (counts, days) and stay as text
    document.querySelectorAll('.panel-head .hint:not([id]), .new-food > summary .hint').forEach(hint => {
        const text = esc(hint.textContent);
        hint.outerHTML = `<button type="button" class="hint-info" data-tip="${text}" aria-label="${text}"><span class="ms" aria-hidden="true">info</span></button>`;
    });

    document.addEventListener('click', e => {
        if (e.target.closest('.hint-info')) return;
        const head = e.target.closest('.panel > .panel-head');
        if (!head) return;
        const panel = head.parentElement;
        const title = head.querySelector('h2').textContent;
        const collapsed = !panel.classList.contains('is-collapsed');
        setPanelCollapsed(panel, collapsed);
        panel.classList.toggle('is-expanding', !collapsed);
        collapsed ? collapsedPanels.add(title) : collapsedPanels.delete(title);
        try { localStorage.setItem(PANEL_STORAGE, JSON.stringify([...collapsedPanels])); } catch { /* storage unavailable */ }
    });
}

export { showToast, replay, hideFloatTip, initUi, initTips, moveSegThumb, tweenNumber, withBusy, showConfirm, showFloatTipAt };
