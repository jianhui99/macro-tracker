import { parseLocalDate, diaryDate, $, localDate, reduceMotion, esc, fmt, fmt1, WEEKDAYS } from './helpers.js';
import { MEAL_ORDER, MEALS, macroIcon, targetsFor, sumEntries, recordingStreak, MACRO_KEYS, FINISH_SCALE, dayStars } from './nutrition.js';
import { moveSegThumb, replay, tweenNumber, showToast, withBusy, showConfirm } from './ui.js';
import { groupFoodsByCategory, unitText, unitBase, scaleFood } from './foods.js';
import { state } from './state.js';
import { renderWater } from './water.js';
import { api } from './api.js';
import { syncAchievements } from './achievements.js';

let currentEditIndex = null;

let selectedFoodId = null;

let lastAddedId = null;

let changedEntryId = null;

let lanePct = {};

let shownDiaryDate = null;

function shiftDay(n) {
    const d = parseLocalDate(diaryDate());
    d.setDate(d.getDate() + n);
    $('diary-date').value = localDate(d);
    renderDiary();
}

function goToToday() { $('diary-date').value = localDate(); renderDiary(); }

function openDatePicker() {
    const input = $('diary-date');
    try { input.showPicker(); } catch { input.focus(); }
}

// ── Diary: meal + mode ──
function mealSegHtml(name) {
    return MEAL_ORDER.map(m => `
        <label><input type="radio" name="${name}" value="${m}">
            <span class="seg-opt"><span class="ms" aria-hidden="true">${MEALS[m].icon}</span>${MEALS[m].label}</span>
        </label>`).join('');
}

const getMeal = (name = 'meal') => document.querySelector(`input[name="${name}"]:checked`)?.value || 'snack';

function setMeal(meal, name = 'meal') {
    const input = document.querySelector(`input[name="${name}"][value="${meal}"]`);
    if (input) input.checked = true;
    if (input) { moveSegThumb(input.closest('.seg')); revealMeal(input.closest('.seg')); }
    if (name === 'meal') updateGoLabels();
}

// Meal rows scroll sideways when they don't fit; centre the chosen meal so it never hides off the edge
function revealMeal(seg, smooth = true) {
    const label = seg.querySelector('input:checked')?.parentElement;
    if (!label || !seg.clientWidth) return;
    seg.scrollTo({ left: label.offsetLeft - (seg.clientWidth - label.offsetWidth) / 2, behavior: smooth && !reduceMotion.matches ? 'smooth' : 'auto' });
}

function updateGoLabels() {
    const label = `记录到${MEALS[getMeal()].label}`;
    document.querySelectorAll('.go-label').forEach(el => { el.textContent = label; });
}

// Applied once on page load only; the user's manual choice wins for the session
function getDefaultMeal(d = new Date()) {
    const m = d.getHours() * 60 + d.getMinutes();
    if (m >= 300 && m < 630)  return 'breakfast'; // 5:00-10:30
    if (m >= 630 && m < 870)  return 'lunch';     // 10:30-14:30
    if (m >= 990 && m < 1290) return 'dinner';    // 16:30-21:30
    return 'snack';
}

function switchMode(mode) {
    ['food', 'temp'].forEach(m => {
        $(`tab-${m}`).setAttribute('aria-selected', String(m === mode));
        $(`form-${m}`).hidden = m !== mode;
    });
}

function focusQuickAdd(meal) {
    setMeal(meal);
    const target = $('form-temp').hidden ? $('food-search') : $('temp-food-name');
    target.focus({ preventScroll: true });
    document.querySelector('.quick').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
}

function renderFoodPicker() {
    const list = $('food-list');
    const keyword = $('food-search').value.trim().toLowerCase();
    const groups = groupFoodsByCategory();
    const visibleIds = [];
    let html = '';
    for (const cat in groups) {
        const foods = groups[cat].filter(f =>
            f.active !== false &&
            (!keyword || f.name.toLowerCase().includes(keyword) || cat.toLowerCase().includes(keyword)));
        if (!foods.length) continue;
        html += `<div class="pick-cat">${esc(cat)}</div>`;
        for (const f of foods) {
            visibleIds.push(f.id);
            html += `
                <label class="pick">
                    <input type="radio" name="food" value="${esc(f.id)}">
                    <span class="pick-name">${esc(f.name)}</span>
                    <span class="pick-unit">${esc(f.unit)}</span>
                    <span class="pick-kcal num">${macroIcon('kcal')}${fmt(f.kcal)}</span>
                </label>`;
        }
    }
    list.innerHTML = html || `
        <div class="pick-empty">
            ${keyword ? `没有匹配「${esc(keyword)}」的食物` : '背包里还没有启用的食物'}
            <button type="button" class="btn btn-ghost btn-sm" data-new-food>去背包新建</button>
        </div>`;
    $('quick-hint').textContent = visibleIds.length ? `${visibleIds.length} 种可选` : '';

    // Never leave a hidden food selected: fall back to the first visible one
    const nextId = visibleIds.includes(selectedFoodId) ? selectedFoodId : visibleIds[0] ?? null;
    selectFood(nextId, nextId !== selectedFoodId);
}

function selectFood(id, prefill = true) {
    selectedFoodId = id;
    const input = id && document.querySelector(`#food-list input[value="${CSS.escape(id)}"]`);
    if (input) input.checked = true;
    const food = currentFood();
    $('amount-unit').textContent = food ? unitText(food.unit).trim() : '';
    if (prefill) prefillAmount();
    updatePreview();
}

const currentFood = () => state.foods.find(f => f.id === selectedFoodId);

function onSearchKey(e) {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        (document.querySelector('#food-list input:checked') || document.querySelector('#food-list input'))?.focus();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedFoodId) $('food-amount').focus();
    }
}

// Prefill with the food's last-used amount, falling back to its base unit
function prefillAmount() {
    const food = currentFood();
    if (!food) return;
    const base = parseFloat(food.unit);
    $('food-amount').value = food.lastAmount != null ? food.lastAmount : (isNaN(base) ? 100 : base);
}

function stepAmount(dir) {
    const food = currentFood();
    if (!food) return;
    const base = unitBase(food.unit);
    const step = base >= 50 ? 10 : base >= 20 ? 5 : base >= 5 ? 1 : 0.5;
    const cur = parseFloat($('food-amount').value) || 0;
    $('food-amount').value = Math.max(0, Math.round((cur + dir * step) * 100) / 100);
    updatePreview();
}

function updatePreview() {
    const el = $('add-preview');
    const food = currentFood();
    const amount = parseFloat($('food-amount').value);
    if (!food || !(amount > 0)) {
        el.innerHTML = '<span>选择食物并填写分量，这里会显示这一笔的营养</span>';
        return;
    }
    const m = scaleFood(food, amount);
    const left = targetsFor(diaryDate()).kcal - sumEntries(state.diary[diaryDate()] || []).kcal - m.kcal;
    el.innerHTML = `
        <span class="pv-kcal num">+${fmt(m.kcal)}</span><span>kcal</span>
        <span class="pv-left ${left < 0 ? 'is-over' : ''}">记完${left < 0 ? '超出' : '还剩'} <b class="num">${fmt(Math.abs(left))}</b></span>
        <div class="pv-macros">
            <span class="pv-m">${macroIcon('protein')}蛋白 ${fmt1(m.protein)}g</span>
            <span class="pv-m">${macroIcon('carbs')}碳水 ${fmt1(m.carbs)}g</span>
            <span class="pv-m">${macroIcon('fat')}脂肪 ${fmt1(m.fat)}g</span>
        </div>`;
}

// ── Diary: render ──
function renderDiary({ celebrate = false } = {}) {
    const date = diaryDate();
    const d = parseLocalDate(date);
    const today = localDate();
    if (shownDiaryDate && shownDiaryDate !== date) {
        const dx = date > shownDiaryDate ? '18px' : '-18px';
        [document.querySelector('.date-label'), $('diary-log')].forEach(el => {
            el.style.setProperty('--dx', dx);
            replay(el, 'is-day-shift');
        });
    }
    shownDiaryDate = date;
    $('btn-today').hidden = date === today;
    $('date-main').textContent = `${d.getMonth() + 1}月${d.getDate()}日`;
    $('date-sub').textContent = date === today ? `${WEEKDAYS[d.getDay()]}，今天` : `${WEEKDAYS[d.getDay()]}，${d.getFullYear()}`;

    const entries = state.diary[date] || [];
    const totals = sumEntries(entries);
    renderScoreboard(totals, celebrate);
    renderWater(celebrate);
    $('log-count').textContent = entries.length ? `${entries.length} 项` : '';

    const grouped = Object.fromEntries(MEAL_ORDER.map(m => [m, []]));
    entries.forEach((e, idx) => (grouped[e.meal] || grouped.snack).push({ e, idx }));
    $('diary-log').innerHTML = MEAL_ORDER.map(meal => mealHtml(meal, grouped[meal])).join('');

    lastAddedId = null;
    changedEntryId = null;
    updatePreview();
}

function mealHtml(meal, items) {
    const { label, icon } = MEALS[meal];
    const sum = sumEntries(items.map(i => i.e));
    const addBtn = `<button class="icon-btn" type="button" data-action="quick-add" data-meal="${meal}" aria-label="记一笔到${label}"><span class="ms" aria-hidden="true">add</span></button>`;
    const head = items.length
        ? `<div class="meal-head">
                <div class="meal-title"><span class="ms" aria-hidden="true">${icon}</span><h3>${label}</h3></div>
                <span class="meal-sum num">${fmt(sum.kcal)}</span>
                <span class="entry-m">${fmt1(sum.protein)}</span>
                <span class="entry-m c-carbs">${fmt1(sum.carbs)}</span>
                <span class="entry-m c-fat">${fmt1(sum.fat)}</span>
                <div class="meal-actions">${addBtn}</div>
           </div>`
        : `<div class="meal-head">
                <div class="meal-title"><span class="ms" aria-hidden="true">${icon}</span><h3>${label} <span class="muted">还没记录</span></h3></div>
                <span></span><span></span><span class="c-carbs"></span><span class="c-fat"></span>
                <div class="meal-actions">${addBtn}</div>
           </div>`;
    if (!items.length) return `<section class="meal is-empty">${head}</section>`;

    const rows = items.map(({ e, idx }) => {
        const name = esc(e.name);
        const cls = [e.isTemporary && 'is-temp', e.id === lastAddedId && 'is-new', e.id === changedEntryId && 'is-changed'].filter(Boolean).join(' ');
        return `
            <li class="entry ${cls}" data-idx="${idx}">
                <div class="entry-main">
                    <span class="entry-name" title="${name}">${name}</span>
                    ${e.isTemporary ? '<span class="tag">临时</span>' : ''}
                    <span class="entry-amt">${esc(e.displayAmount)}</span>
                </div>
                <span class="entry-kcal num">${fmt(e.kcal)}</span>
                <span class="entry-m">${fmt1(e.protein)}</span>
                <span class="entry-m c-carbs">${fmt1(e.carbs)}</span>
                <span class="entry-m c-fat">${fmt1(e.fat)}</span>
                <div class="entry-actions">
                    <button class="icon-btn" data-action="edit" aria-label="编辑 ${name}"><span class="ms" aria-hidden="true">edit</span></button>
                    ${/ x \d+$/.test(e.name) ? `<button class="icon-btn act-portion" data-action="portion" data-delta="-1" aria-label="${name} 减一份"><span class="ms" aria-hidden="true">remove</span></button>` : ''}
                    <button class="icon-btn act-portion" data-action="portion" data-delta="1" aria-label="${name} 加一份"><span class="ms" aria-hidden="true">add</span></button>
                    <button class="icon-btn danger" data-action="delete" aria-label="删除 ${name}"><span class="ms" aria-hidden="true">delete</span></button>
                </div>
            </li>`;
    }).join('');
    return `<section class="meal">${head}<ul class="entries">${rows}</ul></section>`;
}

function renderScoreboard(totals, celebrate) {
    const t = targetsFor(diaryDate());
    $('day-type').value = state.dayPlan[diaryDate()] || '';
    const remaining = t.kcal - totals.kcal;
    $('board').classList.toggle('is-over', remaining < 0);
    $('hero-label').textContent = remaining < 0 ? '能量溢出' : '剩余能量';
    tweenNumber($('hero-num'), Math.abs(remaining));

    const streak = recordingStreak();
    $('chip-streak').classList.toggle('is-hot', streak >= 3);
    tweenNumber($('streak-days'), streak);

    const starsEl = $('day-stars');
    const stars = dayStars(diaryDate());
    const prevStars = Number(starsEl.dataset.stars || 0);
    starsEl.dataset.stars = stars;
    starsEl.setAttribute('aria-label', `星级 ${stars} / 3`);
    starsEl.querySelectorAll('.ms').forEach((star, i) => {
        const lit = i < stars;
        if (celebrate && lit && !star.classList.contains('is-on')) replay(star, 'is-lighting');
        star.classList.toggle('is-on', lit);
    });
    starsEl.classList.remove('is-complete');
    if (celebrate && stars === 3 && prevStars < 3) {
        replay(starsEl, 'is-complete');
        showToast('今日三星达成', 'award');
    }

    const proteinGap = t.protein - totals.protein;
    $('chip-protein').innerHTML = proteinGap > 0
        ? `<span class="ms" aria-hidden="true">egg_alt</span><span>蛋白还差 <b class="num">${fmt(proteinGap)}</b> g</span>`
        : `<span class="ms" aria-hidden="true">check_circle</span><span>蛋白已达标</span>`;

    for (const key of MACRO_KEYS) {
        const lane = document.querySelector(`.lane[data-key="${key}"]`);
        const pct = t[key] > 0 ? totals[key] / t[key] : 0;
        const prevPct = lanePct[key];
        lanePct[key] = pct;

        lane.querySelector('.lane-fill').style.width = `${Math.min(pct, FINISH_SCALE) / FINISH_SCALE * 100}%`;
        lane.querySelector('.lane-target').textContent = fmt(t[key]);
        tweenNumber(lane.querySelector('.lane-cur'), totals[key]);

        // On a cut, protein past target is the goal; everything else past target is overshoot
        const done = key === 'protein' && pct >= 1;
        const over = key !== 'protein' && pct > 1;
        lane.classList.toggle('is-done', done);
        lane.classList.toggle('is-over', over);
        lane.querySelector('.lane-flag').innerHTML = done
            ? '<span class="ms" aria-hidden="true">check</span>达标'
            : over ? `+${fmt(totals[key] - t[key])}` : '';

        if (!celebrate || prevPct === undefined) continue;
        if (pct > prevPct) replay(lane, 'bump');
        if (prevPct < 1 && pct >= 1) {
            replay(lane, 'finish');
            if (key === 'protein') showToast('蛋白质今日达标，保持住', 'success');
            if (key === 'kcal') showToast('今日热量已到目标线', 'warning');
        }
    }
}

function floatGain(kcal) {
    if (reduceMotion.matches) return;
    const el = document.createElement('span');
    el.className = 'float-gain num';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `+${fmt(kcal)}<small>kcal</small>`;
    el.addEventListener('animationend', () => el.remove(), { once: true });
    document.querySelector('#board .hero').append(el);
}

function addDiaryEntry() {
    return withBusy($('go-food'), async () => {
        const date = diaryDate();
        const userAmount = parseFloat($('food-amount').value) || 0;
        const meal = getMeal();
        const food = currentFood();
        if (!food) { showToast('先选一个食物，或去背包新建', 'error'); return; }
        if (userAmount <= 0) { showToast('请填写大于 0 的分量', 'error'); $('food-amount').focus(); return; }

        const created = await api('/api/diary', 'POST', {
            date, foodId: food.id, isTemporary: false, meal,
            name: food.name, rawAmount: userAmount,
            displayAmount: userAmount + unitText(food.unit),
            ...scaleFood(food, userAmount)
        });
        (state.diary[date] ||= []).push(created);
        food.lastAmount = userAmount;
        lastAddedId = created.id;
        renderDiary({ celebrate: true });
        floatGain(created.kcal);
        showToast(`已记录「${food.name}」到${MEALS[meal].label}`);
        syncAchievements();
        $('food-amount').focus();
    });
}

function addTemporaryDiaryEntry() {
    return withBusy($('go-temp'), async () => {
        const date = diaryDate();
        const name = $('temp-food-name').value.trim() || '临时聚餐/背包外食物';
        const kcal = parseFloat($('temp-food-kcal').value);
        const meal = getMeal();
        if (isNaN(kcal) || kcal < 0) { showToast('请填写预估热量', 'error'); $('temp-food-kcal').focus(); return; }

        const created = await api('/api/diary', 'POST', {
            date, foodId: 'temp_' + Date.now(), isTemporary: true, meal,
            name, rawAmount: 1, displayAmount: '1次', kcal,
            protein: parseFloat($('temp-food-protein').value) || 0,
            carbs:   parseFloat($('temp-food-carbs').value)   || 0,
            fat:     parseFloat($('temp-food-fat').value)     || 0
        });
        (state.diary[date] ||= []).push(created);
        lastAddedId = created.id;
        renderDiary({ celebrate: true });
        floatGain(created.kcal);
        ['temp-food-name', 'temp-food-kcal', 'temp-food-protein', 'temp-food-carbs', 'temp-food-fat'].forEach(id => { $(id).value = ''; });
        showToast(`已记录「${name}」到${MEALS[meal].label}`);
        syncAchievements();
    });
}

function openEditModal(index) {
    const entry = state.diary[diaryDate()][index];
    currentEditIndex = index;
    setMeal(MEALS[entry.meal] ? entry.meal : 'snack', 'modal-meal');
    const isTemp = entry.isTemporary;
    $('modal-field-container-standard').hidden = isTemp;
    $('modal-field-container-temp').hidden = !isTemp;

    if (isTemp) {
        $('modal-food-title').textContent = '编辑临时记录';
        $('m-temp-name').value    = entry.name;
        $('m-temp-kcal').value    = entry.kcal;
        $('m-temp-protein').value = entry.protein;
        $('m-temp-carbs').value   = entry.carbs;
        $('m-temp-fat').value     = entry.fat;
    } else {
        const food = state.foods.find(f => f.id === entry.foodId) || { unit: '单位' };
        $('modal-food-title').textContent   = `编辑「${entry.name}」`;
        $('modal-amount-label').textContent = `分量（${unitText(food.unit).trim()}）`;
        $('modal-food-amount').value        = entry.rawAmount || parseFloat(entry.displayAmount) || 100;
    }
    $('edit-dialog').showModal();
    revealMeal($('modal-meal-seg'), false);
}

function closeModal() { $('edit-dialog').close(); }

async function saveDiaryEdit() {
    if (currentEditIndex === null) return;
    const date = diaryDate();
    const index = currentEditIndex;
    const entry = state.diary[date][index];
    const meal = getMeal('modal-meal');
    let payload;

    if (entry.isTemporary) {
        const kcal = parseFloat($('m-temp-kcal').value);
        if (isNaN(kcal) || kcal < 0) { showToast('请填写热量', 'error'); return; }
        payload = {
            meal, name: $('m-temp-name').value.trim() || '临时食物',
            rawAmount: entry.rawAmount, displayAmount: entry.displayAmount, kcal,
            protein: parseFloat($('m-temp-protein').value) || 0,
            carbs:   parseFloat($('m-temp-carbs').value)   || 0,
            fat:     parseFloat($('m-temp-fat').value)     || 0
        };
    } else {
        const amount = parseFloat($('modal-food-amount').value) || 0;
        if (amount <= 0) { showToast('请填写大于 0 的分量', 'error'); return; }
        const food = state.foods.find(f => f.id === entry.foodId);
        if (!food) { showToast('这个食物已从背包删除，无法按分量重算', 'error'); closeModal(); return; }
        payload = {
            meal, name: entry.name,
            rawAmount: amount, displayAmount: amount + unitText(food.unit),
            ...scaleFood(food, amount)
        };
    }

    const updated = await api(`/api/diary/${entry.id}`, 'PUT', payload);
    state.diary[date][index] = updated;
    changedEntryId = updated.id;
    closeModal();
    renderDiary({ celebrate: true });
    showToast('记录已更新');
    syncAchievements();
}

// Each click adds/removes one original portion; the " x N" name suffix is the current multiplier
async function changeEntryPortion(index, delta) {
    const date  = diaryDate();
    const entry = state.diary[date][index];
    const match = entry.name.match(/^(.*) x (\d+)$/);
    const base  = match ? match[1] : entry.name;
    const mult  = match ? Number(match[2]) : 1;
    const next  = mult + delta;
    if (next < 1) return;
    const ratio = next / mult;
    const scale = v => Math.round(v * ratio * 100) / 100;
    const amountNum = parseFloat(entry.displayAmount);

    const updated = await api(`/api/diary/${entry.id}`, 'PUT', {
        meal: entry.meal, name: next > 1 ? `${base} x ${next}` : base,
        rawAmount: scale(entry.rawAmount),
        displayAmount: isNaN(amountNum) ? entry.displayAmount
            : entry.displayAmount.replace(String(amountNum), scale(amountNum)),
        kcal: scale(entry.kcal), protein: scale(entry.protein), carbs: scale(entry.carbs), fat: scale(entry.fat)
    });
    state.diary[date][index] = updated;
    changedEntryId = updated.id;
    renderDiary({ celebrate: true });
    showToast(next > 1 ? `「${base}」x ${next}` : `「${base}」已恢复一份`);
    syncAchievements();
}

async function deleteDiaryEntry(index) {
    const date  = diaryDate();
    const entry = state.diary[date][index];
    if (!entry || !(await showConfirm(`删除「${entry.name}」这条记录？`))) return;
    await api(`/api/diary/${entry.id}`, 'DELETE');
    const row = document.querySelector(`.entry[data-idx="${index}"]`);
    if (row && !reduceMotion.matches) {
        row.classList.add('is-leaving');
        await new Promise(r => setTimeout(r, 200));
    }
    state.diary[date].splice(index, 1);
    renderDiary();
    showToast('记录已删除', 'info');
    syncAchievements();
}

// ── Carb cycling ──
// Saves one date's element form (carb-cycle type, '' clears it); resolves false when the request failed
async function saveDayPlan(date, type) {
    try {
        if (type) await api(`/api/day-plan/${date}`, 'PUT', { type });
        else await api(`/api/day-plan/${date}`, 'DELETE');
    } catch {
        return false;
    }
    if (type) state.dayPlan[date] = type;
    else delete state.dayPlan[date];
    syncAchievements();
    return true;
}

async function setDayType(type) {
    const date = diaryDate();
    if (!(await saveDayPlan(date, type))) { $('day-type').value = state.dayPlan[date] || ''; return; }
    renderDiary();
}

function resetDiaryAnimation() { lanePct = {}; }

function initDiary(openWarehouse) {
    $('edit-dialog').addEventListener('close', () => { currentEditIndex = null; });

    $('food-list').addEventListener('change', e => {
        if (e.target.name === 'food') selectFood(e.target.value);
    });

    $('food-list').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); $('food-amount').focus(); }
    });

    // ── Init ──
    $('meal-seg').innerHTML = mealSegHtml('meal');

    $('modal-meal-seg').innerHTML = mealSegHtml('modal-meal');

    $('meal-seg').addEventListener('change', updateGoLabels);

    $('diary-date').value = localDate();
    document.querySelectorAll('[data-day-shift]').forEach(btn =>
        btn.addEventListener('click', () => shiftDay(Number(btn.dataset.dayShift))));
    document.querySelector('.date-label').addEventListener('click', openDatePicker);
    $('diary-date').addEventListener('change', () => renderDiary());
    $('btn-today').addEventListener('click', goToToday);
    $('day-type').addEventListener('change', e => setDayType(e.currentTarget.value));
    $('tab-food').addEventListener('click', () => switchMode('food'));
    $('tab-temp').addEventListener('click', () => switchMode('temp'));
    $('form-food').addEventListener('submit', e => { e.preventDefault(); addDiaryEntry(); });
    $('form-temp').addEventListener('submit', e => { e.preventDefault(); addTemporaryDiaryEntry(); });
    $('food-search').addEventListener('input', renderFoodPicker);
    $('food-search').addEventListener('keydown', onSearchKey);
    $('food-amount').addEventListener('input', updatePreview);
    $('food-amount').addEventListener('focus', e => e.currentTarget.select());
    document.querySelectorAll('[data-amount-step]').forEach(btn =>
        btn.addEventListener('click', () => stepAmount(Number(btn.dataset.amountStep))));
    $('food-list').addEventListener('click', e => {
        if (!e.target.closest('[data-new-food]')) return;
        openWarehouse();
        $('new-food').open = true;
        $('food-name').focus();
    });
    $('diary-log').addEventListener('click', e => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'quick-add') { focusQuickAdd(btn.dataset.meal); return; }
        const index = Number(btn.closest('.entry').dataset.idx);
        if (btn.dataset.action === 'edit') openEditModal(index);
        if (btn.dataset.action === 'portion') changeEntryPortion(index, Number(btn.dataset.delta));
        if (btn.dataset.action === 'delete') deleteDiaryEntry(index);
    });
    $('edit-dialog').querySelector('form').addEventListener('submit', e => { e.preventDefault(); saveDiaryEdit(); });
    document.querySelector('[data-close-diary]').addEventListener('click', closeModal);
}

export { resetDiaryAnimation, renderFoodPicker, renderDiary, initDiary, setMeal, getDefaultMeal, saveDayPlan };
