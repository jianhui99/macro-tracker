import { moveSegThumb, hideFloatTip, tweenNumber, replay, showFloatTipAt } from './ui.js';
import { MEAL_ORDER, sumEntries, targetsFor, MACRO_KEYS, kcalStatus, MEALS, computePlan, recordingStreak, dayStatus, FINISH_SCALE, MACRO_META, macroIcon } from './nutrition.js';
import { state } from './state.js';
import { parseLocalDate, localDate, $, ymd, fmtKg, fmt, reduceMotion, WEEKDAYS, esc, fmtMonthDay } from './helpers.js';
import { waterTotal } from './water.js';

let summaryCurrentDate = new Date();

// ── Summary ──
let summaryPeriod = 'month';

const STATUS_ICONS = { ok: 'check', over: 'arrow_upward', under: 'arrow_downward' };

function changeSummaryPeriod(offset) {
    const d = summaryCurrentDate;
    summaryCurrentDate = summaryPeriod === 'year'
        ? new Date(d.getFullYear() + offset, d.getMonth(), 1)
        : new Date(d.getFullYear(), d.getMonth() + offset, 1);
    renderSummary(true);
}

function setSummaryPeriod(period) {
    summaryPeriod = period;
    renderSummary(true);
}

function openSummaryMonth(year, month) {
    summaryPeriod = 'month';
    const monthInput = document.querySelector('input[name="summary-period"][value="month"]');
    monthInput.checked = true;
    moveSegThumb(monthInput.closest('.seg'));
    summaryCurrentDate = new Date(year, month, 1);
    renderSummary(true);
    document.querySelector('main').scrollTop = 0;
    window.scrollTo(0, 0);
}

// Aggregates every recorded day (kcal > 0, same rule as the calendar) in [from, to].
// Each day is judged against its own target; `target` is their average for period-level displays.
function periodStats(from, to) {
    const stats = {
        recorded: 0, compliant: 0,
        sum: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
        mealKcal: Object.fromEntries(MEAL_ORDER.map(m => [m, 0])),
        byMonth: Array.from({ length: 12 }, () => ({ recorded: 0, compliant: 0, kcal: 0 })),
        byWeekday: Array.from({ length: 7 }, () => ({ recorded: 0, kcal: 0, dev: 0 })),
        daily: {}, proteinDays: 0,
        foods: [], weightChange: null
    };
    const foods = new Map();
    const targetSum = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    for (const ds of Object.keys(state.diary)) {
        if (ds < from || ds > to) continue;
        const entries = state.diary[ds];
        const t = sumEntries(entries);
        if (t.kcal <= 0) continue;
        const targets = targetsFor(ds);
        MACRO_KEYS.forEach(k => { targetSum[k] += targets[k]; });
        const ok = kcalStatus(t.kcal, targets.kcal) === 'ok';
        const month = stats.byMonth[Number(ds.slice(5, 7)) - 1];
        stats.recorded++;
        stats.compliant += ok;
        month.recorded++;
        month.compliant += ok;
        month.kcal += t.kcal;
        const weekday = stats.byWeekday[parseLocalDate(ds).getDay()];
        weekday.recorded++;
        weekday.kcal += t.kcal;
        weekday.dev += t.kcal - targets.kcal;
        stats.daily[ds] = t.kcal;
        stats.proteinDays += t.protein >= targets.protein;
        MACRO_KEYS.forEach(k => { stats.sum[k] += t[k]; });
        for (const e of entries) {
            stats.mealKcal[MEALS[e.meal] ? e.meal : 'snack'] += e.kcal;
            // Portion edits rename entries "X x 2", so group by food id and show the warehouse name
            const key = e.isTemporary ? `temp:${e.name}` : e.foodId;
            const name = (!e.isTemporary && state.foods.find(f => f.id === e.foodId)?.name) || e.name.replace(/ x \d+$/, '');
            const food = foods.get(key) || { name, count: 0, kcal: 0 };
            food.count++;
            food.kcal += e.kcal;
            foods.set(key, food);
        }
    }
    stats.avg = Object.fromEntries(MACRO_KEYS.map(k => [k, stats.recorded ? stats.sum[k] / stats.recorded : 0]));
    stats.target = stats.recorded
        ? Object.fromEntries(MACRO_KEYS.map(k => [k, targetSum[k] / stats.recorded]))
        : computePlan(state.user);
    stats.foods = [...foods.values()].sort((a, b) => b.count - a.count || b.kcal - a.kcal).slice(0, 8);
    const weighIns = state.weights.filter(w => w.date >= from && w.date <= to);
    if (weighIns.length >= 2) stats.weightChange = Math.round((weighIns.at(-1).weight - weighIns[0].weight) * 100) / 100;
    return stats;
}

// Only days with a drink logged count; each is judged against its own goal
function waterStats(from, to) {
    const days = Object.keys(state.water).filter(ds => ds >= from && ds <= to && state.water[ds].length).sort();
    const daily = Object.fromEntries(days.map(ds => [ds, waterTotal(ds)]));
    const total = days.reduce((sum, ds) => sum + daily[ds], 0);
    return {
        days: days.length,
        daily,
        hydrated: days.filter(ds => daily[ds] >= targetsFor(ds).water).length,
        avg: days.length ? total / days.length : 0,
        best: days.reduce((best, ds) => (best && daily[best] >= daily[ds] ? best : ds), null),
        goal: days.length ? days.reduce((sum, ds) => sum + targetsFor(ds).water, 0) / days.length : targetsFor(localDate()).water
    };
}

function renderSummary(animate = false) {
    const year  = summaryCurrentDate.getFullYear();
    const month = summaryCurrentDate.getMonth();
    const isYear = summaryPeriod === 'year';
    const monthDays = new Date(year, month + 1, 0).getDate();
    const yearDays = new Date(year, 1, 29).getMonth() === 1 ? 366 : 365;

    $('summary-month-label').textContent = isYear ? `${year}年` : `${year}年${month + 1}月`;
    $('summary-prev').setAttribute('aria-label', isYear ? '上一年' : '上个月');
    $('summary-next').setAttribute('aria-label', isYear ? '下一年' : '下个月');
    $('summary-board').setAttribute('aria-label', isYear ? '全年数据' : '本月数据');
    $('summary-month').hidden = isYear;
    $('summary-year').hidden = !isYear;
    hideFloatTip();

    const from = isYear ? ymd(year, 0, 1) : ymd(year, month, 1);
    const to = isYear ? ymd(year, 11, 31) : ymd(year, month, monthDays);
    const stats = periodStats(from, to);
    const water = waterStats(from, to);
    const targets = stats.target;
    const totalDays = isYear ? yearDays : monthDays;
    const today = localDate();
    const elapsed = from > today ? 0 : to <= today ? totalDays
        : Math.round((parseLocalDate(today) - parseLocalDate(from)) / 86400000) + 1;

    if (isYear) renderYearView(year, stats, targets, animate);
    else renderCalendar(year, month, targets, animate);
    renderSummaryBoard(stats, water, targets, totalDays, isYear);
    renderWaterSummary(water, year, isYear ? null : month, animate);
    summaryTrend = { from, totalDays, daily: stats.daily, target: targets.kcal, isYear };
    renderTrendChart(animate);
    renderInsights(stats, targets, elapsed, animate);
}

function renderSummaryBoard(stats, water, targets, totalDays, isYear) {
    tweenNumber($('sum-streak'), recordingStreak());
    const { recorded, compliant, weightChange } = stats;
    const avgKcal = Math.round(stats.avg.kcal);
    const compliance = recorded ? Math.round(compliant / recorded * 100) : 0;
    const weightText = weightChange === null ? '-' : `${weightChange > 0 ? '+' : weightChange < 0 ? '-' : ''}${fmtKg(Math.abs(weightChange))}`;
    $('monthly-stats').innerHTML = `
        <div class="stat"><span>${isYear ? '全年记录' : '本月记录'}</span><b class="num">${recorded}<small>/ ${totalDays} 天</small></b></div>
        <div class="stat"><span>达标天数</span><b class="num">${compliant}<small>天</small></b></div>
        <div class="stat"><span>达标率</span><b class="num">${recorded ? compliance : '-'}<small>${recorded ? '%' : ''}</small></b></div>
        <div class="stat"><span>日均热量</span><b class="num">${avgKcal ? fmt(avgKcal) : '-'}<small>${avgKcal ? `/ ${fmt(targets.kcal)}` : ''}</small></b></div>
        <div class="stat"><span>饮水达标</span><b class="num">${water.hydrated}<small>天</small></b></div>
        <div class="stat"><span>体重变化</span><b class="num">${weightText}<small>${weightChange === null ? '' : 'kg'}</small></b></div>`;
}

function renderCalendar(year, month, targets, animate) {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays     = new Date(year, month + 1, 0).getDate();
    const todayStr      = localDate();

    let html = '';
    for (let i = 0; i < firstDayIndex; i++) html += '<div class="cal-day is-blank" aria-hidden="true"></div>';

    for (let day = 1; day <= totalDays; day++) {
        const dateStr = ymd(year, month, day);
        const isFuture = dateStr > todayStr;
        const { status, kcal, diff } = dayStatus(dateStr, targetsFor(dateStr).kcal);
        const i = firstDayIndex + day;
        const cls = ['cal-day', isFuture && 'is-future', dateStr === todayStr && 'is-today', status !== 'none' && `st-${status}`].filter(Boolean).join(' ');

        let inner = `<div class="cal-top"><span class="cal-date">${day}</span>${kcal > 0 ? `<span class="cal-kcal num">${fmt(kcal)}</span>` : ''}</div>`;
        if (status !== 'none') {
            const label = status === 'ok' ? '达标' : status === 'over' ? `+${fmt(diff)}` : `${fmt(diff)}`;
            const width = Math.min(kcal / targets.kcal, FINISH_SCALE) / FINISH_SCALE * 100;
            inner += `<div class="cal-status"><span class="ms" aria-hidden="true">${STATUS_ICONS[status]}</span><span>${label}</span></div>
                      <div class="cal-bar"><i style="width:${width}%"></i></div>`;
        }
        const drank = waterTotal(dateStr);
        const hydrated = drank > 0 && drank >= targetsFor(dateStr).water;
        if (drank > 0) inner += `<span class="ms cal-water${hydrated ? ' is-full' : ''}" aria-hidden="true">water_drop</span>`;
        const waterLabel = drank > 0 ? `，饮水 ${fmt(drank)} ml${hydrated ? '，已喝够' : ''}` : '';

        html += isFuture
            ? `<div class="${cls}" style="--i:${i}">${inner}</div>`
            : `<button class="${cls}" style="--i:${i}" data-date="${dateStr}" aria-label="${month + 1}月${day}日${kcal > 0 ? `，${fmt(kcal)} kcal` : '，无记录'}${waterLabel}">${inner}</button>`;
    }

    const grid = $('calendar-grid');
    grid.innerHTML = html;
    grid.classList.remove('is-entering');
    if (animate && !reduceMotion.matches) replay(grid, 'is-entering');
}

function renderYearView(year, stats, targets, animate) {
    const todayStr = localDate();
    const statusText = { ok: '达标', over: '超标', under: '缺口过大' };

    $('heatmap').innerHTML = Array.from({ length: 12 }, (_, m) => {
        const days = new Date(year, m + 1, 0).getDate();
        const cells = Array.from({ length: 31 }, (_, i) => {
            const day = i + 1;
            if (day > days) return '<span class="hm-cell is-void" aria-hidden="true"></span>';
            const ds = ymd(year, m, day);
            if (ds > todayStr) return '<span class="hm-cell is-future" aria-hidden="true"></span>';
            const { status, kcal, diff } = dayStatus(ds, targetsFor(ds).kcal);
            const label = status === 'none' ? '无记录'
                : status === 'ok' ? '达标' : `${statusText[status]} ${diff > 0 ? '+' : ''}${fmt(diff)}`;
            const tip = `${m + 1}月${day}日 ${WEEKDAYS[new Date(year, m, day).getDay()]}${kcal > 0 ? `<b class="num">${fmt(kcal)} kcal</b>` : '<br>'}${label}`;
            const cls = `hm-cell st-${status}${ds === todayStr ? ' is-today' : ''}`;
            return `<button class="${cls}" data-tip="${esc(tip)}" data-date="${ds}" aria-label="${m + 1}月${day}日，${kcal > 0 ? `${fmt(kcal)} kcal，` : ''}${label}"></button>`;
        }).join('');
        return `<div class="hm-row" style="--i:${m}"><button class="hm-month" data-year="${year}" data-month="${m}" aria-label="查看${m + 1}月">${m + 1}月</button>${cells}</div>`;
    }).join('');

    // Bars share one y-scale with the target line, rounded up to a clean tick step
    const avgs = stats.byMonth.map(m => m.recorded ? m.kcal / m.recorded : 0);
    const step = Math.max(...avgs, targets.kcal) > 4000 ? 1000 : 500;
    const top = Math.ceil(Math.max(...avgs, targets.kcal) * 1.08 / step) * step;
    const pct = v => v / top * 100;
    const now = new Date();
    const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step)
        .map(v => `<div class="mbar-tick" style="bottom:${pct(v)}%"><span>${fmt(v)}</span></div>`).join('');
    const cols = stats.byMonth.map((m, i) => {
        const avg = avgs[i];
        const rate = m.recorded ? Math.round(m.compliant / m.recorded * 100) : 0;
        const tip = m.recorded
            ? `${i + 1}月<b class="num">日均 ${fmt(avg)} kcal</b>记录 ${m.recorded} 天 · 达标率 ${rate}%`
            : `${i + 1}月<br>没有记录`;
        const isCurrent = year === now.getFullYear() && i === now.getMonth();
        return `<button class="mbar-col${m.recorded ? '' : ' is-empty'}${isCurrent ? ' is-current' : ''}" style="--i:${i}" data-tip="${esc(tip)}" data-year="${year}" data-month="${i}" aria-label="${i + 1}月，${m.recorded ? `日均 ${fmt(avg)} kcal，达标率 ${rate}%` : '没有记录'}">
                <i style="height:${pct(avg)}%"></i><span>${i + 1}月</span>
            </button>`;
    }).join('');
    $('month-bars').innerHTML = `${ticks}<div class="mbar-target" style="bottom:${pct(targets.kcal)}%"><span>目标 ${fmt(targets.kcal)}</span></div><div class="mbar-cols">${cols}</div>`;

    const grid = $('summary-year');
    grid.classList.remove('is-entering');
    $('heatmap').classList.remove('is-entering');
    if (animate && !reduceMotion.matches) { replay(grid, 'is-entering'); replay($('heatmap'), 'is-entering'); }
}

// `month` is null for the year view, which shows each month's average over its logged days
function renderWaterSummary(water, year, month, animate) {
    const body = $('wsum-body');
    const panel = $('water-sum');
    panel.classList.remove('is-entering');
    if (!water.days) { body.innerHTML = '<div class="empty">这段时间还没有饮水记录</div>'; return; }

    const today = localDate();
    const cols = month === null
        ? Array.from({ length: 12 }, (_, m) => {
            const days = Object.keys(water.daily).filter(ds => Number(ds.slice(5, 7)) === m + 1);
            const avg = days.length ? days.reduce((sum, ds) => sum + water.daily[ds], 0) / days.length : 0;
            const goal = days.length ? days.reduce((sum, ds) => sum + targetsFor(ds).water, 0) / days.length : water.goal;
            const tip = days.length ? `${m + 1}月<b class="num">日均 ${fmt(avg)} ml</b>记录 ${days.length} 天` : `${m + 1}月<br>没有饮水记录`;
            return { ml: avg, hit: days.length && avg >= goal, label: `${m + 1}月`, tip, action: `data-year="${year}" data-month="${m}"` };
        })
        : Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => {
            const ds = ymd(year, month, i + 1);
            const ml = water.daily[ds] || 0;
            const goal = targetsFor(ds).water;
            const tip = `${month + 1}月${i + 1}日<b class="num">${fmt(ml)} ml</b>${ml >= goal ? '喝够目标' : `目标 ${fmt(goal)} ml`}`;
            return { ml, hit: ml > 0 && ml >= goal, label: i === 0 || (i + 1) % 5 === 0 ? i + 1 : '', tip, action: ds > today ? null : `data-date="${ds}"` };
        });

    const maxMl = Math.max(...cols.map(c => c.ml), water.goal);
    const step = maxMl > 2500 ? 1000 : 500;
    const top = Math.ceil(maxMl * 1.08 / step) * step;
    const pct = v => v / top * 100;
    const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step)
        .map(v => `<div class="mbar-tick" style="bottom:${pct(v)}%"><span>${fmt(v)}</span></div>`).join('');
    const bars = cols.map((c, i) => {
        const cls = `mbar-col${c.ml ? '' : ' is-empty'}${c.hit ? ' is-hit' : ''}`;
        const inner = `<i style="height:${pct(c.ml)}%"></i><span>${c.label}</span>`;
        return c.action
            ? `<button class="${cls}" style="--i:${i}" data-tip="${esc(c.tip)}" ${c.action} aria-label="${esc(c.tip.replace(/<[^>]+>/g, ' '))}">${inner}</button>`
            : `<div class="${cls}" style="--i:${i}" aria-hidden="true">${inner}</div>`;
    }).join('');

    const best = water.best;
    body.innerHTML = `
        <div class="wsum-stats">
            <div class="wsum-hero"><span>日均饮水</span><b class="num">${fmt(water.avg)}</b><small>/ ${fmt(water.goal)} ml</small></div>
            <div class="ins-row">
                <div class="ins-head"><span class="ms" aria-hidden="true">water_full</span><span class="ins-name">喝够目标</span><b class="num">${water.hydrated}</b><small>/ ${water.days} 天</small></div>
                <div class="ins-track"><i style="width:${water.hydrated / water.days * 100}%"></i></div>
            </div>
            <div class="ins-row">
                <div class="ins-head"><span class="ms" aria-hidden="true">emoji_events</span><span class="ins-name">单日最多</span><b class="num">${fmt(water.daily[best])}</b><small>ml · ${fmtMonthDay(best)}</small></div>
            </div>
        </div>
        <div class="mbar-chart wsum-chart">${ticks}<div class="mbar-target" style="bottom:${pct(water.goal)}%"><span>目标 ${fmt(water.goal)}</span></div><div class="mbar-cols" style="grid-template-columns: repeat(${cols.length}, minmax(0, 1fr))">${bars}</div></div>`;
    if (animate && !reduceMotion.matches) replay(panel, 'is-entering');
}

function renderInsights(stats, targets, elapsed, animate) {
    const empty = '<div class="empty">这段时间还没有记录</div>';
    $('ins-rings-hint').textContent = elapsed ? `已过 ${elapsed} 天` : '';
    if (!stats.recorded) {
        ['ins-rings', 'ins-donut', 'ins-weekday', 'ins-macros', 'ins-meals', 'ins-foods'].forEach(id => { $(id).innerHTML = empty; });
        return;
    }
    renderRings(stats, elapsed);
    renderDonut(stats, targets);
    renderWeekdays(stats);
    const bar = (ratio, goal = false) => `<div class="ins-track${goal ? ' has-goal' : ''}"><i style="width:${Math.min(Math.max(ratio, 0), 1) * 100}%"></i></div>`;

    // Same rules as the diary scoreboard: protein past target is the goal, anything else past it is overshoot
    $('ins-macros').innerHTML = MACRO_KEYS.map(key => {
        const [label, unit] = MACRO_META[key];
        const avg = stats.avg[key], target = targets[key];
        const ratio = target > 0 ? avg / target : 0;
        const overPct = Math.round((ratio - 1) * 100);
        const done = key === 'protein' && ratio >= 1;
        const over = key !== 'protein' && overPct > 0;
        const flag = done ? '<span class="ins-flag is-done"><span class="ms" aria-hidden="true">check</span>达标</span>'
            : over ? `<span class="ins-flag is-over">+${overPct}%</span>`
            : `<span class="ins-flag">${Math.round(ratio * 100)}%</span>`;
        return `<div class="ins-row">
                <div class="ins-head">${macroIcon(key)}<span class="ins-name">${label}</span><b class="num">${fmt(avg)}</b><small>/ ${fmt(target)} ${unit}</small>${flag}</div>
                ${bar(Math.min(ratio, FINISH_SCALE) / FINISH_SCALE, true)}
            </div>`;
    }).join('');

    const totalKcal = stats.sum.kcal;
    $('ins-meals').innerHTML = MEAL_ORDER
        .filter(m => stats.mealKcal[m] > 0)
        .sort((a, b) => stats.mealKcal[b] - stats.mealKcal[a])
        .map(m => {
            const share = stats.mealKcal[m] / totalKcal;
            return `<div class="ins-row">
                    <div class="ins-head"><span class="ms" aria-hidden="true">${MEALS[m].icon}</span><span class="ins-name">${MEALS[m].label}</span><b class="num">${Math.round(share * 100)}%</b><small>日均 ${fmt(stats.mealKcal[m] / stats.recorded)} kcal</small></div>
                    ${bar(share)}
                </div>`;
        }).join('');

    const maxCount = stats.foods[0]?.count || 1;
    $('ins-foods').innerHTML = stats.foods.map(f => `<div class="ins-row">
            <div class="ins-head"><span class="ins-name">${esc(f.name)}</span><b class="num">${f.count}</b><small>次 · ${fmt(f.kcal)} kcal</small></div>
            ${bar(f.count / maxCount)}
        </div>`).join('');

    const grid = $('insight-grid');
    grid.classList.remove('is-entering');
    if (animate && !reduceMotion.matches) replay(grid, 'is-entering');
}

function renderRings(stats, elapsed) {
    const C = 2 * Math.PI * 38;
    const rings = [
        { label: '记录率', value: elapsed ? stats.recorded / elapsed : 0, sub: `${stats.recorded} / ${elapsed} 天` },
        { label: '达标率', value: stats.compliant / stats.recorded, sub: `${stats.compliant} / ${stats.recorded} 天` },
        { label: '蛋白达标', value: stats.proteinDays / stats.recorded, sub: `${stats.proteinDays} / ${stats.recorded} 天` }
    ];
    $('ins-rings').innerHTML = rings.map(r => {
        const pct = Math.round(Math.min(r.value, 1) * 100);
        return `<div class="ring">
                <div class="ring-wrap">
                    <svg viewBox="0 0 88 88" aria-hidden="true"><circle class="ring-track" cx="44" cy="44" r="38"/>${pct ? `<circle class="ring-fill" cx="44" cy="44" r="38" stroke-dasharray="${C * pct / 100} ${C}"/>` : ''}</svg>
                    <b class="num">${pct}<small>%</small></b>
                </div>
                <span>${r.label}</span><em>${r.sub}</em>
            </div>`;
    }).join('');
}

function renderDonut(stats, targets) {
    const parts = [
        { key: 'protein', label: '蛋白', color: 'var(--c-protein)', kcal: stats.sum.protein * 4, goal: targets.protein * 4 },
        { key: 'carbs',   label: '碳水', color: 'var(--c-carbs)',   kcal: stats.sum.carbs * 4,   goal: targets.carbs * 4 },
        { key: 'fat',     label: '脂肪', color: 'var(--c-fat)',     kcal: stats.sum.fat * 9,     goal: targets.fat * 9 }
    ];
    const total = parts.reduce((t, p) => t + p.kcal, 0) || 1;
    const goalTotal = parts.reduce((t, p) => t + p.goal, 0) || 1;
    const C = 2 * Math.PI * 52;
    const gap = 2;
    let offset = 0;
    // Segments are dashes on one circle; a 2px gap between them keeps adjacent hues apart
    const arcs = parts.map(p => {
        const len = p.kcal / total * C;
        const arc = `<circle cx="66" cy="66" r="52" stroke="${p.color}" stroke-dasharray="${Math.max(len - gap, 0)} ${C}" stroke-dashoffset="${-offset}"
            data-tip="${esc(`${p.label}<b class="num">${Math.round(p.kcal / total * 100)}%</b>日均 ${fmt(p.kcal / stats.recorded)} kcal`)}"/>`;
        offset += len;
        return arc;
    }).join('');
    $('ins-donut').innerHTML = `<div class="donut">
            <div class="donut-chart"><svg viewBox="0 0 132 132" role="img" aria-label="${parts.map(p => `${p.label} ${Math.round(p.kcal / total * 100)}%`).join('，')}">${arcs}</svg>
                <div class="donut-center"><span>日均</span><b class="num">${fmt(stats.avg.kcal)}</b><small>kcal</small></div>
            </div>
            <div class="donut-legend">${parts.map(p => {
                const share = Math.round(p.kcal / total * 100), goal = Math.round(p.goal / goalTotal * 100);
                const diff = share - goal;
                return `<div class="dl-row"><i style="background:${p.color}"></i><span>${p.label}</span><b class="num">${share}%</b>
                        <small>目标 ${goal}%${diff ? `，${diff > 0 ? '高' : '低'} ${Math.abs(diff)} 个百分点` : '，正好'}</small></div>`;
            }).join('')}</div>
        </div>`;
}

function renderWeekdays(stats) {
    const order = [1, 2, 3, 4, 5, 6, 0];
    const devs = order.map(d => {
        const w = stats.byWeekday[d];
        return w.recorded ? { d, avg: w.kcal / w.recorded, dev: w.dev / w.recorded, n: w.recorded } : { d, n: 0 };
    });
    // Symmetric scale around the target, rounded to 100 kcal with a 300 kcal floor
    const max = Math.max(300, Math.ceil(Math.max(...devs.filter(x => x.n).map(x => Math.abs(x.dev))) / 100) * 100);
    const pos = dev => 50 + dev / max * 50;
    $('ins-weekday').innerHTML = devs.map(({ d, avg, dev, n }) => {
        const weekend = d === 0 || d === 6 ? ' is-weekend' : '';
        if (!n) return `<div class="wd-row${weekend}"><span class="wd-name">${WEEKDAYS[d]}</span><div class="wd-track"></div><span class="wd-val">-</span></div>`;
        const left = Math.min(50, pos(dev)), width = Math.abs(pos(dev) - 50);
        const tip = `${WEEKDAYS[d]}<b class="num">日均 ${fmt(avg)} kcal</b>记录 ${n} 天`;
        return `<div class="wd-row${weekend}" data-tip="${esc(tip)}">
                <span class="wd-name">${WEEKDAYS[d]}</span>
                <div class="wd-track"><i class="wd-stem" style="left:${left}%;width:${width}%;transform-origin:${dev < 0 ? 'right' : 'left'}"></i><b class="wd-dot st-${kcalStatus(dev, 0)}" style="left:${pos(dev)}%"></b></div>
                <span class="wd-val num">${dev > 0 ? '+' : ''}${fmt(dev)}</span>
            </div>`;
    }).join('') + `<div class="wd-axis"><span></span><div><span>-${fmt(max)}</span><span>目标</span><span>+${fmt(max)}</span></div><span></span></div>`;
}

// Day-level line chart for the current period: daily dots, a trailing 7-day average and the compliance band
let summaryTrend = null;

function renderTrendChart(animate = false) {
    const box = $('trend-chart');
    const width = box.clientWidth;
    if (!width || !summaryTrend) return;
    box.dataset.w = width;
    const { from, totalDays, daily, target, isYear } = summaryTrend;
    const today = localDate();
    const start = parseLocalDate(from);
    const days = Array.from({ length: totalDays }, (_, i) => {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        return { d, ds: localDate(d) };
    });
    const pastDays = days.filter(x => x.ds <= today);
    const values = days.map(x => daily[x.ds] ?? null);
    if (!values.some(v => v !== null)) { box.innerHTML = '<div class="weight-empty">这段时间还没有记录</div>'; return; }

    const ma = values.map((_, i) => {
        if (days[i].ds > today) return null;
        const win = values.slice(Math.max(0, i - 6), i + 1).filter(v => v !== null);
        return win.length ? win.reduce((a, b) => a + b, 0) / win.length : null;
    });

    const height = box.clientHeight, m = { top: 12, right: 16, bottom: 26, left: 48 };
    const plotW = width - m.left - m.right, plotH = height - m.top - m.bottom;
    const maxV = Math.max(...values.filter(v => v !== null), target + 50);
    const step = maxV > 4000 ? 1000 : 500;
    const top = Math.ceil(maxV * 1.05 / step) * step;
    const x = i => m.left + (totalDays === 1 ? plotW / 2 : i / (totalDays - 1) * plotW);
    const y = v => m.top + (1 - v / top) * plotH;

    const yTicks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
    const xTicks = isYear
        ? days.map((x, i) => ({ i, d: x.d })).filter(t => t.d.getDate() === 1).map(t => ({ i: t.i, label: `${t.d.getMonth() + 1}月` }))
        : days.map((x, i) => ({ i, d: x.d })).filter(t => [1, 8, 15, 22, 29].includes(t.d.getDate())).map(t => ({ i: t.i, label: `${t.d.getDate()}日` }));
    const every = Math.max(1, Math.ceil(xTicks.length * 40 / plotW));

    let path = '';
    ma.forEach((v, i) => { if (v !== null) path += `${path && ma[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
    const r = isYear ? 2 : 3.5;

    box.innerHTML = `
        <svg class="${animate ? 'is-drawing' : ''}" width="${width}" height="${height}" role="img" aria-label="每日热量趋势，目标 ${fmt(target)} kcal">
            <rect class="band" x="${m.left}" width="${plotW}" y="${y(target + 50)}" height="${y(target - 300) - y(target + 50)}"/>
            <g class="grid axis">${yTicks.map(v => `<line x1="${m.left}" x2="${width - m.right}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join('')}</g>
            <g class="axis">${xTicks.filter((_, i) => i % every === 0).map(t => `<text x="${x(t.i)}" y="${height - 8}" text-anchor="middle">${t.label}</text>`).join('')}</g>
            <text class="band-label" x="${width - m.right - 4}" y="${y(target + 50) - 5}" text-anchor="end">目标 ${fmt(target)}</text>
            <line class="crosshair" y1="${m.top}" y2="${height - m.bottom}" visibility="hidden"/>
            ${values.map((v, i) => v === null ? '' : `<circle class="day-dot" r="${r}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}"/>`).join('')}
            <path class="ma" d="${path}" pathLength="1"/>
            <circle class="hover-dot" r="4.5" visibility="hidden"/>
            <rect x="${m.left - 6}" y="0" width="${plotW + 12}" height="${height}" fill="transparent"/>
        </svg>`;

    const svg = box.querySelector('svg');
    const cross = svg.querySelector('.crosshair');
    const dot = svg.querySelector('.hover-dot');
    const lastIdx = pastDays.length - 1;
    const show = e => {
        if (lastIdx < 0) return;
        const px = e.clientX - svg.getBoundingClientRect().left;
        const i = Math.min(lastIdx, Math.max(0, Math.round((px - m.left) / plotW * (totalDays - 1))));
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
        const v = values[i];
        if (v !== null) { dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(v)); dot.setAttribute('visibility', 'visible'); }
        else dot.setAttribute('visibility', 'hidden');
        const d = days[i].d;
        const status = v === null ? '' : { ok: '达标', over: '超标', under: '缺口过大' }[kcalStatus(v, targetsFor(days[i].ds).kcal)];
        const html = `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}<b class="num">${v === null ? '无记录' : `${fmt(v)} kcal`}</b>${status}${ma[i] !== null ? `${status ? ' · ' : ''}7 日均 ${fmt(ma[i])}` : ''}`;
        const rect = svg.getBoundingClientRect();
        showFloatTipAt(html, rect.left + x(i), rect.top + (v === null ? m.top + plotH / 2 : y(v)));
    };
    const hide = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideFloatTip(); };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', hide);
}

function initSummary(navigateToDay) {
    new ResizeObserver(() => {
        const box = $('trend-chart');
        if (box.clientWidth && String(box.clientWidth) !== box.dataset.w) renderTrendChart();
    }).observe($('trend-chart'));
    document.querySelector('input[name="summary-period"]').closest('fieldset').addEventListener('change', e => setSummaryPeriod(e.target.value));
    $('summary-prev').addEventListener('click', () => changeSummaryPeriod(-1));
    $('summary-next').addEventListener('click', () => changeSummaryPeriod(1));
    $('page-summary').addEventListener('click', e => {
        const btn = e.target.closest('button[data-date], button[data-month]');
        if (!btn) return;
        if (btn.dataset.date) navigateToDay(btn.dataset.date);
        else openSummaryMonth(Number(btn.dataset.year), Number(btn.dataset.month));
    });
}

export { renderSummary, initSummary, periodStats, waterStats };
