import { CLASSES, renderAvatar } from './avatar.js';
import { api } from './api.js';
import { loadSession, initSession, expireSession } from './session.js';
import { startI18n, toggleLang } from './i18n.js';
import { startPixelIcons } from './pixel-icons.js';
import { withBusy, initTips } from './ui.js';
import { esc, reduceMotion } from './helpers.js';
import { sfx, initSound } from './sound.js';

startI18n();
startPixelIcons();
initTips();
initSound();
document.getElementById('lang-toggle').addEventListener('click', toggleLang);
const form = document.getElementById('character-form');
document.getElementById('class-options').innerHTML = Object.entries(CLASSES).map(([value, [name, icon, , hint]]) =>
    `<label class="class-option"><input type="radio" name="activity" value="${value}" required><span class="ms" aria-hidden="true">${icon}</span><b>${name}</b><span class="hint-info" role="img" data-tip="${esc(hint)}" aria-label="${esc(hint)}"><span class="ms" aria-hidden="true">info</span></span></label>`).join('');
// A new hero starts in the Lv 1 rags, the same skin the home page shows until the first level-up
function preview() { const profile = draft(); renderAvatar(document.getElementById('character-preview'), { ...profile, skin: 1 }, profile.nickname); }
let timer, saving = Promise.resolve();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// A quest-start cutscene: letterbox bars close in, the page tears along a jagged seam, the hero hops into the
// light under a "begin your adventure" title, then walks into it. Any tap skips straight to the final flash.
// The home page picks up the same light (see playArrival in app.js).
async function playDeparture(nickname) {
    if (reduceMotion.matches) return;
    const main = document.querySelector('main');
    const art = document.querySelector('#character-preview .avatar-art');
    const box = main.getBoundingClientRect();
    const from = art.getBoundingClientRect();
    const w = innerWidth, h = innerHeight;
    const seam = Array.from({ length: 13 }, (_, i) => [w / 2 + (i % 2 ? 1 : -1) * (6 + Math.random() * 12), h * i / 12]);
    const edge = seam.map(([x, y]) => `${x}px ${y}px`).join(', ');
    const stage = document.createElement('div');
    stage.className = 'departure';
    const embers = Array.from({ length: 28 }, () =>
        `<i style="--x: ${Math.random() * 100}%; --d: ${2 + Math.random() * 2.5}s; --delay: ${-Math.random() * 4}s"></i>`).join('');
    stage.innerHTML = `<div class="departure-rays" aria-hidden="true"></div><div class="departure-embers" aria-hidden="true">${embers}</div>
        <div class="chapter-card" role="status"><p class="chapter-kicker" translate="no">QUEST START</p><h2 class="chapter-title">开启你的冒险</h2>
        <p class="chapter-sub"><b translate="no">${esc(nickname)}</b><span>，传说从这里开始</span></p></div>
        <div class="departure-bar" aria-hidden="true"></div><div class="departure-bar is-bottom"><span>点击跳过</span></div>`;
    const halves = [0, w].map(x => {
        const half = document.createElement('div');
        half.className = 'departure-half';
        half.style.clipPath = `polygon(${x}px 0, ${edge}, ${x}px ${h}px)`;
        const copy = main.cloneNode(true);
        // cloneNode keeps input values but not a select's chosen option
        copy.querySelectorAll('select').forEach((select, i) => { select.value = main.querySelectorAll('select')[i].value; });
        Object.assign(copy.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px` });
        half.append(copy);
        return half;
    });
    const hero = art.cloneNode(true);
    hero.classList.add('departure-hero');
    Object.assign(hero.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px` });
    stage.querySelector('.departure-embers').after(...halves, hero);
    document.body.append(stage);
    main.style.visibility = 'hidden';

    let skipped = false;
    const skip = new Promise(resolve => stage.addEventListener('click', () => { skipped = true; resolve(); }, { once: true }));
    const step = ms => skipped || Promise.race([wait(ms), skip]);

    // The hero lands above centre, scaled to a third of the screen so the title fits beneath it
    const scale = Math.min(1.4, h * .34 / from.height);
    const tx = w / 2 - from.left - from.width / 2, ty = h * .38 - from.top - from.height / 2;
    const landed = `translate(${tx}px, ${ty}px) scale(${scale})`;
    await step(250);
    hero.animate([
        { transform: 'none' },
        { transform: 'translateY(6%) scaleY(.9)', offset: .15 },
        { transform: `translate(${tx * .55}px, ${ty * .55 - 70}px) scale(${(1 + scale) / 2})`, offset: .55 },
        { transform: landed }
    ], { duration: 650, easing: 'ease-out', fill: 'forwards' });
    await step(450);
    sfx('chapter');
    halves.forEach((half, i) => half.animate([
        { transform: 'none' },
        { transform: `translateX(${i ? 8 : -8}px)`, offset: .15 },
        { transform: `translateX(${i ? 60 : -60}vw) rotate(${i ? 5 : -5}deg)` }
    ], { duration: 800, easing: 'cubic-bezier(.6, 0, .3, 1)', fill: 'forwards' }));
    await step(650);
    stage.classList.add('is-titled');
    await step(2300);
    stage.classList.add('is-flash');
    await hero.animate([
        { transform: landed, opacity: 1 },
        { transform: `${landed} translateY(-4%) scale(2.2)`, opacity: 0 }
    ], { duration: skipped ? 350 : 700, easing: 'ease-in', fill: 'forwards' }).finished;
    try { sessionStorage.setItem('macro_tracker_arrival', '1'); } catch { /* storage unavailable */ }
}
function draft() { return Object.fromEntries(new FormData(form)); }
function saveDraft() {
    clearTimeout(timer);
    const body = draft();
    saving = saving.catch(() => {}).then(async () => {
        await api('/api/profile', 'PUT', body);
        document.getElementById('draft-status').textContent = '草稿已保存';
    });
    return saving;
}
async function start() {
    const data = await loadSession();
    if (!data.account) return expireSession();
    if (data.account.onboarded) return location.replace('/');
    initSession();
    for (const [key, value] of Object.entries(data.draft)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value ?? '';
    preview();
    document.body.removeAttribute('data-auth-loading');
    form.addEventListener('input', () => {
        preview();
        clearTimeout(timer);
        document.getElementById('draft-status').textContent = '正在保存草稿';
        timer = setTimeout(() => saveDraft().catch(() => { document.getElementById('draft-status').textContent = '草稿未保存，请检查网络'; }), 800);
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        withBusy(event.submitter, async () => {
            clearTimeout(timer);
            await saving.catch(() => {});
            const body = draft();
            for (const key of ['height', 'weight', 'age', 'activity', 'targetWeight', 'waterTarget']) body[key] = body[key] === '' ? null : Number(body[key]);
            await api('/api/profile/complete', 'POST', body);
            await playDeparture(body.nickname).catch(() => {});
            location.replace('/');
        }).catch(() => {});
    });
    document.getElementById('leave-character').addEventListener('click', event => withBusy(event.currentTarget, async () => {
        await saveDraft();
        await api('/api/auth/logout', 'POST');
        try { localStorage.setItem('macro_tracker_account', ''); } catch { /* storage unavailable */ }
        expireSession();
    }).catch(() => {}));
}
start().catch(() => { location.replace('/login.html?error=login_failed'); });
