import { state } from './state.js';
import { diaryDate, $, fmt, localDate, reduceMotion } from './helpers.js';
import { targetsFor } from './nutrition.js';
import { replay, showToast, tweenNumber, withBusy, moveSegThumb } from './ui.js';
import { api } from './api.js';
import { syncAchievements } from './achievements.js';

// ── Water ──
const GLASS_ML = 250;

const waterTotal = date => (state.water[date] || []).reduce((sum, w) => sum + w.ml, 0);

let lastWaterId = null;

function renderWater(celebrate = false) {
    const date = diaryDate();
    const goal = targetsFor(date).water;
    const total = waterTotal(date);
    const full = total >= goal;
    const card = $('water-card');
    if (celebrate && full && !card.classList.contains('is-full')) {
        replay(card, 'is-celebrating');
        showToast('今日饮水达标，继续保持', 'success');
    }
    card.classList.toggle('is-full', full);
    card.classList.toggle('is-empty', !total);
    card.style.setProperty('--level', `${Math.min(total / goal, 1) * 100}%`);
    tweenNumber($('water-num'), total);
    $('water-goal').textContent = fmt(goal);
    $('water-left').textContent = full ? '' : `还差 ${fmt(goal - total)} ml，约 ${Math.ceil((goal - total) / GLASS_ML)} 杯`;
    const log = $('water-log');
    log.innerHTML = (state.water[date] || []).map(w => `
        <li class="water-entry${w.id === lastWaterId ? ' is-new' : ''}" data-id="${w.id}">
            <b class="num">${fmt(w.ml)}</b>ml${w.time ? `<small>${w.time}</small>` : ''}
            <button type="button" class="icon-btn" data-water-id="${w.id}" aria-label="删除 ${fmt(w.ml)} ml 饮水"><span class="ms" aria-hidden="true">close</span></button>
        </li>`).join('');
    // Bring a just-added entry into view when the log scrolls sideways (mobile)
    if (lastWaterId) log.scrollTo({ left: log.scrollWidth, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    lastWaterId = null;
}

function addWater(ml, btn, customUnit = null) {
    return withBusy(btn, async () => {
        const date = diaryDate();
        // The drop lands on the current surface; the level rises after it hits
        const before = Math.min(waterTotal(date) / targetsFor(date).water, 1);
        $('water-card').style.setProperty('--splash-y', `${(1 - before) * $('water-vis').offsetHeight}px`);
        const time = date === localDate() ? new Date().toTimeString().slice(0, 5) : null;
        const created = await api('/api/water', 'POST', { date, ml, time, customUnit });
        (state.water[date] ||= []).push(created);
        if (customUnit) state.user.lastWater = { ml, unit: customUnit };
        lastWaterId = created.id;
        replay($('water-vis'), 'is-pouring');
        renderWater(true);
        syncAchievements();
    });
}

// Prefill with the last custom amount, in the unit it was entered in; it stays after recording for one-tap repeats
function fillCustomWater() {
    const last = state.user.lastWater;
    if (!last) return;
    const input = document.querySelector(`input[name="water-unit"][value="${last.unit}"]`);
    input.checked = true;
    moveSegThumb(input.closest('.seg'));
    $('water-amount').value = last.unit === 'l' ? last.ml / 1000 : last.ml;
}

async function addCustomWater() {
    const value = parseFloat($('water-amount').value);
    const unit = document.querySelector('input[name="water-unit"]:checked').value;
    const ml = Math.round(unit === 'l' ? value * 1000 : value);
    if (!(ml > 0 && ml <= 5000)) { showToast('请填写 1 ml 到 5 L 之间的饮水量', 'error'); $('water-amount').focus(); return; }
    await addWater(ml, $('water-go'), unit);
}

async function deleteWater(id) {
    const date = diaryDate();
    await api(`/api/water/${id}`, 'DELETE');
    const chip = document.querySelector(`.water-entry[data-id="${id}"]`);
    if (chip && !reduceMotion.matches) {
        chip.classList.add('is-leaving');
        await new Promise(r => setTimeout(r, 200));
    }
    state.water[date] = state.water[date].filter(w => w.id !== id);
    renderWater();
    showToast('已删除这条饮水记录', 'info');
    syncAchievements();
}

function initWater() {
    // Drops the pour delay once the slosh settles, so later level changes (e.g. switching days) start at once
    $('water-surface').addEventListener('animationend', e => {
        if (e.animationName === 'slosh') $('water-vis').classList.remove('is-pouring');
    });
    document.querySelectorAll('[data-water-ml]').forEach(btn =>
        btn.addEventListener('click', () => addWater(Number(btn.dataset.waterMl), btn)));
    document.querySelector('.water-form').addEventListener('submit', e => { e.preventDefault(); addCustomWater(); });
    $('water-log').addEventListener('click', e => {
        const btn = e.target.closest('button[data-water-id]');
        if (btn) deleteWater(Number(btn.dataset.waterId));
    });
}

export { initWater, fillCustomWater, renderWater, waterTotal };
