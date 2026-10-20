import { renderAvatar, SKINS } from './avatar.js';
import { levelFor, xpTotals, titleOf } from './level.js';
import { state } from './state.js';
import { account } from './session.js';
import { api } from './api.js';
import { $ } from './helpers.js';
import { replay, withBusy } from './ui.js';
import { sfx } from './sound.js';

// ── Hero skins ──
// Every level title has a skin. Any skin up to the highest level ever reached can be worn: that record lives on
// the server and only rises, so losing a level never takes a skin away. With none picked, the current level's
// skin is worn, so a level-up changes the outfit by itself.
const HEROES = ['home-avatar', 'char-avatar'];

const currentLevel = () => levelFor(xpTotals().total).level;
const unlockedSkins = level => Math.min(Math.max(state.user.maxLevel ?? 1, level), SKINS.length);

// The skin always comes from saved state, so a settings draft previews its new build in the current outfit
function dressed(user, level = currentLevel()) {
    return { ...user, skin: state.user.skin ?? Math.min(level, SKINS.length) };
}

function renderHeroes(level = currentLevel()) {
    for (const id of HEROES) renderAvatar($(id), dressed(state.user, level), account?.nickname || '');
}

function syncHeroLevel(level) {
    if (level > (state.user.maxLevel ?? 1)) {
        state.user.maxLevel = level;
        api('/api/level', 'POST', { level }).catch(() => {});
    }
    renderHeroes(level);
}

function openWardrobe() {
    const level = currentLevel(), unlocked = unlockedSkins(level);
    const picked = state.user.skin ?? 0;
    $('skin-sub').textContent = `已解锁 ${unlocked} / ${SKINS.length} 套`;
    // Slot 0 follows the level; the rest are one per title, locked past the highest level reached
    $('skin-grid').innerHTML = [0, ...SKINS.map((_, i) => i + 1)].map(skin => {
        const locked = skin > unlocked;
        const label = skin ? titleOf(skin) : '跟随等级';
        const sub = !skin ? '升级时自动换装' : locked ? `<span class="ms" aria-hidden="true">lock</span>Lv ${skin} 解锁` : `Lv ${skin}`;
        return `<li style="--j:${Math.min(skin, 14)}"><button type="button" class="skin-slot${locked ? ' is-locked' : ''}" data-skin="${skin}"
            aria-pressed="${skin === picked}"${locked ? ' disabled' : ''}><span class="avatar-stage skin-art"></span><b>${label}</b><small>${sub}</small></button></li>`;
    }).join('');
    $('skin-grid').querySelectorAll('.skin-slot').forEach(slot => renderAvatar(slot.querySelector('.skin-art'),
        { ...state.user, skin: Number(slot.dataset.skin) || Math.min(level, SKINS.length) }));
    $('skin-dialog').showModal();
    // Centre the worn skin by scrolling the grid alone; scrollIntoView would also scroll the dialog past its header
    const grid = $('skin-grid'), worn = grid.querySelector('[aria-pressed="true"]').parentElement;
    grid.scrollTop = worn.offsetTop - grid.offsetTop - (grid.clientHeight - worn.offsetHeight) / 2;
}

async function wear(slot) {
    const skin = Number(slot.dataset.skin) || null;
    if (skin === (state.user.skin ?? null)) return;
    try {
        await withBusy(slot, () => api('/api/skin', 'PUT', { skin }));
    } catch { return; }
    state.user.skin = skin;
    $('skin-grid').querySelectorAll('.skin-slot').forEach(other => other.setAttribute('aria-pressed', String(other === slot)));
    renderHeroes();
    [slot, ...HEROES.map($)].forEach(el => replay(el, 'is-equipping'));
    sfx('save');
}

function initSkins() {
    const hero = e => e.target.closest('#home-avatar, #char-avatar');
    document.addEventListener('click', e => { if (hero(e)) openWardrobe(); });
    document.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && hero(e)) { e.preventDefault(); openWardrobe(); }
    });
    $('skin-grid').addEventListener('click', e => {
        const slot = e.target.closest('.skin-slot');
        if (slot && !slot.disabled) wear(slot);
    });
}

export { renderHeroes, syncHeroLevel, dressed, initSkins };
