import { rules } from './rules.js';
import { state } from './state.js';
import { localDate } from './helpers.js';

const MEALS = {
    breakfast: { label: '早餐', icon: 'free_breakfast' },
    lunch:     { label: '午餐', icon: 'lunch_dining' },
    pre_workout:  { label: '练前餐', icon: 'sprint' },
    post_workout: { label: '练后餐', icon: 'sports_score' },
    dinner:    { label: '晚餐', icon: 'dinner_dining' },
    snack:     { label: '加餐', icon: 'nutrition' }
};

const MEAL_ORDER = Object.keys(MEALS);

const MACRO_KEYS = ['kcal', 'protein', 'carbs', 'fat'];

const MACRO_ICONS = { kcal: 'bolt', protein: 'egg_alt', carbs: 'rice_bowl', fat: 'water_drop' };

const macroIcon = key => `<span class="ms mi" aria-hidden="true">${MACRO_ICONS[key]}</span>`;

// ── Targets (Mifflin-St Jeor) ──
const autoWaterTarget = weight => Math.round(weight * 35 / 50) * 50;

function computePlan(user) {
    const { height, weight, activity, age = 27, gender = 'male' } = user;
    const bmr = 10 * weight + 6.25 * height - 5 * age + (gender === 'male' ? 5 : -161);
    const tdee = bmr * parseFloat(activity);
    const kcal = Math.round(tdee - 550);
    const protein = Math.round(weight * 2.1);
    const fat = Math.round((kcal * 0.25) / 9);
    const carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
    const water = user.waterTarget || autoWaterTarget(weight);
    return { bmr, tdee, kcal, protein, carbs, fat, water };
}

// A carb-cycling type picked for a date shifts that date's carbs and fat by gram offsets from the
// auto plan. Protein and the base kcal stay on the plan, so every type follows weight changes.
const DAY_TYPES = { high: '高碳日', medium: '中碳日', low: '低碳日' };

function applyOffset(plan, offset) {
    const carbs = Math.max(0, plan.carbs + offset.carbs);
    const fat = Math.max(0, plan.fat + offset.fat);
    return { ...plan, carbs, fat, kcal: plan.kcal + (carbs - plan.carbs) * 4 + (fat - plan.fat) * 9 };
}

function targetsFor(date) {
    const plan = computePlan(state.user);
    const offset = state.dayTypes[state.dayPlan[date]];
    return offset ? applyOffset(plan, offset) : plan;
}

function sumEntries(entries) {
    const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    entries.forEach(e => MACRO_KEYS.forEach(k => { t[k] += e[k]; }));
    return t;
}

// Compliance follows the same global rule as stars and achievements.
function kcalStatus(kcal, targetKcal) {
    const diff = kcal - targetKcal;
    return diff > rules.kcalAbove ? 'over' : diff < -rules.kcalBelow ? 'under' : 'ok';
}

function dayStatus(dateStr, targetKcal) {
    const kcal = sumEntries(state.diary[dateStr] || []).kcal;
    if (kcal <= 0) return { status: 'none', kcal };
    return { status: kcalStatus(kcal, targetKcal), kcal, diff: kcal - targetKcal };
}

// Calendar stars: one for recording, one for kcal in range, one for protein met
function dayStars(dateStr) {
    const t = sumEntries(state.diary[dateStr] || []);
    if (t.kcal <= 0) return 0;
    const target = targetsFor(dateStr);
    return 1 + (kcalStatus(t.kcal, target.kcal) === 'ok') + (t.protein >= target.protein * rules.proteinPercent / 100);
}

// Consecutive recorded days ending today; an unrecorded today doesn't break the streak yet
function recordingStreak() {
    const d = new Date();
    if (!(state.diary[localDate(d)] || []).length) d.setDate(d.getDate() - 1);
    let n = 0;
    while ((state.diary[localDate(d)] || []).length) { n++; d.setDate(d.getDate() - 1); }
    return n;
}

// Finish line sits at 80% of the track so up to 125% of target stays visible
const FINISH_SCALE = 1.25;

const MACRO_META = { kcal: ['热量', 'kcal'], protein: ['蛋白', 'g'], carbs: ['碳水', 'g'], fat: ['脂肪', 'g'] };

export { sumEntries, kcalStatus, targetsFor, MEAL_ORDER, MEALS, macroIcon, recordingStreak, MACRO_KEYS, FINISH_SCALE, computePlan, autoWaterTarget, DAY_TYPES, MACRO_META, applyOffset, dayStatus, dayStars };
