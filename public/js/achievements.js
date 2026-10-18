import { fmt1, fmtKg, localDate, parseLocalDate, $, fmt, fmtMonthDay, reduceMotion } from './helpers.js';
import { unitText, unitBase } from './foods.js';
import { sumEntries, kcalStatus, targetsFor } from './nutrition.js';
import { state } from './state.js';
import { api } from './api.js';
import { showToast, replay } from './ui.js';
import { renderLevel } from './level.js';

// ── Achievements ──
// Each series is one badge; a tier unlocks the first day its metric reaches the threshold.
// Unlocked tiers persist as "series:threshold" so later stat drops never revoke them.
const ACHIEVEMENTS = [
    { id: 'record_streak',  group: 'streak',    name: '坚持记录',   desc: '连续每天都有记录',                         unit: '天',   tiers: [3, 7, 14, 30, 60, 100, 365] },
    { id: 'ok_streak',      group: 'streak',    name: '稳定达标',   desc: '连续热量达标',                             unit: '天',   tiers: [3, 7, 14, 30, 60, 100] },
    { id: 'protein_streak', group: 'streak',    name: '蛋白质战士', desc: '连续蛋白质吃够目标',                       unit: '天',   tiers: [3, 7, 14, 30] },
    { id: 'perfect_streak', group: 'streak',    name: '完美一天',   desc: '热量达标、蛋白质吃够，碳水和脂肪不超目标 5%', unit: '天',   tiers: [1, 3, 7] },
    { id: 'star_streak',    group: 'streak',    name: '三星连击',   desc: '连续拿满三星：有记录、热量达标、蛋白质吃够', unit: '天',   tiers: [3, 7, 14, 30] },
    { id: 'meals_streak',   group: 'streak',    name: '三餐齐全',   desc: '连续记录早餐、午餐和晚餐',                 unit: '天',   tiers: [1, 7, 30] },
    { id: 'record_days',    group: 'total',     name: '记录老手',   desc: '累计有记录的天数',                         unit: '天',   tiers: [10, 50, 100, 365] },
    { id: 'ok_days',        group: 'total',     name: '达标达人',   desc: '累计热量达标的天数',                       unit: '天',   tiers: [10, 50, 100, 200] },
    { id: 'star_days',      group: 'total',     name: '三星收藏家', desc: '累计拿满三星的天数',                       unit: '天',   tiers: [10, 50, 100, 365] },
    { id: 'star_total',     group: 'total',     name: '星星锻造师', desc: '累计获得的星星，每天最多 3 颗',            unit: '颗',   tiers: [30, 100, 300, 1000] },
    { id: 'entries',        group: 'total',     name: '数据狂人',   desc: '累计记录条目',                             unit: '条',   tiers: [100, 500, 1000, 5000] },
    { id: 'workouts',       group: 'total',     name: '训练打卡',   desc: '累计记录了练后餐的天数',                   unit: '天',   tiers: [10, 50, 100] },
    { id: 'foods',          group: 'food',      name: '美食家',     desc: '累计吃过的不同仓库食品',                   unit: '种',   tiers: [10, 25, 50] },
    { id: 'eggs',           group: 'food',      name: '鸡蛋终结者', desc: '累计吃掉的鸡蛋',                           unit: '颗',   tiers: [50, 100, 200, 500, 1000] },
    { id: 'chicken',        group: 'food',      name: '鸡胸肉狂魔', desc: '累计吃掉的鸡胸肉',                         unit: 'kg',   tiers: [5, 10, 25, 50, 100], format: fmt1 },
    { id: 'rice',           group: 'food',      name: '干饭人',     desc: '累计吃掉的米饭',                           unit: 'kg',   tiers: [5, 10, 25, 50], format: fmt1 },
    { id: 'oats',           group: 'food',      name: '燕麦信徒',   desc: '累计吃掉的燕麦',                           unit: 'kg',   tiers: [1, 3, 5, 10], format: fmt1 },
    { id: 'protein_powder', group: 'food',      name: '摇摇杯大师', desc: '累计喝掉的蛋白粉',                         unit: '勺',   tiers: [30, 100, 300, 500] },
    { id: 'nuts',           group: 'food',      name: '坚果松鼠',   desc: '累计吃掉的坚果',                           unit: 'kg',   tiers: [1, 3, 5, 10], format: fmt1 },
    { id: 'full_months',    group: 'period',    name: '全勤月',     desc: '一个自然月每天都有记录',                   unit: '个月', tiers: [1, 3, 6, 12] },
    { id: 'great_months',   group: 'period',    name: '优秀月',     desc: '一个月记录至少 20 天，且达标率不低于 80%', unit: '个月', tiers: [1, 3, 6, 12] },
    { id: 'perfect_weeks',  group: 'period',    name: '完美周',     desc: '周一到周日每天热量达标',                   unit: '周',   tiers: [1, 4, 12] },
    { id: 'weight_loss',    group: 'weight',    name: '减重里程碑', desc: '相比第一次称重累计减掉的体重',             unit: 'kg',   tiers: [1, 3, 5, 10, 15, 20], format: fmtKg },
    { id: 'weigh_weeks',    group: 'weight',    name: '坚持称重',   desc: '连续每周至少称重一次',                     unit: '周',   tiers: [4, 12, 26, 52] },
    { id: 'new_lows',       group: 'weight',    name: '刷新最低',   desc: '体重创下新低的次数',                       unit: '次',   tiers: [1, 5, 10, 20] },
    { id: 'goal_weight',    group: 'weight',    name: '目标体重',   desc: '从第一次称重到目标体重的完成度',           unit: '%',    tiers: [25, 50, 75, 100] },
    { id: 'bmi',            group: 'weight',    name: 'BMI 达标',   desc: 'BMI 降到 28 以下告别肥胖，降到 24 以下告别超重', unit: '以下', tiers: [28, 24], lower: true, format: fmt1 },
    { id: 'water_streak',   group: 'water',     name: '水分满格',   desc: '连续每天喝够饮水目标',                     unit: '天',   tiers: [3, 7, 14, 30, 60, 100] },
    { id: 'water_days',     group: 'water',     name: '饮水达人',   desc: '累计喝够饮水目标的天数',                   unit: '天',   tiers: [10, 50, 100, 365] },
    { id: 'water_total',    group: 'water',     name: '人形水库',   desc: '累计喝掉的水',                             unit: 'L',    tiers: [100, 500, 1000, 3000] },
    { id: 'first_entry',    group: 'milestone', name: '第一步',     desc: '记下第一笔',                               unit: '条',   tiers: [1] },
    { id: 'comebacks',      group: 'milestone', name: '重新出发',   desc: '中断 3 天以上后重新开始记录',              unit: '次',   tiers: [1] }
];

const ACHIEVEMENT_GROUPS = { all: '全部', streak: '连续', total: '累计', period: '周期', food: '食物', weight: '体重', water: '饮水', milestone: '里程碑' };

// Food counters match warehouse foods by category or name. Amounts are logged in the food's own
// unit, so `factor` converts them: eggs count 粒 directly, weighed foods turn grams into kg, and
// protein powder becomes servings (its units mix "1 scoop" and "31g")
const perKg = f => unitText(f.unit).trim().toLowerCase() === 'g' ? 1 / 1000 : 0;

const FOOD_KINDS = [
    { id: 'eggs',           match: f => /鸡蛋/.test(f.category) || (/蛋/.test(f.name) && !/蛋白/.test(f.name)), factor: f => f.unit.includes('粒') ? 1 : 0 },
    { id: 'protein_powder', match: f => /蛋白粉/.test(f.category) || /whey|蛋白粉/i.test(f.name),           factor: f => 1 / unitBase(f.unit) },
    { id: 'chicken',        match: f => /鸡胸/.test(f.name),                                                 factor: perKg },
    { id: 'rice',           match: f => /米饭/.test(f.category) || /米饭/.test(f.name),                      factor: perKg },
    { id: 'oats',           match: f => /燕麦/.test(f.category + f.name),                                    factor: perKg },
    { id: 'nuts',           match: f => /坚果/.test(f.category),                                             factor: perKg }
];

const MEDALS = ['bronze', 'silver', 'gold', 'diamond'];

const tierMetal = (i, count) => count === 1 ? 'gold' : MEDALS[Math.round(i * 3 / (count - 1))];

const tierName = (a, tier) => a.tiers.length > 1 ? `${a.name} · ${tier} ${a.unit}` : a.name;

// `lower` series improve downward: a tier unlocks once the value drops strictly below it.
// Replays history day by day. Target-based checks only count finished days (today can
// still go over), and an unfinished today never breaks a streak. Streak values are the
// current run, so progress toward the next tier reads "current / next".
function evaluateAchievements(diary, weights, water, user, foodList, dayTargets, today = localDate()) {
    const progress = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, { value: a.lower ? null : 0, reached: [] }]));
    if (!user.targetWeight) progress.goal_weight.unavailable = '先在「身体数据」设定目标体重';
    if (!weights.some(w => w.date <= today)) progress.bmi.unavailable = '记录第一次称重后开始计算';
    const weightByDate = Object.fromEntries(weights.map(w => [w.date, w.weight]));
    const first = [...Object.keys(diary).filter(ds => diary[ds].length), ...Object.keys(weightByDate),
        ...Object.keys(water).filter(ds => water[ds].length)]
        .filter(ds => ds <= today).sort()[0];
    if (!first) return progress;

    const run = { record: 0, ok: 0, protein: 0, perfect: 0, star: 0, meals: 0, weigh: 0, water: 0 };
    const total = { waterDays: 0, waterMl: 0, recordDays: 0, okDays: 0, starDays: 0, stars: 0, entries: 0, workouts: 0, fullMonths: 0, greatMonths: 0, perfectWeeks: 0, comebacks: 0, newLows: 0 };
    const foods = new Set();
    const month = { recorded: 0, tracked: 0, ok: 0 };
    let weekOk = 0, gap = 0, weekWeighed = false;
    let startWeight = null, minWeight = Infinity, lossKg = 0, goalPct = 0, bmi = null;
    const foodKinds = new Map();
    for (const f of foodList) {
        const kind = FOOD_KINDS.find(k => k.match(f));
        const factor = kind && kind.factor(f);
        if (factor) foodKinds.set(f.id, { id: kind.id, factor });
    }
    const eaten = Object.fromEntries(FOOD_KINDS.map(k => [k.id, 0]));

    for (const d = parseLocalDate(first); localDate(d) <= today; d.setDate(d.getDate() + 1)) {
        const ds = localDate(d);
        const targets = dayTargets(ds);
        const list = diary[ds] || [];
        const t = sumEntries(list);
        const finished = ds < today;
        const recorded = list.length > 0;
        const ok = finished && t.kcal > 0 && kcalStatus(t.kcal, targets.kcal) === 'ok';
        const protein = finished && t.protein >= targets.protein;
        const perfect = ok && protein && t.carbs <= targets.carbs * 1.05 && t.fat <= targets.fat * 1.05;
        const meals = ['breakfast', 'lunch', 'dinner'].every(m => list.some(e => e.meal === m));
        // The calendar's dayStars, except the kcal and protein stars wait for the day to finish
        const stars = t.kcal > 0 ? 1 + ok + protein : 0;
        // Unlike kcal, water can't overshoot, so today counts as soon as the goal is reached
        const drank = (water[ds] || []).reduce((sum, w) => sum + w.ml, 0);
        const hydrated = drank > 0 && drank >= targets.water;

        const bump = (key, hit) => { if (hit) run[key]++; else if (finished) run[key] = 0; };
        bump('record', recorded); bump('ok', ok); bump('protein', protein); bump('perfect', perfect); bump('star', stars === 3); bump('meals', meals); bump('water', hydrated);

        if (recorded && gap >= 3 && total.recordDays > 0) total.comebacks++;
        gap = recorded ? 0 : finished ? gap + 1 : gap;
        total.recordDays += recorded;
        total.okDays += ok;
        total.starDays += stars === 3;
        total.stars += stars;
        total.waterDays += hydrated;
        total.waterMl += drank;
        total.entries += list.length;
        total.workouts += list.some(e => e.meal === 'post_workout');
        list.forEach(e => {
            if (e.isTemporary || !e.foodId) return;
            foods.add(e.foodId);
            const kind = foodKinds.get(e.foodId);
            if (kind) eaten[kind.id] += e.rawAmount * kind.factor;
        });

        if (d.getDate() === 1) Object.assign(month, { recorded: 0, tracked: 0, ok: 0 });
        month.recorded += recorded;
        month.tracked += t.kcal > 0;
        month.ok += ok;
        const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        if (d.getDate() === daysInMonth) {
            total.fullMonths += month.recorded === daysInMonth;
            total.greatMonths += finished && month.tracked >= 20 && month.ok / month.tracked >= 0.8;
        }

        // Weeks run Monday to Sunday; a week without a weigh-in only breaks the run once it is over
        if (d.getDay() === 1) {
            weekOk = 0;
            if (!weekWeighed) run.weigh = 0;
            weekWeighed = false;
        }
        weekOk += ok;
        if (d.getDay() === 0 && weekOk === 7) total.perfectWeeks++;

        const weight = weightByDate[ds];
        if (weight !== undefined) {
            if (!weekWeighed) { run.weigh++; weekWeighed = true; }
            if (startWeight === null) startWeight = weight;
            else if (weight < minWeight) total.newLows++;
            minWeight = Math.min(minWeight, weight);
            lossKg = Math.max(0, Math.round((startWeight - weight) * 100) / 100);
            // Floored (with an epsilon for float noise) so the shown value never rounds up past a threshold
            if (user.targetWeight && user.targetWeight !== startWeight) {
                goalPct = Math.min(100, Math.max(0, Math.floor((startWeight - weight) / (startWeight - user.targetWeight) * 100 + 1e-9)));
            }
            bmi = Math.floor(weight / (user.height / 100) ** 2 * 10 + 1e-9) / 10;
        }

        const values = {
            record_streak: run.record, ok_streak: run.ok, protein_streak: run.protein,
            perfect_streak: run.perfect, star_streak: run.star, meals_streak: run.meals,
            record_days: total.recordDays, ok_days: total.okDays, star_days: total.starDays, star_total: total.stars, entries: total.entries,
            workouts: total.workouts, foods: foods.size, full_months: total.fullMonths,
            great_months: total.greatMonths, perfect_weeks: total.perfectWeeks,
            weight_loss: lossKg, weigh_weeks: run.weigh, new_lows: total.newLows, goal_weight: goalPct, bmi,
            // Floored so the shown value never rounds up past a threshold it hasn't reached
            eggs: Math.floor(eaten.eggs + 1e-9), protein_powder: Math.floor(eaten.protein_powder + 1e-9),
            chicken: Math.floor(eaten.chicken * 10 + 1e-9) / 10, rice: Math.floor(eaten.rice * 10 + 1e-9) / 10,
            oats: Math.floor(eaten.oats * 10 + 1e-9) / 10, nuts: Math.floor(eaten.nuts * 10 + 1e-9) / 10,
            first_entry: total.entries, comebacks: total.comebacks,
            water_streak: run.water, water_days: total.waterDays, water_total: Math.floor(total.waterMl / 1000)
        };
        for (const a of ACHIEVEMENTS) {
            const p = progress[a.id];
            p.value = values[a.id];
            if (a.lower && p.base === undefined && p.value !== null) p.base = p.value;
            const hit = tier => a.lower ? p.value !== null && p.value < tier : p.value >= tier;
            while (p.reached.length < a.tiers.length && hit(a.tiers[p.reached.length])) p.reached.push(ds);
        }
    }
    return progress;
}

// Fire-and-forget after any data change; marks tiers locally first so overlapping calls don't double-announce.
// Every data change routes through here, so it also refreshes the level.
async function syncAchievements() {
    try { await unlockAchievements(); } finally { renderLevel(); }
}

async function unlockAchievements() {
    const progress = evaluateAchievements(state.diary, state.weights, state.water, state.user, state.foods, targetsFor);
    const unlocks = ACHIEVEMENTS.flatMap(a => progress[a.id].reached.map((date, i) =>
        ({ id: `${a.id}:${a.tiers[i]}`, date, label: tierName(a, a.tiers[i]) })))
        .filter(u => !state.achievements[u.id]);
    if (!unlocks.length) return;

    unlocks.forEach(u => { state.achievements[u.id] = u.date; });
    try {
        await api('/api/achievements', 'POST', { unlocks: unlocks.map(({ id, date }) => ({ id, date })) });
    } catch {
        unlocks.forEach(u => { delete state.achievements[u.id]; });
        return;
    }
    showToast(unlocks.length === 1 ? `解锁勋章「${unlocks[0].label}」` : `解锁了 ${unlocks.length} 枚勋章，去成就页看看`, 'award');
}

// Tiers this viewer has already been shown; only decides the one-time burst, so losing it is harmless
let seenBadges = new Set();

const BURST_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

const badgeViews = new Map();

function renderAchievements() {
    const progress = evaluateAchievements(state.diary, state.weights, state.water, state.user, state.foods, targetsFor);
    let unlockedCount = 0, tierCount = 0;

    // Unlocked series first; sort is stable, so each half keeps the definition order
    const rows = ACHIEVEMENTS
        .map(a => ({ a, ids: a.tiers.map(tier => `${a.id}:${tier}`) }))
        .map(r => ({ ...r, dates: r.ids.map(id => state.achievements[id]) }))
        .sort((x, y) => !x.dates.some(Boolean) - !y.dates.some(Boolean));

    $('badge-grid').innerHTML = rows.map(({ a, ids, dates }) => {
        const level = dates.filter(Boolean).length;
        unlockedCount += level;
        tierCount += a.tiers.length;

        const next = a.tiers[level];
        const p = progress[a.id];
        const value = p.value;
        const f = a.format || fmt;
        const metal = level ? tierMetal(level - 1, a.tiers.length) : 'locked';
        const latest = dates.filter(Boolean).sort().at(-1);
        const isNew = ids.some((id, t) => dates[t] && !seenBadges.has(id));
        const tiers = a.tiers.length > 1
            ? `<div class="tier-row">${a.tiers.map((tier, i) => `<span class="tier num${dates[i] ? ' is-on' : ''}"${dates[i] ? ` title="${fmtMonthDay(dates[i])}解锁"` : ''}>${tier}</span>`).join('')}</div>`
            : '';
        let prog;
        if (next === undefined) prog = `<div class="badge-prog">${a.tiers.length > 1 ? '已满级' : '已获得'}</div>`;
        else if (p.unavailable) prog = `<div class="badge-prog">${p.unavailable}</div>`;
        else {
            // A `lower` bar fills from the first recorded value down to the next threshold
            const ratio = a.lower ? (p.base > next ? (p.base - value) / (p.base - next) : 0) : value / next;
            const text = a.lower
                ? `<b class="num">${f(value)}</b> → ${f(next)} ${a.unit}`
                : `<b class="num">${f(Math.min(value, next))}</b> / ${f(next)} ${a.unit}`;
            prog = `<div class="badge-prog"><span class="badge-bar" aria-hidden="true"><i style="width:${Math.min(Math.max(ratio, 0), 1) * 100}%"></i></span><span>${text}</span></div>`;
        }

        const sparks = metal === 'diamond' ? '<i class="spark"></i><i class="spark"></i><i class="spark"></i>' : '';
        const burst = isNew ? `<span class="burst" aria-hidden="true">${BURST_ANGLES.map(deg => `<i style="--a:${deg}deg"></i>`).join('')}</span>` : '';
        badgeViews.set(a.id, { a, dates, metal, level, prog });
        return `<li class="badge m-${metal}${isNew ? ' is-new' : ''}" data-group="${a.group}" data-id="${a.id}">
                <button type="button" class="badge-open" aria-haspopup="dialog" aria-label="查看「${a.name}」详情"></button>
                <span class="medal"><img src="badges/${a.id}.webp" alt="" width="42" height="42" loading="lazy" decoding="async">${sparks}${burst}</span>
                <div class="badge-body">
                    <div class="badge-head"><h3>${a.name}${isNew ? '<span class="new-chip">NEW</span>' : ''}</h3><span>${latest ? `${fmtMonthDay(latest)}解锁` : '未解锁'}</span></div>
                    <p>${a.desc}</p>
                    ${tiers}
                    ${prog}
                </div>
            </li>`;
    }).join('');
    $('achievements-count').textContent = `已解锁 ${unlockedCount} / ${tierCount}`;
    filterBadges();
    replay($('badge-grid'), 'is-entering');

    Object.keys(state.achievements).forEach(id => seenBadges.add(id));
    try { localStorage.setItem('macro_tracker_seen_badges', JSON.stringify([...seenBadges])); } catch { /* storage unavailable */ }
}

// ── Badge detail ──
const METAL_NAMES = { bronze: '铜牌', silver: '银牌', gold: '金牌', diamond: '钻石' };

// Higher tiers land harder: more particles, and gold and up get a second shockwave
const BURST_COUNT = { bronze: 10, silver: 14, gold: 18, diamond: 24 };

function landingFxHtml(metal) {
    if (metal === 'locked') return '';
    const n = BURST_COUNT[metal];
    const bits = Array.from({ length: n }, (_, i) =>
        `<i class="bd-bit" style="--a:${Math.round(360 / n * i + Math.random() * 20)}deg;--d:${Math.round(70 + Math.random() * 80)}px;--s:${(.5 + Math.random() * .8).toFixed(2)};--t:${Math.round(Math.random() * 90)}ms"></i>`).join('');
    const rings = metal === 'gold' || metal === 'diamond' ? '<i class="bd-ring"></i><i class="bd-ring"></i>' : '<i class="bd-ring"></i>';
    return `<span class="bd-rays" aria-hidden="true"></span><span class="bd-fx" aria-hidden="true"><i class="bd-flash"></i>${rings}${bits}</span>`;
}

let badgeSource = null;

function badgeDetailHtml({ a, dates, metal, level, prog }) {
    const levelText = metal === 'locked' ? '未解锁'
        : a.tiers.length > 1 ? `${METAL_NAMES[metal]} · ${level} / ${a.tiers.length} 级` : METAL_NAMES[metal];
    const sparks = metal === 'diamond' ? '<i class="spark"></i><i class="spark"></i><i class="spark"></i>' : '';
    const tiers = a.tiers.map((tier, i) => `
        <li class="${dates[i] ? 'is-on' : ''}" style="--j:${i}">
            <span class="tier num${dates[i] ? ' is-on' : ''}">${tier}</span><span>${a.unit}</span>
            <span class="bd-date">${dates[i] ? `${fmtMonthDay(dates[i])}解锁` : '未达成'}</span>
        </li>`).join('');
    return `<div class="bd-stage badge m-${metal}">
            ${landingFxHtml(metal)}
            <span class="medal"><img src="badges/${a.id}.webp" alt="">${sparks}</span>
            <div class="bd-card" tabindex="-1" autofocus>
                <button type="button" class="icon-btn bd-close" aria-label="关闭"><span class="ms" aria-hidden="true">close</span></button>
                <p class="bd-level">${levelText}</p>
                <h2 id="bd-name">${a.name}</h2>
                <p class="bd-desc">${a.desc}</p>
                <ol class="bd-tiers">${tiers}</ol>
                ${prog}
            </div>
        </div>`;
}

// Transform that puts the dialog medal exactly over the grid medal it came from
function medalOffset(from, to) {
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    return `perspective(700px) translate(${dx}px, ${dy}px) scale(${a.width / b.width})`;
}

function openBadge(li) {
    const view = badgeViews.get(li.dataset.id);
    const dlg = $('badge-dialog');
    if (!view || dlg.open) return;
    dlg.innerHTML = badgeDetailHtml(view);
    dlg.showModal();
    badgeSource = li.querySelector('.medal');
    if (reduceMotion.matches) return;

    const medal = dlg.querySelector('.medal');
    // An unlocked medal flips once on the way in, like a coin being turned over
    const spin = view.metal === 'locked' ? 'rotateY(0deg)' : 'rotateY(-360deg)';
    badgeSource.style.visibility = 'hidden';
    medal.animate(
        [{ transform: `${medalOffset(badgeSource, medal)} ${spin}` }, { transform: 'perspective(700px) translate(0, 0) scale(1) rotateY(0deg)' }],
        { duration: 700, easing: 'cubic-bezier(.22, 1.25, .36, 1)' });
    dlg.querySelector('.bd-card').animate(
        [{ opacity: 0, transform: 'translateY(28px) scale(.94)' }, { opacity: 1, transform: 'none' }],
        { duration: 420, delay: 140, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' });
    dlg.animate({ opacity: [0, 1] }, { duration: 260, pseudoElement: '::backdrop' });
}

// Plays the opening in reverse: the card folds up into the medal, then the medal flips back
// into its grid slot while the backdrop clears
function closeBadge() {
    const dlg = $('badge-dialog');
    if (!dlg.open || dlg.dataset.closing) return;
    const source = badgeSource;
    // The grid may have re-rendered while open; then there is nowhere to fly back to
    if (reduceMotion.matches || !source?.isConnected) return dlg.close();

    dlg.dataset.closing = '1';
    const medal = dlg.querySelector('.medal');
    // The hidden grid medal takes over at landing; line its glow, sheen and sparkle loops up
    // with the flying medal's so the hand-off shows no change
    const loops = el => new Map(el.getAnimations({ subtree: true })
        .filter(a => a instanceof CSSAnimation)
        .map(a => [`${a.animationName}${a.effect.pseudoElement ?? ''}${[...el.children].indexOf(a.effect.target)}`, a]));
    const flying = loops(medal);
    loops(source).forEach((a, k) => { if (flying.has(k)) a.currentTime = flying.get(k).currentTime; });
    const view = badgeViews.get(source.closest('.badge').dataset.id);
    const rx = medal.style.getPropertyValue('--rx') || '0deg';
    const ry = medal.style.getPropertyValue('--ry') || '0deg';
    // Measure the untilted layout box; the first keyframe re-applies the tilt, so nothing jumps
    medal.style.transition = 'none';
    medal.style.removeProperty('--rx');
    medal.style.removeProperty('--ry');
    const spin = view?.metal === 'locked' ? '0deg' : '-360deg';
    const flight = { duration: 560, delay: 90, easing: 'cubic-bezier(.55, 0, .25, 1)', fill: 'both' };

    dlg.querySelector('.bd-rays')?.animate({ opacity: [.55, 0] }, { duration: 200, fill: 'forwards' });
    dlg.querySelector('.bd-card').animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-36px) scale(.86)' }],
        { duration: 260, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
    const back = medal.animate(
        [{ transform: `perspective(700px) translate(0, 0) scale(1) rotateX(${rx}) rotateY(${ry})` },
         { transform: `${medalOffset(source, medal)} rotateX(0deg) rotateY(${spin})` }],
        flight);
    dlg.animate({ opacity: [1, 0] }, { ...flight, easing: 'ease-in-out', pseudoElement: '::backdrop' });

    // The two medals now overlap exactly; a short cross-fade hides the last resampling difference
    back.finished.then(() => {
        source.style.visibility = '';
        medal.animate({ opacity: [1, 0] }, { duration: 120, fill: 'forwards' }).finished.then(() => dlg.close());
    }, () => dlg.close());
}

// The entrance stagger counts only visible badges, so a filtered tab doesn't wait on hidden ones
function filterBadges() {
    const group = document.querySelector('input[name="badge-group"]:checked').value;
    let i = 0;
    document.querySelectorAll('#badge-grid .badge').forEach(li => {
        li.hidden = group !== 'all' && li.dataset.group !== group;
        if (!li.hidden) li.style.setProperty('--i', i++);
    });
}

function initAchievements() {
    try {
        seenBadges = new Set(JSON.parse(localStorage.getItem('macro_tracker_seen_badges') || '[]'));
    } catch { seenBadges = new Set(); }

    $('badge-grid').addEventListener('click', e => {
        const btn = e.target.closest('.badge-open');
        if (btn) openBadge(btn.closest('.badge'));
    });

    $('badge-dialog').addEventListener('cancel', e => { e.preventDefault(); closeBadge(); });

    // Restores the grid medal however the dialog ends up closing
    $('badge-dialog').addEventListener('close', e => {
        delete e.currentTarget.dataset.closing;
        e.currentTarget.querySelector('.medal')?.style.removeProperty('transition');
        if (badgeSource) badgeSource.style.visibility = '';
        badgeSource = null;
    });

    $('badge-dialog').addEventListener('click', e => {
        if (e.target === e.currentTarget || e.target.closest('.bd-close')) closeBadge();
    });

    // Subtle 3D tilt toward the pointer while the detail is open
    $('badge-dialog').addEventListener('pointermove', e => {
        const medal = e.currentTarget.querySelector('.medal');
        if (!medal || reduceMotion.matches || e.currentTarget.dataset.closing) return;
        const r = medal.getBoundingClientRect();
        const clamp = v => Math.max(-1, Math.min(1, v));
        medal.style.setProperty('--ry', `${clamp((e.clientX - r.left - r.width / 2) / 160) * 14}deg`);
        medal.style.setProperty('--rx', `${clamp((r.top + r.height / 2 - e.clientY) / 160) * 14}deg`);
    });

    $('badge-dialog').addEventListener('pointerleave', e => {
        e.currentTarget.querySelector('.medal')?.style.removeProperty('--rx');
        e.currentTarget.querySelector('.medal')?.style.removeProperty('--ry');
    });

    $('badge-tabs').innerHTML = Object.entries(ACHIEVEMENT_GROUPS).map(([value, label], i) => `
        <label><input type="radio" name="badge-group" value="${value}"${i ? '' : ' checked'}><span class="seg-opt">${label}</span></label>`).join('');
    $('badge-tabs').addEventListener('change', filterBadges);
}

export { renderAchievements, initAchievements, syncAchievements, evaluateAchievements, ACHIEVEMENTS, tierMetal };
