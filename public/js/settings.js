import { $, fmt, fmtKg, localDate, fmtMonthDay, WEEKDAYS, parseLocalDate, reduceMotion } from './helpers.js';
import { state } from './state.js';
import { computePlan, autoWaterTarget, DAY_TYPES, MACRO_META, applyOffset } from './nutrition.js';
import { tweenNumber, withBusy, showToast, showConfirm } from './ui.js';
import { api } from './api.js';
import { syncAchievements } from './achievements.js';

// ── Settings ──
// Activity level read as a character class: [class, icon, plain activity]
const CLASSES = {
    '1.2':   ['学者', 'menu_book', '久坐不动'],
    '1.375': ['旅人', 'hiking', '轻度活动'],
    '1.55':  ['冒险者', 'explore', '中度活动'],
    '1.725': ['战士', 'swords', '重度活动']
};

function renderCharStats(user) {
    const [job, jobIcon, activity] = CLASSES[String(user.activity)] || CLASSES['1.55'];
    const target = user.targetWeight;
    const tiles = [
        ['straighten', '身高', fmtKg(user.height), 'cm'],
        ['monitor_weight', '体重', fmtKg(user.weight), 'kg', '按最新称重'],
        ['cake', '年龄', String(user.age), '岁'],
        ['person', '性别', user.gender === 'female' ? '女' : '男'],
        [jobIcon, '职业', job, '', activity],
        ['flag', '终极目标', target ? fmtKg(target) : '未设定', target ? 'kg' : '']
    ];
    $('char-stats').innerHTML = tiles.map(([icon, label, value, unit, note], i) => `
        <div class="stat-tile" style="--i:${i}">
            <span class="ms" aria-hidden="true">${icon}</span>
            <dt>${label}</dt>
            <dd><b${/\d/.test(value) ? ' class="num"' : ''}>${value}</b>${unit ? `<small>${unit}</small>` : ''}${note ? `<em>${note}</em>` : ''}</dd>
        </div>`).join('');
}

// The sheet reads as stat tiles; 编辑属性 swaps in the form, and leaving edit mode drops unsaved edits
function setEditing(editing, focus = true) {
    $('char-panel').classList.toggle('is-editing', editing);
    if (focus) (editing ? $('user-height') : $('edit-settings')).focus({ preventScroll: true });
}

function fillSettingsForm() {
    $('user-height').value   = state.user.height;
    $('user-weight').value   = state.user.weight;
    $('user-age').value      = state.user.age;
    $('user-gender').value   = state.user.gender;
    $('user-activity').value = String(state.user.activity);
    $('user-target-weight').value = state.user.targetWeight ?? '';
    $('user-water-target').value = state.user.waterTarget ?? '';
    $('dirty-note').hidden = true;
    $('save-settings').disabled = true;
    $('char-panel').classList.remove('is-editing');
    renderCharStats(state.user);
    renderPlan(state.user);
}

function readSettingsForm() {
    return {
        height:   parseFloat($('user-height').value) || 170,
        weight:   state.user.weight,
        age:      parseInt($('user-age').value)      || 25,
        gender:   $('user-gender').value,
        activity: $('user-activity').value,
        targetWeight: parseFloat($('user-target-weight').value) || null,
        waterTarget: parseFloat($('user-water-target').value) || null
    };
}

function onSettingsInput() {
    const draft = readSettingsForm();
    const dirty = ['height', 'age', 'gender'].some(k => String(draft[k]) !== String(state.user[k]))
        || parseFloat(draft.activity) !== parseFloat(state.user.activity)
        || draft.targetWeight !== (state.user.targetWeight ?? null)
        || draft.waterTarget !== (state.user.waterTarget ?? null);
    $('dirty-note').hidden = !dirty;
    $('save-settings').disabled = !dirty;
    renderPlan(draft);
}

// Energy pool: the bar spans TDEE, the fill is the day's limit, the rest is the fat-loss deficit
function renderPlan(user) {
    const p = computePlan(user);
    tweenNumber($('plan-bmr'), p.bmr);
    tweenNumber($('plan-tdee'), p.tdee);
    tweenNumber($('plan-kcal'), p.kcal);
    tweenNumber($('plan-deficit'), p.tdee - p.kcal, n => `-${fmt(n)}`);
    $('pool-bar').style.setProperty('--fill', String(Math.min(p.kcal / p.tdee, 1)));
    $('pool-bar').style.setProperty('--bmr', String(Math.min(p.bmr / p.tdee, 1)));
    $('user-water-target').placeholder = `自动 ${fmt(autoWaterTarget(user.weight))}`;
    const split = [
        { key: 'protein', label: '蛋白', g: p.protein, kcal: p.protein * 4 },
        { key: 'carbs',   label: '碳水', g: p.carbs,   kcal: p.carbs * 4 },
        { key: 'fat',     label: '脂肪', g: p.fat,     kcal: p.fat * 9 }
    ];
    const total = split.reduce((s, x) => s + Math.max(x.kcal, 0), 0) || 1;
    $('split-bar').querySelectorAll('i').forEach((el, i) => { el.style.flexGrow = Math.max(split[i].kcal, 0); });
    $('gem-row').innerHTML = split.map((x, i) => `
        <div class="gem-socket" data-macro="${x.key}" style="--i:${i}">
            <span class="gem" aria-hidden="true"></span>
            <span class="gem-name">${x.label}</span>
            <b class="num">${fmt(x.g)}<small> g</small></b>
            <small>${Math.round(Math.max(x.kcal, 0) / total * 100)}% 热量</small>
        </div>`).join('');
}

function fillCycleForm() {
    $('cycle-rows').innerHTML = Object.entries(DAY_TYPES).map(([id, label]) => `
        <div class="cycle-row" data-type="${id}">
            <span class="cycle-name">${label}</span>
            <div class="cycle-result"></div>
            <div class="cycle-inputs">
                ${['carbs', 'fat'].map(k => `<label class="field"><span>${MACRO_META[k][0]}增减 g</span><input type="number" class="input" name="${k}" value="${state.dayTypes[id][k]}" min="-500" max="500" step="any" required></label>`).join('')}
            </div>
        </div>`).join('');
    renderCyclePreview();
}

function readCycleForm() {
    return Object.fromEntries([...document.querySelectorAll('.cycle-row')].map(row =>
        [row.dataset.type, Object.fromEntries([...row.querySelectorAll('input')].map(i => [i.name, Number(i.value)]))]));
}

function renderCyclePreview() {
    const plan = computePlan(state.user);
    const types = readCycleForm();
    document.querySelectorAll('.cycle-row').forEach(row => {
        const t = applyOffset(plan, types[row.dataset.type]);
        row.querySelector('.cycle-result').innerHTML = `<span><b class="num">${fmt(t.kcal)}</b> kcal</span><span>蛋白 ${fmt(t.protein)} · 碳水 ${fmt(t.carbs)} · 脂肪 ${fmt(t.fat)} g</span>`;
    });
}

async function saveDayTypes() {
    await withBusy($('save-cycle'), async () => {
        const types = readCycleForm();
        await api('/api/day-types', 'PUT', types);
        state.dayTypes = types;
        showToast('已保存碳循环目标');
        syncAchievements();
    });
}

async function saveSettings() {
    const btn = $('save-settings');
    await withBusy(btn, async () => {
        state.user = await api('/api/user', 'PUT', readSettingsForm());
        renderCyclePreview();
        showToast('已保存，每日目标已更新');
        syncAchievements();
    });
    fillSettingsForm();
    $('edit-settings').focus({ preventScroll: true });
    renderWeights();
}

// ── Weight log ──
function weightDeltaHtml(diff) {
    const r = Math.round(diff * 100) / 100;
    if (r === 0) return '<span class="w-delta">持平</span>';
    return `<span class="w-delta ${r < 0 ? 'is-down' : 'is-up'}"><span class="ms" role="img" aria-label="${r < 0 ? '下降' : '上升'}">${r < 0 ? 'arrow_downward' : 'arrow_upward'}</span>${fmtKg(Math.abs(r))}</span>`;
}

// Shows distance to the target weight once one is set (a gain goal counts upward), else the lowest weigh-in
function goalStatHtml(first, latest, list) {
    const target = state.user.targetWeight;
    if (!target) return `<div><span>最低</span><b class="num">${fmtKg(Math.min(...list.map(w => w.weight)))}</b><small>kg</small></div>`;
    const remaining = Math.round((target < first.weight ? latest.weight - target : target - latest.weight) * 100) / 100;
    return `<div><span>距目标 ${fmtKg(target)}</span>${remaining > 0 ? `<b class="num">${fmtKg(remaining)}</b><small>kg</small>` : '<b>已达成</b>'}</div>`;
}

// Share of the way from the first weigh-in to the target (a gain goal counts upward), clamped to [0, 1]
function weightProgress(start, current, target) {
    if (!target || target === start) return null;
    return Math.min(Math.max((start - current) / (start - target), 0), 1);
}

function renderWeightXp(first, latest) {
    const xp = $('weight-xp');
    const progress = latest ? weightProgress(first.weight, latest.weight, state.user.targetWeight) : null;
    xp.hidden = progress === null;
    if (progress === null) return;
    const pct = Math.round(progress * 100);
    xp.innerHTML = `
        <div class="xp-head"><span>目标进度</span><b class="num">${pct}<small>%</small></b><em>${fmtKg(first.weight)} → ${fmtKg(state.user.targetWeight)} kg</em></div>
        <div class="xp-track" role="progressbar" aria-label="体重目标进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="--p:${progress}"></i></div>`;
}

function renderWeights() {
    const list = state.weights;
    const today = localDate();
    $('weight-date').max = today;
    if (!$('weight-date').value) $('weight-date').value = today;

    const first = list[0], latest = list.at(-1);
    const change = latest ? Math.round((latest.weight - first.weight) * 100) / 100 : 0;
    $('weight-stats').innerHTML = latest ? `
        <div><span>当前</span><b class="num">${fmtKg(latest.weight)}</b><small>kg</small></div>
        <div><span>自${fmtMonthDay(first.date)}</span><b class="num">${change > 0 ? '+' : change < 0 ? '-' : ''}${fmtKg(Math.abs(change))}</b><small>kg</small></div>
        ${goalStatHtml(first, latest, list)}` : '';
    $('weight-stats').hidden = !latest;
    renderWeightXp(first, latest);

    $('weight-list').innerHTML = list.map((w, i) => {
        const day = fmtMonthDay(w.date);
        return `<li>
                <span class="w-date">${day}<small>${WEEKDAYS[parseLocalDate(w.date).getDay()]}</small></span>
                <span class="w-kg num">${fmtKg(w.weight)}</span>
                ${i ? weightDeltaHtml(w.weight - list[i - 1].weight) : '<span class="w-delta"></span>'}
                <span class="w-actions">
                    <button class="icon-btn" type="button" data-action="edit" data-date="${w.date}" aria-label="修改${day}的体重"><span class="ms" aria-hidden="true">edit</span></button>
                    <button class="icon-btn danger" type="button" data-action="delete" data-date="${w.date}" aria-label="删除${day}的体重"><span class="ms" aria-hidden="true">delete</span></button>
                </span>
            </li>`;
    }).reverse().join('');
    renderWeightChart(true);
}

// Time-scaled x keeps irregular weigh-in gaps honest; y zooms to the data range since a
// zero baseline would flatten a few kilos of change into a straight line
function renderWeightChart(animate = false) {
    const box = $('weight-chart');
    const width = box.clientWidth;
    if (!width) return;
    box.dataset.size = `${width}x${box.clientHeight}`;
    const pts = state.weights;
    if (!pts.length) { box.innerHTML = '<div class="weight-empty">记下第一次称重后，这里会显示体重趋势</div>'; return; }

    // The svg is absolutely positioned, so it fills the row height set by the list column without feeding back into it
    const height = box.clientHeight - 20, m = { top: 12, right: 52, bottom: 30, left: 44 };
    const plotW = width - m.left - m.right, plotH = height - m.top - m.bottom;
    const ts = pts.map(p => parseLocalDate(p.date).getTime());
    const t0 = ts[0], t1 = ts.at(-1);
    const x = t => m.left + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * plotW;

    const ws = pts.map(p => p.weight);
    const target = state.user.targetWeight;
    const lo0 = Math.min(...ws, target ?? Infinity), hi0 = Math.max(...ws, target ?? -Infinity);
    const ticksFor = step => {
        const lo = Math.floor(lo0 / step - 0.1) * step, hi = Math.ceil(hi0 / step + 0.1) * step;
        return { step, lo, hi, n: Math.round((hi - lo) / step) };
    };
    const { step, lo, hi, n } = [0.5, 1, 2, 5, 10, 20, 50].map(ticksFor).find(t => t.n <= 7);
    const y = v => m.top + (hi - v) / (hi - lo) * plotH;
    const yTicks = Array.from({ length: n + 1 }, (_, i) => lo + i * step);

    const months = [];
    for (const d = new Date(new Date(t0).getFullYear(), new Date(t0).getMonth() + 1, 1); d.getTime() <= t1; d.setMonth(d.getMonth() + 1)) {
        months.push({ t: d.getTime(), label: d.getMonth() === 0 ? `${d.getFullYear()}年1月` : `${d.getMonth() + 1}月` });
    }
    const every = Math.max(1, Math.ceil(months.length * 48 / plotW));
    const xTicks = months.length
        ? months.filter((_, i) => i % every === 0)
        : [...new Set([t0, t1])].map(t => ({ t, label: fmtMonthDay(localDate(new Date(t))) }));

    const xs = ts.map(x), ys = ws.map(y);
    const last = pts.length - 1;
    box.innerHTML = `
        <svg class="${animate ? 'is-drawing' : ''}" width="${width}" height="${height}" role="img" aria-label="体重趋势：${fmtMonthDay(pts[0].date)} ${fmtKg(ws[0])} kg，${fmtMonthDay(pts[last].date)} ${fmtKg(ws[last])} kg">
            <g class="grid axis">${yTicks.map(v => `<line x1="${m.left}" x2="${width - m.right}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end">${fmtKg(v)}</text>`).join('')}</g>
            <g class="axis">${xTicks.map(tk => `<text x="${x(tk.t)}" y="${height - 10}" text-anchor="middle">${tk.label}</text>`).join('')}</g>
            ${target ? `<g class="goal"><line x1="${m.left}" x2="${width - m.right}" y1="${y(target)}" y2="${y(target)}"/><text x="${m.left + 6}" y="${y(target) - 6 < m.top + 4 ? y(target) + 15 : y(target) - 6}">目标 ${fmtKg(target)} kg</text></g>` : ''}
            <line class="crosshair" y1="${m.top}" y2="${height - m.bottom}" visibility="hidden"/>
            <path class="series" d="${xs.map((px, i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${ys[i].toFixed(1)}`).join('')}" pathLength="1"/>
            <circle class="dot" r="4" cx="${xs[last]}" cy="${ys[last]}"/>
            <text class="end-label num" x="${xs[last] + 9}" y="${ys[last] + 4}">${fmtKg(ws[last])}</text>
            <circle class="dot hover-dot" r="4" visibility="hidden"/>
            <rect x="${m.left - 8}" y="0" width="${plotW + 16}" height="${height}" fill="transparent"/>
        </svg>
        <div class="chart-tip" hidden></div>`;

    const svg = box.querySelector('svg');
    const tip = box.querySelector('.chart-tip');
    const cross = svg.querySelector('.crosshair');
    const hoverDot = svg.querySelector('.hover-dot');
    const show = e => {
        const px = e.clientX - svg.getBoundingClientRect().left;
        const i = xs.reduce((best, v, j) => Math.abs(v - px) < Math.abs(xs[best] - px) ? j : best, 0);
        cross.setAttribute('x1', xs[i]);
        cross.setAttribute('x2', xs[i]);
        hoverDot.setAttribute('cx', xs[i]);
        hoverDot.setAttribute('cy', ys[i]);
        cross.setAttribute('visibility', 'visible');
        hoverDot.setAttribute('visibility', 'visible');

        const diff = i ? Math.round((ws[i] - ws[i - 1]) * 100) / 100 : null;
        const diffText = diff === null ? '' : diff === 0 ? '与上次持平' : `比上次 ${diff > 0 ? '+' : '-'}${fmtKg(Math.abs(diff))} kg`;
        tip.innerHTML = `${fmtMonthDay(pts[i].date)} ${WEEKDAYS[parseLocalDate(pts[i].date).getDay()]}<b class="num">${fmtKg(ws[i])} kg</b>${diffText}`;
        tip.hidden = false;
        // Sit above the point, or below it when there's no room
        const py = ys[i] + svg.getBoundingClientRect().top - box.getBoundingClientRect().top;
        const above = py - tip.offsetHeight - 14;
        tip.style.top = `${above >= 0 ? above : py + 14}px`;
        tip.style.left = `${Math.min(Math.max(xs[i] - tip.offsetWidth / 2, 0), width - tip.offsetWidth)}px`;
    };
    const hide = () => {
        tip.hidden = true;
        cross.setAttribute('visibility', 'hidden');
        hoverDot.setAttribute('visibility', 'hidden');
    };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', hide);
}

// Keeps any other unsaved edits in the settings form; only the weight field follows the log
function applySyncedWeight(user) {
    state.user = user;
    $('user-weight').value = user.weight;
    renderCharStats(user);
    onSettingsInput();
}

function logWeight() {
    return withBusy($('weight-save'), async () => {
        const date = $('weight-date').value;
        const weight = parseFloat($('weight-value').value);
        const existed = state.weights.some(w => w.date === date);
        const { entry, user } = await api(`/api/weights/${date}`, 'PUT', { weight });
        state.weights = [...state.weights.filter(w => w.date !== date), entry].sort((a, b) => a.date.localeCompare(b.date));
        applySyncedWeight(user);
        $('weight-value').value = '';
        $('weight-date').value = localDate();
        renderWeights();
        showToast(existed ? `已更新${fmtMonthDay(date)}的体重` : `已记录 ${fmtKg(weight)} kg`);
        syncAchievements();
    });
}

function editWeight(date) {
    $('weight-date').value = date;
    $('weight-value').value = state.weights.find(w => w.date === date).weight;
    $('weight-value').focus();
}

async function deleteWeight(date) {
    if (!(await showConfirm(`删除${fmtMonthDay(date)}的称重记录？`))) return;
    const { user } = await api(`/api/weights/${date}`, 'DELETE');
    state.weights = state.weights.filter(w => w.date !== date);
    applySyncedWeight(user);
    renderWeights();
    showToast('称重记录已删除', 'info');
    syncAchievements();
}

// theme.js (loaded in <head>) owns applying the theme; this control only saves the choice and signals it
function initThemePicker() {
    let pref = 'dark';
    try { pref = localStorage.getItem('macro_tracker_theme') || 'dark'; } catch { /* storage unavailable */ }
    (document.querySelector(`input[name="theme"][value="${pref}"]`) || document.querySelector('input[name="theme"]')).checked = true;
    $('theme-seg').addEventListener('change', e => {
        try { localStorage.setItem('macro_tracker_theme', e.target.value); } catch { /* storage unavailable */ }
        const swap = () => document.dispatchEvent(new Event('themechange'));
        // Cross-fades the whole page where View Transitions exist; elsewhere the swap is instant
        if (document.startViewTransition && !reduceMotion.matches) document.startViewTransition(swap);
        else swap();
    });
}

function initSettings() {
    initThemePicker();
    // Redraw on size changes: the settings page starts hidden, and the panel reflows with the window and list
    new ResizeObserver(() => {
        const box = $('weight-chart');
        if (box.clientWidth && `${box.clientWidth}x${box.clientHeight}` !== box.dataset.size) renderWeightChart();
    }).observe($('weight-chart'));
    $('edit-settings').addEventListener('click', () => setEditing(true));
    $('cancel-settings').addEventListener('click', () => { fillSettingsForm(); setEditing(false); });
    $('settings-form').addEventListener('input', onSettingsInput);
    $('settings-form').addEventListener('submit', e => { e.preventDefault(); saveSettings(); });
    $('user-gender').addEventListener('change', onSettingsInput);
    $('user-activity').addEventListener('change', onSettingsInput);
    $('user-water-target').addEventListener('input', onSettingsInput);
    $('cycle-form').addEventListener('input', renderCyclePreview);
    $('cycle-form').addEventListener('submit', e => { e.preventDefault(); saveDayTypes(); });
    document.querySelector('.weight-form').addEventListener('submit', e => { e.preventDefault(); logWeight(); });
    $('weight-list').addEventListener('click', e => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'edit') editWeight(btn.dataset.date);
        if (btn.dataset.action === 'delete') deleteWeight(btn.dataset.date);
    });
}

export { fillSettingsForm, fillCycleForm, renderWeights, initSettings, weightProgress };
