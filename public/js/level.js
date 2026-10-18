import { $, fmt, localDate, reduceMotion } from './helpers.js';
import { dayStars, targetsFor } from './nutrition.js';
import { state } from './state.js';
import { showToast, tweenNumber } from './ui.js';
import { ACHIEVEMENTS, tierMetal } from './achievements.js';

// ── Level ──
// XP is replayed from history on every render rather than stored, so the level always matches the
// data: deleting records can lower it. Only the level-up celebration remembers anything.
const XP = { star: 10, water: 10, weigh: 5, medal: { bronze: 50, silver: 100, gold: 200, diamond: 400 } };

const TITLES = [[30, '钻石传奇', 'diamond'], [20, '黄金勇者', 'gold'], [15, '白银骑士', 'silver'], [10, '青铜战士', 'bronze'], [5, '见习冒险者', ''], [1, '新手村民', '']];

const SEEN_KEY = 'macro_tracker_seen_level';

function dayXp(date, weighed) {
    const drank = (state.water?.[date] || []).reduce((sum, w) => sum + w.ml, 0);
    return dayStars(date) * XP.star
        + (drank > 0 && drank >= targetsFor(date).water ? XP.water : 0)
        + (weighed.has(date) ? XP.weigh : 0);
}

function medalXp(id) {
    const [series, threshold] = id.split(':');
    const a = ACHIEVEMENTS.find(x => x.id === series);
    const i = a ? a.tiers.indexOf(Number(threshold)) : -1;
    return i < 0 ? 0 : XP.medal[tierMetal(i, a.tiers.length)];
}

function xpTotals(today = localDate()) {
    const weighed = new Set(state.weights.map(w => w.date));
    const dates = new Set([...Object.keys(state.diary), ...Object.keys(state.water || {}), ...weighed]);
    let total = 0;
    for (const d of dates) total += dayXp(d, weighed);
    let todayXp = dayXp(today, weighed);
    for (const [id, date] of Object.entries(state.achievements)) {
        total += medalXp(id);
        if (date === today) todayXp += medalXp(id);
    }
    return { total, today: todayXp };
}

// Lv L → L+1 costs 100 + 25 × (L - 1) XP
function levelFor(xp) {
    let level = 1, need = 100;
    while (xp >= need) { xp -= need; level++; need += 25; }
    const [, title, metal] = TITLES.find(([min]) => level >= min);
    return { level, into: xp, need, title, metal };
}

function floatXp(gain) {
    const chip = $('chip-level');
    if (reduceMotion.matches || chip.offsetParent === null) return;
    const el = document.createElement('span');
    el.className = 'float-gain is-xp num';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `+${fmt(gain)}<small>XP</small>`;
    el.addEventListener('animationend', () => el.remove(), { once: true });
    chip.append(el);
}

function celebrateLevelUp({ level, title }) {
    showToast(`升级到 Lv ${level}「${title}」`, 'award');
    if (reduceMotion.matches) return;
    const el = document.createElement('div');
    el.className = 'levelup';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<span class="levelup-rays"></span><span class="levelup-tag">LEVEL UP</span><b class="levelup-num num">Lv ${level}</b><span class="levelup-title">${title}</span>`;
    el.addEventListener('animationend', e => { if (e.animationName === 'levelupOut') el.remove(); });
    document.body.append(el);
}

let lastXp = null;

function renderLevel() {
    const xp = xpTotals();
    const lv = levelFor(xp.total);
    const metalCls = lv.metal ? ` lv-${lv.metal}` : '';
    const progress = String(lv.into / lv.need);

    const rail = $('rail-level');
    rail.hidden = false;
    rail.className = `rail-level num${metalCls}`;
    rail.textContent = `Lv ${lv.level}`;

    const chip = $('chip-level');
    chip.hidden = false;
    chip.className = `chip level-chip${metalCls}`;
    chip.setAttribute('aria-label', `等级 ${lv.level}，${lv.title}，${fmt(lv.into)} / ${fmt(lv.need)} XP`);
    $('lv-chip-num').textContent = `Lv ${lv.level}`;
    $('lv-chip-title').textContent = lv.title;
    $('lv-chip-bar').style.setProperty('--p', progress);

    const card = $('level-card');
    card.hidden = false;
    card.className = `level-card${metalCls}`;
    $('lv-num').textContent = lv.level;
    $('lv-title').textContent = lv.title;
    tweenNumber($('lv-today'), xp.today, n => `+${fmt(n)}`);
    $('lv-track').setAttribute('aria-valuemax', lv.need);
    $('lv-track').setAttribute('aria-valuenow', lv.into);
    $('lv-bar').style.setProperty('--p', progress);
    $('lv-xp').textContent = `${fmt(lv.into)} / ${fmt(lv.need)} XP`;
    $('lv-next').textContent = `距 Lv ${lv.level + 1} 还差 ${fmt(lv.need - lv.into)}`;

    if (lastXp !== null && xp.total > lastXp) floatXp(xp.total - lastXp);
    lastXp = xp.total;

    // First visit only records the level; later visits replay a level-up that happened while away
    let seen = null;
    try { seen = Number(localStorage.getItem(SEEN_KEY)) || null; } catch { /* storage unavailable */ }
    if (seen !== null && lv.level > seen) celebrateLevelUp(lv);
    if (seen !== lv.level) try { localStorage.setItem(SEEN_KEY, String(lv.level)); } catch { /* storage unavailable */ }
}

export { renderLevel, levelFor, xpTotals };
